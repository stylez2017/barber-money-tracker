import { billingResponse } from '../../../../lib/server/billing-handlers';
import { runtimeConfig } from '../../../../lib/server/runtime';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return billingResponse(request, await runtimeConfig(), 'portal'); }
