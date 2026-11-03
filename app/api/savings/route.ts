import { savingsResponse } from '../../../lib/server/savings-handlers';
import { runtimeConfig } from '../../../lib/server/runtime';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return savingsResponse(request, await runtimeConfig()); }
export async function POST(request: Request) { return savingsResponse(request, await runtimeConfig()); }
