import { sessionResponse } from '../../../lib/server/handlers';
import { runtimeConfig } from '../../../lib/server/runtime';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return sessionResponse(request, await runtimeConfig()); }
