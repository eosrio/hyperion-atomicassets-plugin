import assert from 'node:assert/strict';
import {assertRunInput as prior} from '../jsonb-display-bson-v3/run-contract-v3.mjs';
export const PROFILE='schema-id-display-mongo-host-sdk-v1';
export const ACCEPTANCE=Object.freeze({scope:'synthetic-source-schema-id-collection-display-only',physicalMongoHTTP:'pending',originalSQLCases:63,sourceAccepted:27,sourceRefused:6,sourceOrImportPending:30,fullSchemaEndpoint:'pending',otherJoins:'pending',fullAtomicParity:'pending'});
export function assertRunInput(value){assert.equal(value.profile,PROFILE);prior({...value,profile:'atomic79-hapi7270-jsonb-display-id-bson-host-sdk-mongo-http-v3'});}
