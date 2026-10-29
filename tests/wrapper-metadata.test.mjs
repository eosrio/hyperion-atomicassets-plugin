import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('distributed loader metadata identifies its matching Atomic package dependency', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const wrapper = JSON.parse(await readFile(new URL('../legacy/package.json', import.meta.url)));
  assert.equal(wrapper.name, '@eosrio/hyperion-atomicassets-plugin-legacy');
  assert.equal(wrapper.version, pkg.version);
  assert.equal(wrapper.private, true);
  assert.equal(wrapper.type, 'module');
  assert.deepEqual(wrapper.engines, pkg.engines);
  assert.deepEqual(wrapper.dependencies, {[pkg.name]: pkg.version});
  assert.deepEqual(wrapper.allowScripts, pkg.allowScripts);
});
