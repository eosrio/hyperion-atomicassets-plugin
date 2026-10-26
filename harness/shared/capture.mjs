import {readFile, writeFile} from 'node:fs/promises';
import {executeReferenceFixture, inspectReferenceNamespace} from './reference.mjs';

const args = process.argv.slice(2);
const options = {};
while (args.length) {
  const key = args.shift();
  if (!['--reference-root', '--fixture', '--output', '--inventory', '--namespace-args'].includes(key) || !args.length)
    throw new Error('Use --reference-root PATH --fixture JSON --output JSON, or --inventory atomicassets --namespace-args JSON');
  options[key] = args.shift();
}
const common = {referenceRoot: options['--reference-root']};
const result = options['--inventory']
  ? await inspectReferenceNamespace({...common, namespace: options['--inventory'],
      namespaceArgs: JSON.parse(await readFile(options['--namespace-args'], 'utf8'))})
  : await executeReferenceFixture({...common, fixture: JSON.parse(await readFile(options['--fixture'], 'utf8'))});
if (!options['--output']) throw new Error('--output is required');
await writeFile(options['--output'], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({output: options['--output'], namespace: result.namespace, status: result.response?.status,
  routes: result.inventory.routes.length, databaseQueries: result.database.executed.length, scope: result.scope}));
