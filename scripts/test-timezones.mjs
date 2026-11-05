import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const cwd=resolve(import.meta.dirname,'..');
for (const timezone of ['UTC','America/Los_Angeles','Pacific/Kiritimati']) {
  execFileSync(process.execPath,['--experimental-strip-types','--test','tests/finance.test.ts','tests/finance-boundaries.test.ts'],{cwd,env:{...process.env,TZ:timezone},stdio:'pipe'});
  console.log(`PASS: financial date/period tests in ${timezone}`);
}
