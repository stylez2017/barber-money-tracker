import { requireCustomer, apiError, HttpError, type AuthConfig } from './auth.ts';
import { financialDatabase, type AccessConfig } from './access.ts';
import { readJson } from './handlers.ts';
import { DEFAULT_SAVINGS, validSavings, type SavingsPlan } from '../savings.ts';

export async function savingsResponse(request: Request, config: AuthConfig & AccessConfig) {
  try {
    const owner = await requireCustomer(request, config);
    const db = await financialDatabase(config, owner);
    if (request.method === 'GET') {
      const result = await db.prepare('SELECT goal,saved,percent FROM savings_plans WHERE user_id = ?').bind(owner).all<SavingsPlan>();
      return Response.json(result.results[0] ?? DEFAULT_SAVINGS, { headers: { 'Cache-Control':'no-store' } });
    }
    if (request.method !== 'POST') throw new HttpError(405, 'Unsupported method.');
    const plan = await readJson(request);
    if (!validSavings(plan)) throw new HttpError(400, 'Enter a valid savings goal, saved amount and percentage.');
    await db.prepare('INSERT INTO savings_plans(user_id,goal,saved,percent) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET goal=excluded.goal,saved=excluded.saved,percent=excluded.percent')
      .bind(owner, plan.goal, plan.saved, plan.percent).run();
    return Response.json({ saved:true }, { headers: { 'Cache-Control':'no-store' } });
  } catch(error) { return apiError(error); }
}
