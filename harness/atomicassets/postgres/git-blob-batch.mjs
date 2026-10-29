import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const MAX_BYTES=2*1024**2,MAX_FILES=206;

/** One invocation's ordered, pinned raw blobs. No working-state or cross-call cache. */
export function readPinnedBlobs(rows,invoke) {
  assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=MAX_FILES,'Bounded source inventory required');
  let expectedBytes=0;
  const frames=rows.map(row=>{
    assert.ok(row&&typeof row.blob==='string'&&/^[0-9a-f]{40}$/.test(row.blob)
      &&typeof row.sha256==='string'&&/^[0-9a-f]{64}$/.test(row.sha256),'Pinned blob identity required');
    assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=MAX_BYTES,'Bounded blob length required');
    const header=Buffer.from(row.blob+' blob '+row.bytes+'\n');
    expectedBytes+=header.length+row.bytes+1;
    assert.ok(expectedBytes<=MAX_BYTES,'Batch exceeds unchanged Git output bound');
    return {header,bytes:row.bytes,sha256:row.sha256};
  });
  const input=Buffer.from(rows.map(row=>row.blob+'\n').join(''));
  const raw=invoke(input);
  assert.ok(Buffer.isBuffer(raw)&&raw.length===expectedBytes,'Incomplete or extra Git batch output');
  let offset=0;
  const blobs=frames.map(frame=>{
    assert.deepEqual(raw.subarray(offset,offset+frame.header.length),frame.header,'Unexpected Git blob header or order');
    offset+=frame.header.length;
    const body=raw.subarray(offset,offset+frame.bytes);offset+=frame.bytes;
    assert.equal(createHash('sha256').update(body).digest('hex'),frame.sha256,'Pinned Git blob bytes differ');
    assert.equal(raw[offset++],10,'Missing Git blob separator');
    return body;
  });
  assert.equal(offset,raw.length,'Unexpected trailing Git batch output');
  return blobs;
}
