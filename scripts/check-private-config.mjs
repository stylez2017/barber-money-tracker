import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// This project's .jsonc file intentionally uses plain JSON so CI can read it
// without downloading an extra parser.
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
assert.equal(config.name, 'barber-money-tracker');
assert.equal(config.workers_dev, false, 'Production URL must stay disabled');
assert.equal(config.preview_urls, false, 'Preview URLs need separate approval');
assert.equal(config.keep_vars, true);
assert.ok(!config.route && !config.routes?.length, 'No public routes are approved');
assert.equal(config.d1_databases.length, 1);
assert.equal(config.d1_databases[0].binding, 'DB');
assert.equal(config.d1_databases[0].database_id, '9b51209f-8131-4368-8688-998a223b4bbd');
assert.equal(config.previews.d1_databases.length, 1);
assert.equal(config.previews.d1_databases[0].binding, 'DB');
assert.equal(config.previews.d1_databases[0].database_id, '619d4116-48f6-47a0-b063-b1686be45c3f');
assert.notEqual(config.previews.d1_databases[0].database_id, config.d1_databases[0].database_id);
console.log('Private URL settings and isolated test database configuration verified.');
