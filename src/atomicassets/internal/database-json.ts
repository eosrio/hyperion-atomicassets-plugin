import type {AtomicObject} from '../asset.js';
import {metadataInputRecord, record, unavailable} from './lifecycle-port.js';

/** Only these original action fields enter encodeDatabaseJson; scalar and schema fields do not. */
export function actionMetadataInput(name: string, value: unknown): AtomicObject {
  if (name !== 'logmint' && name !== 'logsetdata') return record(value);
  const raw = metadataInputRecord(value), rest = {...raw};
  for (const field of name === 'logmint' ? ['immutable_data', 'mutable_data'] : ['new_data']) delete rest[field];
  record(rest);
  return raw;
}

/**
 * Original 2.7.0 src/filler/utils.ts encodeDatabaseJson, at metadata storage boundaries only.
 * JSON.parse models only JSON syntax/value conversion, never PostgreSQL text extraction.
 * A literal backslash-u0000 can create malformed JSON and must refuse the whole candidate.
 */
export function databaseMetadata(value: unknown): AtomicObject {
  const raw = metadataInputRecord(value);
  // PostgreSQL JSONB rejects unpaired surrogates; do not invent a successful storage value.
  function unicode(v: unknown): void {
    if (typeof v === 'string' && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)) unavailable('Unpaired metadata surrogate');
    if (v !== null && typeof v === 'object') for (const [k, item] of Object.entries(v)) {unicode(k); unicode(item);}
  }
  unicode(raw);
  const encoded = JSON.stringify(raw).replace(/\\u0000/g, ' ');
  try {return record(JSON.parse(encoded));}
  catch {return unavailable('Original metadata encoder produced unsupported or invalid JSON');}
}
