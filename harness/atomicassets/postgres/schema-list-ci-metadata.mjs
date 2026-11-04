import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const HARNESS_FILES=Object.freeze(['schema-list-ci.mjs','schema-list-ci-admission.mjs','schema-list-ci-metadata.mjs','schema-report-gate.mjs','schema-list-oracle.cjs','sdk50-outcomes.mjs','royalty-template-oracle.mjs','owned-schema-oracle.mjs','schema.cjs','source.mjs','image-identity.mjs','fixture-pin.json','postgres-16.15-linux-amd64.manifest.json','postgres-16.15-linux-amd64.config.json']);
// Inert: paths resolve relative to this module, never the upstream checkout.
export function captureHarnessFiles(files=HARNESS_FILES) {
 return files.map(path=>{const bytes=readFileSync(new URL('./'+path,import.meta.url));return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
}
