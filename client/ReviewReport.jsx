import { useState } from 'react'
import { checks } from './api.js'
import {
  evidenceParts, feedbackLabel, orderedFindings, remedyActive, remedyOutcomes, remedyPhases,
  retryJobId, reviewLabel, usageDetails, usageLabel,
} from './report.js'

const severityLabels = { error: '实质问题', warning: '待核实', note: '提示' }
const stageLabels = { initial: '初审', review: '初审', correction: '补审', retry: '补审', repair: '主助手修正', verification: '定向复审' }
function sourceLabel(location) {
  const id = location?.split(' · ', 1)[0]
  if (id === 'Q') return '本轮用户要求 · ' + location
  if (/^A\d+$/.test(id)) return '回答第 ' + id.slice(1) + ' 段 · ' + location
  if (/^U\d+$/.test(id)) return '此前用户要求 · ' + location
  if (/^E\d+$/.test(id)) return '会话记录 · ' + location
  if (/^F\d+\.\d+$/.test(id)) return '文件快照 · ' + location
  return location
}

function Finding({ finding, children }) {
  const evidence = evidenceParts(finding)
  return <article className="dsr-finding" data-severity={finding.severity}>
    <header><b>{severityLabels[finding.severity] || '发现'}</b><span>{checks[finding.check]}</span></header>
    <p className="dsr-claim">{finding.claim}</p>
    {finding.claimLocation && <small className="dsr-location">{sourceLabel(finding.claimLocation)}</small>}
    <dl>
      {evidence.quote && <div><dt>对照证据</dt><dd>
        {evidence.location && <small className="dsr-location">{sourceLabel(evidence.location)}</small>}{evidence.quote}
      </dd></div>}
      {finding.reason && <div><dt>判断依据</dt><dd>{finding.reason}</dd></div>}
      {finding.suggestion && <div><dt>建议</dt><dd>{finding.suggestion}</dd></div>}
    </dl>
    {children}
  </article>
}

