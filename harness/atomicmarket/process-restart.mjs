import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PROCESS_RESTART_LIMITS as limits, validateProcessRestartJob} from './process-restart-job.mjs';

/** Only the fixed reviewed child is executable, using this native Node and a validated owned job. */
export async function runMarketplaceProcess(job, observeRecovered) {
  validateProcessRestartJob(job, process.pid);
  if (job.mode === 'recover') assert.equal(typeof observeRecovered, 'function', 'Recovery requires independent owner observations');
  const env = {...process.env}; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  return await new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const child = spawn(process.execPath, [fileURLToPath(new URL('./process-restart-child.mjs', import.meta.url))],
      {env, detached: process.platform === 'linux', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc']});
    let result, admitted, recovered, identity, failure, reportedFailure, logBytes = 0, log = '', processing = Promise.resolve();
    let closed = false, settled = false;
    const killOwned = signal => {
      if (closed || settled || !child.pid) return;
      try {if (process.platform === 'linux') process.kill(-child.pid, signal); else child.kill(signal);}
      catch (error) {if (error.code !== 'ESRCH') failure ??= error;}
    };
    const stop = error => {if (closed || settled) return; failure ??= error; killOwned('SIGTERM'); terminate();};
    const timer = setTimeout(() => stop(new Error('Owned Marketplace process exceeded its deadline')), limits.deadlineMS + 5000);
    let killTimer;
    const terminate = () => {if (!closed && !settled && !killTimer) killTimer = setTimeout(() => killOwned('SIGKILL'), 2000);};
    child.on('disconnect', () => {if (failure) terminate();});
    const capture = chunk => {
      logBytes += chunk.length;
      if (logBytes > limits.logBytes) {stop(new Error('Owned Marketplace process exceeded its log budget')); terminate();}
      else log += chunk.toString('utf8');
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.on('message', message => {
      if (closed || settled) return;
      processing = processing.then(async () => {
        if (closed || settled) return;
        assert.ok(Buffer.byteLength(JSON.stringify(message)) <= limits.messageBytes);
        assert.equal(message.identity.pid, child.pid); assert.equal(message.identity.parentPid, process.pid);
        assert.equal(message.identity.execPath, process.execPath); assert.equal(message.identity.node, process.version);
        assert.match(message.identity.instance, /^[0-9a-f-]{36}$/);
        assert.ok(Number.isFinite(Date.parse(message.identity.startedAt)) && message.identity.startedAt >= startedAt);
        if (identity) assert.deepEqual(message.identity, identity); else identity = message.identity;
        if (message.event === 'process-error') {
          // Preserve a reported child's own failure exit and cleanup; bound a child that fails to close.
          reportedFailure = message.result; failure ??= new Error(message.result.message); terminate(); return;
        }
        if (message.event === 'source-admitted-before-read' || message.event === 'recovered-before-replay') {
          assert.equal(job.mode, 'recover'); assert.equal(recovered, undefined); assert.equal(result, undefined);
          if (message.event === 'source-admitted-before-read') {assert.equal(admitted, undefined); admitted = message.result;}
          else {assert.ok(admitted); recovered = message.result;}
          await observeRecovered(message.event, message.result);
          if (closed || settled) return;
          const event = message.event === 'source-admitted-before-read' ? 'continue-recovered-read' : 'continue-exact-b-replay';
          await new Promise((done, fail) => child.send({event}, error => error ? fail(error) : done()));
        } else {
          assert.equal(message.event, 'process-complete'); assert.equal(result, undefined);
          if (job.mode === 'recover') assert.ok(recovered);
          result = message.result;
        }
      }).catch(error => {if (!settled) failure ??= error; stop(error);});
    });
    child.on('error', error => {stop(error); terminate();});
    child.stdin.on('error', error => {stop(error); terminate();});
    child.stdin.end(JSON.stringify(job));
    child.on('close', async (code, signal) => {
      if (closed) return;
      closed = true; clearTimeout(timer); clearTimeout(killTimer);
      let absentAfterClose = false, processGroupAbsent = process.platform !== 'linux';
      let descendantFailure;
      const reapDescendants = async () => {
        assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH', 'Owned child must be gone after close');
        absentAfterClose = true;
        if (process.platform === 'linux') {
          const absent = () => {
            try {process.kill(-child.pid, 0); return false;}
            catch (error) {if (error.code === 'ESRCH') return true; throw error;}
          };
          if (!absent()) {
            descendantFailure = new Error('Owned process group retained a descendant after child close');
            // Separate finalization authority: run once at close while the owned group still exists.
            // Ordinary IPC/timer termination is already retired and cannot invoke this path.
            try {process.kill(-child.pid, 'SIGKILL');} catch (error) {if (error.code !== 'ESRCH') throw error;}
            const until = Date.now() + 2000;
            while (!absent() && Date.now() < until) await new Promise(done => setTimeout(done, 25));
          }
          processGroupAbsent = absent(); assert.equal(processGroupAbsent, true);
        }
      };
      try {
        // Start reaping immediately at close, then settle every in-flight observation before receipt/timer finalization.
        const outcomes = await Promise.allSettled([processing, reapDescendants()]);
        for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
        failure ??= descendantFailure;
        assert.ifError(failure); assert.equal(code, 0); assert.equal(signal, null); assert.ok(result && identity);
        resolve({identity, result, admitted, recovered, execution: {startedAt, closedAt: new Date().toISOString(),
          exitCode: code, signal, reaped: true, absentAfterClose, processGroupAbsent, logBytes, log}});
      } catch (error) {
        const failed = new Error(`Owned Marketplace process failed: ${error.message}; exit=${code}; signal=${signal}; ${log}`);
        failed.processReceipt = {identity: identity ?? null, reportedFailure: reportedFailure ?? null, mode: job.mode, pid: child.pid ?? null, startedAt,
          closedAt: new Date().toISOString(), exitCode: code, signal, reaped: true, absentAfterClose, processGroupAbsent, logBytes, log};
        reject(failed);
      } finally {
        settled = true; clearTimeout(timer); clearTimeout(killTimer); killTimer = undefined;
      }
    });
  });
}
