import AccountApp from './account-app';
import { runtimeConfig } from '../lib/server/runtime';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const config = await runtimeConfig();
  // Only this public value is serialized. Secret keys remain on the Worker.
  return <AccountApp publishableKey={config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''}/>;
}