function UsageTable({ label, usage }) {
  return <div><strong>{label}</strong>
    <small className="dsr-model-note">{usageLabel(usage) || '用量未提供'}</small>
    {usage && usage.requests !== 0 && <dl className="dsr-usage">{usageDetails(usage).map(({ key, label, value }) =>
      <div key={key}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
  </div>
}

function RemedyProgress({ jobs, busy, cancel }) {
  if (!jobs.length) return null
  return <section className="dsr-remedies" aria-label="处理进度">
    {jobs.map(job => <div key={job.id} className="dsr-remedy">
      <div className="dsr-footer"><strong>{remedyPhases[job.phase] || '处理进度'}</strong>
        {remedyActive(job) && <button className="dsr-link" type="button" disabled={busy} onClick={() => cancel(job.id)}>取消处理</button>}
      </div>
      {job.correctionTurn != null && <small>主助手第 {job.correctionTurn} 轮</small>}
      {job.steps?.length > 0 && <ul>{job.steps.map(step => <li key={step.kind + '/' + step.index}>
        {step.kind === 'gap' ? '缺口' : '发现'} {step.index + 1} · {remedyOutcomes[step.status] || step.status}
        {step.detail && <p>{step.detail}</p>}
      </li>)}</ul>}
      {job.note && <p>{job.note}</p>}
    </div>)}
  </section>
}

function ReportHistory({ history }) {
  if (!history?.length) return null
  return <details className="dsr-disclosure"><summary>此轮的历史报告 · {history.length}</summary>
    {history.map(item => {
      const record = { ...item, status: item.status || (item.result ? 'done' : 'error') }
      return <details key={item.revision} className="dsr-disclosure"><summary>
        {new Date(item.updatedAt).toLocaleString()} · {reviewLabel(record)}</summary>
        <ReviewReport historical review={record}/></details>
    })}</details>
}

export function ReviewReport({ review, sessionId, turnId, addDraft, onDraft, store, busy = false, historical = false }) {
  const [all, setAll] = useState(false)
  const [note, setNote] = useState('')
  const [draftStatus, setDraftStatus] = useState(null)
  const result = review.result
  if (review.status === 'running') return <p role="status" className="dsr-hint">正在核对这轮回答…</p>
  if (review.status === 'error') return <div className="dsr-report">
    <p role="alert" className="dsr-error">{review.error || '本轮审查未完成。'}</p>
    {review.usage && <UsageTable label="审查用量" usage={review.usage}/>}
    {!historical && <ReportHistory history={review.history}/>}
  </div>
  if (!result) return <p className="dsr-hint">未收到审查报告。</p>
  const model = result.model || {}
  const findings = orderedFindings(result.findings)
  const gaps = result.gaps || []
  const legacy = !(result.schemaVersion >= 2)
  const notes = legacy ? result.limitations : result.scopeNotes
  const jobs = review.remediation || []
  const actionable = !historical && store && Number.isSafeInteger(review.revision)
  const pending = jobs.some(remedyActive)
  const fixable = (result.findings || []).flatMap((f, i) => f.repair ? [i] : [])

  function submit(action, body = {}) {
    return store.remedy({ turnId, revision: review.revision, action, ...body, ...(note.trim() && action !== 'cancel' ? { note: note.trim() } : {}) })
  }
  function itemButton(kind, index, action) {
    if (!actionable) return null
    const previous = jobs.findLast(job => job.steps?.some(step => step.kind === kind && step.index === index))
    const step = previous?.steps?.find(item => item.kind === kind && item.index === index)
    if (previous && (remedyActive(previous) || ['verified', 'inapplicable'].includes(step?.status))) {
      return <small role="status">{remedyOutcomes[step.status] || remedyPhases[previous.phase]}</small>
    }
    const selection = kind === 'finding' ? { indices: [index] } : { gapIndices: [index] }
    const id = retryJobId(jobs, kind, index, action, note)
    return <button className="dsr-secondary" type="button" disabled={busy || pending}
      onClick={() => submit(action, { ...selection, ...(id ? { id } : {}) })}>
      {action === 'fix' ? '修正并复审' : '请主助手核实'}</button>
  }
  function draft() {
    try {
      addDraft(sessionId, turnId)
      setDraftStatus({ message: '请求已放入输入框，可编辑后发送。' })
      onDraft?.()
    } catch (error) {
      setDraftStatus({ error: true, message: error.message || '无法写入当前会话草稿。' })
    }
  }

  return <div className="dsr-report">
    {result.summary && <p>{result.summary}</p>}
    {review.trigger?.reason && <p className="dsr-hint">审查缘由 · {review.trigger.reason}</p>}
    {result.reused && <p className="dsr-hint">已复用这份报告，本次新增模型请求 0 次。</p>}
    {(all ? findings : findings.slice(0, 3)).map(f => {
      const i = result.findings.indexOf(f)
      return <Finding finding={f} key={i}>{itemButton('finding', i, f.repair ? 'fix' : 'verify')}</Finding>
    })}
    {findings.length > 3 && <button type="button" className="dsr-link dsr-disclose" aria-expanded={all} onClick={() => setAll(!all)}>
      {all ? '收起其余问题' : `查看其余 ${findings.length - 3} 项`}</button>}
    {gaps.map((gap, i) => <article className="dsr-finding" data-severity="warning" key={i}>
      <header><b>关键事实待核实</b><span>{sourceLabel(gap.claimSource)}</span></header>
      <p className="dsr-claim">{gap.claim}</p><dl>
        <div><dt>缺少依据</dt><dd>{gap.missing}</dd></div>
        <div><dt>影响判断</dt><dd>{gap.impact}</dd></div>
      </dl>{itemButton('gap', i, 'verify')}
    </article>)}
    {notes?.length > 0 && <details className="dsr-disclosure">
      <summary>{legacy ? '原报告的核查限制' : '审查范围'} · {notes.length}</summary>
      <ul>{notes.map((line, i) => <li key={i}>{line}</li>)}</ul></details>}
    {result.mainModel?.model && <small className="dsr-model-note">主回答模型 · {[result.mainModel.provider, result.mainModel.model].filter(Boolean).join(' · ')}</small>}
    {(model.model || result.method === 'local') && <small className="dsr-model-note">{result.method === 'local' ? (result.localLabel || '本地核对') :
      ['审查模型', model.provider, model.model, model.effort].filter(Boolean).join(' · ')}</small>}
    {actionable && (findings.length + gaps.length > 0) && <>
      <details className="dsr-disclosure"><summary>补充处理依据</summary>
        <label className="dsr-stack"><span>随下一次修正或核实发送</span>
          <textarea rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)}
            placeholder="例如，原始分组在 samples.csv，第 2 列是独立样本编号。"/>
        </label></details>
      {fixable.length > 1 && !jobs.length && <button className="dsr-primary" type="button" disabled={busy || pending}
        onClick={() => submit('fix', { indices: fixable })}>修正并复审全部 {fixable.length} 项</button>}
    </>}
    <RemedyProgress jobs={jobs} busy={busy} cancel={id => submit('cancel', { id })}/>
    {result.usage && <details className="dsr-disclosure"><summary>用量 · {usageLabel(result.usage) || '未提供'}</summary>
      <UsageTable label={result.method === 'local' ? '本地核对' : result.usage.requests === 1 ? '初审' : '原报告用量'} usage={result.usage}/>
      {result.usage.stages?.length > 1 && result.usage.stages.map((row, i) =>
        <UsageTable key={i} label={stageLabels[row.stage] || (i ? '补审' : '初审')} usage={{ requests: 1, ...(row.usage || row) }}/>)}
      {jobs.map(job => <div key={job.id}><UsageTable label="主助手处理" usage={job.usage?.correction}/>
        <UsageTable label="定向复审" usage={job.usage?.verification}/></div>)}
    </details>}
    {!historical && findings.length > 0 && <div className="dsr-followup">
      <p>{feedbackLabel(review.feedback)}</p>
      <button type="button" className="dsr-link" onClick={draft}>起草复核请求</button>
      {draftStatus && <p role={draftStatus.error ? 'alert' : 'status'} className={draftStatus.error ? 'dsr-error' : 'dsr-hint'}>{draftStatus.message}</p>}
    </div>}
    {!historical && <ReportHistory history={review.history}/>}
  </div>
}
