import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

// Resolve from the actual consumers, including nested installs after npm ci.
const require = createRequire(import.meta.url);
const adapterRequire = createRequire(require.resolve('@opennextjs/cloudflare'));
const awsRequire = createRequire(adapterRequire.resolve('@opennextjs/aws/build/helper.js'));
const minifyRequire = createRequire(awsRequire.resolve('@node-minify/core'));

test('OpenNext glob APIs still find manifests and respect ignore patterns', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'barber-glob-'));
  try {
    await mkdir(path.join(dir, 'server'));
    await mkdir(path.join(dir, 'ignored'));
    await writeFile(path.join(dir, 'server', 'page.nft.json'), '{}');
    await writeFile(path.join(dir, 'ignored', 'skip.nft.json'), '{}');
    const { glob, globSync } = adapterRequire('glob');
    const options = { cwd: dir, nodir: true, ignore: ['ignored/**'], posix: true };
    assert.deepEqual(globSync('**/*.nft.json', options), ['server/page.nft.json']);
    assert.deepEqual(await glob('**/*.nft.json', options), ['server/page.nft.json']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('node-minify 9 wildcard inputs work with patched glob and existing terser', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'barber-minify-'));
  try {
    await writeFile(path.join(dir, 'input.js'), 'globalThis.answer = 40 + 2;');
    const core = minifyRequire('@node-minify/core');
    const terser = awsRequire('@node-minify/terser');
    const output = path.join(dir, 'result.min.js');
    await (core.default ?? core)({
      compressor: terser.default ?? terser,
      input: path.join(dir, '*.js'),
      output,
    });
    const context = {};
    runInNewContext(await readFile(output, 'utf8'), context);
    assert.equal(context.answer, 42);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
