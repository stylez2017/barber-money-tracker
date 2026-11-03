import type Stripe from 'stripe';
import { BillingService, type BillingConfig } from './billing.ts';
import { apiError, HttpError, requireCustomer, type AuthConfig } from './auth.ts';
import { deleteRecord, importRecords, readRecords, saveRecord, transactionInput, type Database } from './storage.ts';

const headers = { 'Cache-Control': 'no-store' };
export async function sessionResponse(request: Request, config: AuthConfig) {
  try { return Response.json({ userId: await requireCustomer(request, config) }, { headers }); }
  catch (error) { return apiError(error); }
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Use JSON for this request.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256_000) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON request.');
  } finally { reader.releaseLock(); }
}
export async function transactionResponse(request: Request, config: AuthConfig & BillingConfig, client?: Stripe) {
  try {
    const owner = await requireCustomer(request, config);
    if (!config.DB) throw new HttpError(503, 'Financial storage is not configured.');
    await new BillingService(config, client).requirePaid(owner);
    if (request.method === 'GET') {
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some(key => key !== 'after')) throw new HttpError(400, 'Unsupported query.');
      const after = query.get('after') ?? '';
      if (after.length > 128) throw new HttpError(400, 'Invalid record cursor.');
      const rows = await readRecords(config.DB, owner, after);
      return Response.json({ rows, next: rows.length === 500 ? rows.at(-1)!.id : null }, { headers });
    }
    if (request.method !== 'POST') throw new HttpError(405, 'Unsupported method.');
    const body = await readJson(request);
    const allowed = body.operation === 'save' ? ['operation','transaction'] : body.operation === 'delete' ? ['operation','id'] : ['operation','rows'];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, 'Unsupported request field.');
    if (body.operation === 'save') await saveRecord(config.DB, owner, transactionInput(body.transaction));
    else if (body.operation === 'delete') {
      if (typeof body.id !== 'string' || !body.id.length || body.id.length > 128) throw new HttpError(400, 'Invalid record ID.');
      await deleteRecord(config.DB, owner, body.id);
    } else if (body.operation === 'import') {
      if (!Array.isArray(body.rows) || body.rows.length > 100) throw new HttpError(400, 'Import at most 100 records per request.');
      await importRecords(config.DB, owner, body.rows.map(transactionInput));
    } else throw new HttpError(400, 'Unsupported operation.');
    return Response.json({ saved: true }, { headers });
  } catch (error) { return apiError(error); }
}
