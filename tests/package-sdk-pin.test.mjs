import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

// The installed-package controls must check the same immutable SDK identity as
// the package and lock, including the consumer's explicit lifecycle allowance.
test('all packed consumers bind the committed SDK repository and commit', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)));
  const pin = pkg.dependencies['@eosrio/hyperion-sdk'];
  const match = /^git\+https:\/\/github\.com\/eosrio\/hyperion-sdk\.git#([a-f0-9]{40})$/.exec(pin);
  assert.ok(match, 'Exact SDK repository and immutable commit required');
  assert.equal(lock.packages[''].dependencies['@eosrio/hyperion-sdk'], pin);
  assert.equal(lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved, pin);
  assert.equal(pkg.allowScripts[`github:eosrio/hyperion-sdk#${match[1]}`], true);
  assert.deepEqual(Object.keys(pkg.allowScripts).filter(key => key.startsWith('github:eosrio/hyperion-sdk#')), [`github:eosrio/hyperion-sdk#${match[1]}`]);
  for (const script of ['check-package.mjs', 'check-config-package.mjs', 'check-royalty-package.mjs', 'check-royalty-rules-package.mjs', 'check-schema-package.mjs']) {
    const source = await readFile(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
    const actual = [...source.matchAll(/(?:git\+https:\/\/github\.com\/eosrio\/hyperion-sdk\.git|github:eosrio\/hyperion-sdk)#([a-f0-9]{40})/g)].map(row => row[1]);
    assert.equal(actual.length, 2, `${script}: exact SDK pin and lifecycle allowance`);
    assert.deepEqual(actual, [match[1], match[1]], `${script}: consumer SDK repository and exact commit`);
  }
});
