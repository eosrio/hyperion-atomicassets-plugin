// Data-only cleanup is independent of native trace health, but still uses the original physical guard.
import assert from 'node:assert/strict';
export async function cleanupOwnedDatabase({hosts, sessions, owned, database, marker, profile, physicalGuard, persist, report, retain, captureSummary}) {
  let closedHosts = 0, evidenceComplete = true;
  const record = async row => {try {await persist(row);} catch (error) {evidenceComplete = false; retain(error);}};
  for (const host of hosts) {
    try {const closed = await host.close(); closedHosts++; await record({event: 'host-resource-closure', ...closed});}
    catch (error) {retain(error);}
  }
  report.cleanup.httpClosed = hosts.length > 0 && closedHosts === hosts.length;
  report.cleanup.readsClosed = report.cleanup.httpClosed;
  report.sessions = {opened: sessions.length, ended: sessions.filter(row => row.ended).length};
  report.cleanup.sessionsEnded = sessions.every(row => row.ended);
  if (!report.cleanup.sessionsEnded) retain(new Error('Native session closure unproved'));
  await record({event: 'before-owned-database-cleanup', report, nativeCapture: captureSummary()});
  if (owned && report.cleanup.httpClosed && report.cleanup.readsClosed && report.cleanup.sessionsEnded) {
    try {
      physicalGuard();
      const row = await database.collection('_qualification_owner').findOne({_id: marker}); physicalGuard();
      assert.equal(row?.profile, profile, 'Only the marked exclusively owned database may be dropped');
      await database.dropDatabase({writeConcern: {w: 'majority', j: true}}); physicalGuard();
      assert.equal((await database.listCollections().toArray()).length, 0); physicalGuard();
      report.cleanup.databaseDropped = true;
    } catch (error) {retain(error); report.cleanup.failure = {name: String(error?.name ?? 'Error'), message: String(error?.message ?? error).slice(0, 2048)};}
  } else if (owned) report.cleanup.databaseRetained = 'Actor/session closure unproved; Root owns guarded cleanup';
  report.cleanup.evidenceComplete = evidenceComplete;
}
