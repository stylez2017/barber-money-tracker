import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Authenticated routes use uncached server responses; no ISR cache is configured.
export default defineCloudflareConfig({});
