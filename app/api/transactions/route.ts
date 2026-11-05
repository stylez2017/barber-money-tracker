import { transactionResponse } from '../../../lib/server/handlers';
import { runtimeConfig } from '../../../lib/server/runtime';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return transactionResponse(request, await runtimeConfig()); }
export async function POST(request: Request) { return transactionResponse(request, await runtimeConfig()); }
