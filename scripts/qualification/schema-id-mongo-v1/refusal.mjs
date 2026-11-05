import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AssetDomainUnavailable} from '../../../dist/atomicassets/internal/lifecycle-port.js';
const MESSAGE='Collection codec refused the supported input';
// Capture the actual reducer throw and require that the owner propagates that same object.
// This keeps native/SDK/guard/cleanup failures from becoming synthetic domain refusals.
export async function expectedRefusal({execute,reduce,plan,original}) {
  assert.equal(plan.sourceRepresentable,true);assert.equal(plan.originalSqlAccepted,false);
  assert.equal(original.storageAccepted,false);assert.equal(original.storageError?.code,'22P02');
  assert.equal(plan.originalEncoded,original.encoded);assert.equal(plan.codecAttempt?.originalEncoded,original.encoded);
  assert.equal(createHash('sha256').update(original.encoded).digest('hex'),plan.encodedSha256);
  assert.equal(typeof plan.serializedHex,'string');assert.equal(plan.serializedHex,plan.codecAttempt?.serializedHex);
  assert.equal(plan.originalCallbackWrite?.data,original.encoded);assert.throws(()=>JSON.parse(original.encoded),SyntaxError);
  let reducerError,entered=false,rejected;
  const observed=async port=>{entered=true;try{return await reduce(port);}catch(error){reducerError=error;throw error;}};
  try {await execute(observed);} catch(error) {rejected=error;}
  if(rejected!==undefined && rejected!==reducerError)throw rejected;
  assert(entered,'Expected refusal must enter the actual reducer');
  assert(reducerError instanceof AssetDomainUnavailable && reducerError.message===MESSAGE,'Expected exact collection metadata codec refusal');
  assert.strictEqual(rejected,reducerError,'Owner must propagate the actual reducer failure');
  return {rejected,evidence:{reducerEntered:true,errorName:reducerError.name,errorMessage:reducerError.message,ownerPropagatedSameError:true,
    originalSQLState:original.storageError.code,originalEncodedSha256:plan.encodedSha256}};
}
