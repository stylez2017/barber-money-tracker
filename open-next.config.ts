import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// The current app uses browser storage and static pages, with no ISR or server cache.
export default defineCloudflareConfig({});
