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
    CREATE TABLE IF NOT EXISTS report_history(
      session TEXT NOT NULL, turn TEXT NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL,
      PRIMARY KEY(session, turn, revision)
    );
    CREATE TABLE IF NOT EXISTS preferences(session TEXT PRIMARY KEY, handling TEXT, instructions TEXT);
    CREATE TABLE IF NOT EXISTS repairs(
      session TEXT NOT NULL, id TEXT NOT NULL, owner INTEGER NOT NULL, record TEXT NOT NULL,
      PRIMARY KEY(session,id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS active_repair ON repairs(session)
      WHERE json_extract(record,'$.phase') IN ('waiting','queued','running','verifying');
    CREATE TABLE IF NOT EXISTS evidence_turns(
      session TEXT NOT NULL, turn INTEGER NOT NULL, version TEXT NOT NULL, PRIMARY KEY(session,turn)
    );
    CREATE TABLE IF NOT EXISTS evidence_entries(
      session TEXT NOT NULL, turn INTEGER NOT NULL, ref TEXT NOT NULL, record TEXT NOT NULL,
      PRIMARY KEY(session, turn, ref)
    );
    CREATE TABLE IF NOT EXISTS evidence_terms(
      session TEXT NOT NULL, term TEXT NOT NULL, turn INTEGER NOT NULL, ref TEXT NOT NULL,
      PRIMARY KEY(session,term,turn,ref)
    );
  `)
  const mode = db.prepare('SELECT mode FROM modes WHERE session=?')
  const reports = db.prepare('SELECT turn, revision, record FROM reports WHERE session=?')
  const writeMode = db.prepare('INSERT OR REPLACE INTO modes(session,mode) VALUES (?,?)')
  const writeReport = db.prepare('INSERT OR REPLACE INTO reports(session,turn,record) VALUES (?,?,?)')
  const preferences = db.prepare('SELECT handling, instructions FROM preferences WHERE session=?')
  const writePreferences = db.prepare('INSERT OR REPLACE INTO preferences(session,handling,instructions) VALUES (?,?,?)')
  const archive = db.prepare('INSERT OR IGNORE INTO report_history(session,turn,revision,record) VALUES (?,?,?,?)')
  const previous = db.prepare('SELECT revision,record FROM reports WHERE session=? AND turn=?')
  const history = db.prepare('SELECT turn,revision,record FROM report_history WHERE session=? ORDER BY rowid DESC')
  const repairs = db.prepare('SELECT record FROM repairs WHERE session=? ORDER BY rowid ASC')
  const writeRepair = db.prepare(`INSERT INTO repairs(session,id,owner,record) VALUES (?,?,?,?)
    ON CONFLICT(session,id) DO UPDATE SET record=excluded.record WHERE repairs.owner=excluded.owner`)
  const indexVersion = db.prepare('SELECT turn,version FROM evidence_turns WHERE session=? AND turn<?')
  const writeVersion = db.prepare('INSERT OR REPLACE INTO evidence_turns VALUES (?,?,?)')
  const writeEntry = db.prepare('INSERT OR REPLACE INTO evidence_entries VALUES (?,?,?,?)')
  const writeTerm = db.prepare('INSERT OR IGNORE INTO evidence_terms VALUES (?,?,?,?)')
  const clearEntries = db.prepare('DELETE FROM evidence_entries WHERE session=? AND turn=?')
  const clearTerms = db.prepare('DELETE FROM evidence_terms WHERE session=? AND turn=?')
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
  return {
    setMode: (sid, value) => writeMode.run(sid, value),
    setPreferences: (sid, patch) => transaction(() => {
      if (patch.mode !== undefined) writeMode.run(sid, patch.mode)
      const old = preferences.get(sid)
      writePreferences.run(sid, patch.handling ?? old?.handling ?? 'inherit', patch.sessionInstructions ?? old?.instructions ?? '')
    }),
    saveReport: (sid, turn, record, legacy) => transaction(() => {
      const prior = previous.get(sid, turn)
      if (prior) archive.run(sid, turn, -prior.revision, prior.record)
      else if (legacy?.result) archive.run(sid, turn, legacy.seq, JSON.stringify(legacy))
      return -Number(writeReport.run(sid, turn, JSON.stringify(record)).lastInsertRowid)
    }),
    remedies: sid => repairs.all(sid).map(row => JSON.parse(row.record)),
    saveRemedy: (sid, job) => {
      if (!writeRepair.run(sid, job.id, process.pid, JSON.stringify(job)).changes)
        throw new Error('已有其他 DSH 进程处理这项修正。')
    },
    interruptRemedies() {
      transaction(() => {
        const active = db.prepare("SELECT session,id,owner,record FROM repairs WHERE json_extract(record,'$.phase') IN ('waiting','queued','running','verifying')").all()
        const mark = db.prepare('UPDATE repairs SET owner=?,record=? WHERE session=? AND id=?')
        for (const row of active) {
          if (row.owner !== process.pid) {
            try { process.kill(row.owner, 0); continue }
            catch (error) { if (error.code !== 'ESRCH') continue }
          } else continue
          const job = JSON.parse(row.record)
          job.phase = 'interrupted'
          job.detail = '上次 DSH 进程已停止，尚未完成的修正需要重新确认。'
          for (const step of job.steps ?? []) {
            if (step.status === 'pending' || step.status === 'responded') {
              step.status = 'needs_evidence'
              step.detail = job.detail
            }
          }
          mark.run(process.pid, JSON.stringify(job), row.session, row.id)
        }
      })
    },
    indexedTurns: (sid, before) => new Map(indexVersion.all(sid, before).map(row => [row.turn, row.version])),
    indexTurn: (sid, turn, version, entries) => transaction(() => {
      clearTerms.run(sid, turn)
      clearEntries.run(sid, turn)
      for (const { terms, row } of entries) {
        if (!terms.length) continue
        const { text: _sourceText, ...pointer } = row
        writeEntry.run(sid, turn, row.id, JSON.stringify(pointer))
        for (const term of terms) writeTerm.run(sid, term, turn, row.id)
      }
      writeVersion.run(sid, turn, version)
    }),
    findEvidence(sid, before, terms) {
      if (!terms.length) return []
      return db.prepare(`SELECT e.record, COUNT(*) AS matches FROM evidence_terms t JOIN evidence_entries e
        USING(session,turn,ref) WHERE t.session=? AND t.turn<? AND t.term IN (${terms.map(() => '?').join(',')})
        GROUP BY t.turn,t.ref ORDER BY matches DESC,t.turn DESC,t.ref LIMIT 6`)
        .all(sid, before, ...terms).map(row => JSON.parse(row.record))
    },
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
      const jobs = repairs.all(sid).map(row => JSON.parse(row.record))
      for (const job of jobs) {
        const record = merged[job.turnId]
        if (!job.correctionTurn || record?.seq !== job.revision || !job.dispatchedIndices?.length) continue
        merged[job.turnId] = { ...record, sent: [...new Set([...record.sent, ...job.dispatchedIndices])] }
      }
      const options = preferences.get(sid)
      const archives = {}
      for (const row of history.all(sid)) {
        const record = JSON.parse(row.record)
        const versions = archives[row.turn] ??= []
        versions.push({ revision: row.revision, result: record.result, error: record.error, updatedAt: record.updatedAt })
      }
      return { ...legacy, mode: mode.get(sid)?.mode ?? legacy.mode, handling: options?.handling ?? 'inherit',
        sessionInstructions: options?.instructions ?? '', reports: merged, history: archives, remedyJobs: jobs }
    },
    close: () => db.close(),
  }
}
