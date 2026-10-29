import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import type {MetadataCodec} from '../atomicassets/internal/lifecycle-port.js';

export const ATOMIC_METADATA_CODEC = Object.freeze({package: '@atomichub/atomicassets', version: '2.2.0',
  sha256: '2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573'} as const);

/** Delegate to the unchanged, licensed original artifact; this is not a replacement decoder. */
export function createAtomicMetadataCodec(): MetadataCodec {
  const path = new URL('../../vendor/atomicassets-2.2.0/build/index.cjs', import.meta.url);
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== ATOMIC_METADATA_CODEC.sha256)
    throw new Error('Atomic metadata codec artifact differs');
  const codec = createRequire(import.meta.url)(fileURLToPath(path)) as {
    convertAttributeMapToObject(value: readonly unknown[]): unknown;
    CachedObjectSchema(format: readonly unknown[]): unknown;
    deserialize(hex: string, schema: unknown): unknown;
  };
  return Object.freeze({sha256: ATOMIC_METADATA_CODEC.sha256,
    attributes: (value: readonly import('../atomicassets/asset.js').AtomicObject[]) => codec.convertAttributeMapToObject(value),
    collection: (hex: string, format: readonly import('../atomicassets/asset.js').AtomicSchemaField[]) =>
      codec.deserialize(hex, codec.CachedObjectSchema(format))});
}
