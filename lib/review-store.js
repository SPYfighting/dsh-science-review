import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export function openReviewStore(filename) {
  if (!filename) {
    const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
    const root = home === '~' ? homedir() : home.startsWith('~/') ? join(homedir(), home.slice(2)) : resolve(home)
    filename = join(root, 'dsh-science-review', 'reviews.sqlite')
  }
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(filename)
  db.exec(`
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS modes(session TEXT PRIMARY KEY, mode TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(
      revision INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT NOT NULL, turn TEXT NOT NULL,
      record TEXT NOT NULL, UNIQUE(session, turn)
    );
  `)
  const mode = db.prepare('SELECT mode FROM modes WHERE session=?')
  const reports = db.prepare('SELECT turn, revision, record FROM reports WHERE session=?')
  const writeMode = db.prepare('INSERT OR REPLACE INTO modes(session,mode) VALUES (?,?)')
  const writeReport = db.prepare('INSERT OR REPLACE INTO reports(session,turn,record) VALUES (?,?,?)')
  return {
    setMode: (sid, value) => writeMode.run(sid, value),
    saveReport: (sid, turn, record) => writeReport.run(sid, turn, JSON.stringify(record)),
    state(sid, legacy) {
      const merged = { ...legacy.reports }
      for (const row of reports.all(sid)) {
        // Legacy revisions are host event sequence numbers (nonnegative). A new
        // report always gets a distinct revision, even within one millisecond.
        const seq = -row.revision
        const receipt = legacy.receipts?.[row.turn]
        const record = JSON.parse(row.record)
        const sent = receipt?.revision === seq ? receipt.indices.filter(i => i < (record.result?.findings.length ?? 0)) : []
        merged[row.turn] = { ...record, seq, sent }
      }
      return { ...legacy, mode: mode.get(sid)?.mode ?? legacy.mode, reports: merged }
    },
    close: () => db.close(),
  }
}
