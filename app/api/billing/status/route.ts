import { billingResponse } from '../../../../lib/server/billing-handlers';
import { runtimeConfig } from '../../../../lib/server/runtime';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return billingResponse(request, await runtimeConfig(), 'status'); }
