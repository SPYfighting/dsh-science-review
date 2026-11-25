import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { checks, modes, modeHelp } from './api.js'
import { evidenceParts, feedbackLabel, orderedFindings, reviewLabel, usageLabel, visibleMode } from './report.js'
import { useReviewSession, useTurnArrival } from './session.js'

const severityLabels = { error: '实质问题', warning: '待核实', note: '提示' }

function sourceLabel(location) {
  const id = location?.split(' · ', 1)[0]
  if (id === 'Q') return '本轮用户要求 · ' + location
  if (/^A\d+$/.test(id)) return '回答第 ' + id.slice(1) + ' 段 · ' + location
  if (/^U\d+$/.test(id)) return '此前用户要求 · ' + location
  if (/^E\d+$/.test(id)) return '会话记录 · ' + location
  if (/^F\d+\.\d+$/.test(id)) return '文件快照 · ' + location
  return location
}

function Finding({ finding }) {
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
  </article>
}

function ReviewReport({ review, sessionId, turnId, addDraft, onDraft }) {
  const [all, setAll] = useState(false)
  const [draftStatus, setDraftStatus] = useState(null)
  const result = review.result
  if (review.status === 'running') return <p role="status" className="dsr-hint">正在核对这轮回答…</p>
  if (review.status === 'error') {
    const usage = usageLabel(review.usage)
    return <div className="dsr-report">
      <p role="alert" className="dsr-error">{review.error || '本轮审查未完成。'}</p>
      {usage && <small className="dsr-model-note">{usage}</small>}
    </div>
  }
  if (!result) return <p className="dsr-hint">未收到审查报告。</p>
  const model = result.model || {}
  const usage = usageLabel(result.usage)
  const findings = orderedFindings(result.findings)
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
    {(all ? findings : findings.slice(0, 3)).map((finding, i) => <Finding key={i} finding={finding}/>)}
    {findings.length > 3 && <button type="button" className="dsr-link dsr-disclose" aria-expanded={all}
      onClick={() => setAll(!all)}>{all ? '收起其余问题' : `查看其余 ${findings.length - 3} 项`}</button>}
    {result.limitations?.length > 0 && <div className="dsr-limit"><strong>核查限制</strong><ul>
      {result.limitations.map((line, i) => <li key={i}>{line}</li>)}</ul></div>}
    {(model.model || usage) && <small className="dsr-model-note">{[model.provider, model.model, model.effort, usage].filter(Boolean).join(' · ')}</small>}
    {findings.length > 0 && <div className="dsr-followup">
      <p>{feedbackLabel(review.feedback)}</p>
      <button type="button" className="dsr-secondary" onClick={draft}>起草复核请求</button>
      {draftStatus && <p role={draftStatus.error ? 'alert' : 'status'} className={draftStatus.error ? 'dsr-error' : 'dsr-hint'}>{draftStatus.message}</p>}
    </div>}
  </div>
}

export function TurnReview({ sessionId, turn, addDraft }) {
  const [state, store] = useReviewSession(sessionId)
  const turnId = String(turn.turn)
  useTurnArrival(store, turnId)
  const review = state.byTurn.get(turnId)?.review
  if (!review) return null
  return <details className="dsr dsr-turn" data-state={review.status}>
    <summary>{reviewLabel(review)}</summary>
    <ReviewReport key={review.updatedAt} {...{ review, sessionId, turnId, addDraft }}/>
    {review.status === 'error' && <button type="button" className="dsr-link" disabled={state.busy} onClick={() => store.run(turnId)}>重试本轮审查</button>}
    {state.error && <p className="dsr-error" role="alert">{state.error}</p>}
  </details>
}

// DSH's composer clips child overlays. Place the panel in the same document
// as the trigger but outside the composer, and keep it on-screen after resize.
function SessionMenu({ anchor, close, titleId, children }) {
  const panel = useRef(null)
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.current || !panel.current) return
      const rect = anchor.current.getBoundingClientRect()
      const box = panel.current
      const roomAbove = rect.top - 16
      const roomBelow = window.innerHeight - rect.bottom - 16
      const above = roomAbove >= Math.min(box.scrollHeight, 410) || roomAbove >= roomBelow
      box.style.maxHeight = Math.max(96, above ? roomAbove : roomBelow) + 'px'
      box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - box.offsetWidth - 8)) + 'px'
      box.style.top = above ? 'auto' : rect.bottom + 6 + 'px'
      box.style.bottom = above ? window.innerHeight - rect.top + 6 + 'px' : 'auto'
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(panel.current)
    observer.observe(anchor.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    panel.current.focus()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])
  useEffect(() => {
    const outside = event => { if (!panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) close(false) }
    const escape = event => {
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(true) }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [anchor, close])
  return createPortal(<div ref={panel} className="dsr dsr-menu" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
    <div className="dsr-head"><h3 id={titleId}>会话审查</h3><button type="button" aria-label="关闭会话审查" onClick={() => close(true)}>×</button></div>
    {children}
  </div>, document.body)
}

export function ComposerReview({ sessionId, addDraft }) {
  return <SessionControl key={sessionId} sessionId={sessionId} addDraft={addDraft}/>
}

function ModeIcon({ mode, size = 19 }) {
  const paths = {
    manual: <><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5"/></>,
    key: <><path d="M6 20V4m0 1c5-3 8 3 13 0v9c-5 3-8-3-13 0"/></>,
    every: <><rect x="7" y="6" width="12" height="14" rx="2"/><path d="M4 16V4a1 1 0 0 1 1-1h10M10 13l2 2 4-5"/></>,
    inherit: <><path d="m8 13 5-5m-3-1 2-2a4 4 0 0 1 6 6l-2 2m-2 4-2 2a4 4 0 0 1-6-6l2-2"/></>,
    unknown: <><circle cx="12" cy="12" r="8"/><path d="M8.5 12h.1m3.4 0h.1m3.4 0h.1"/></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[mode] || paths.unknown}</svg>
}

function SessionControl({ sessionId, addDraft }) {
  const [state, store] = useReviewSession(sessionId)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('latest')
  const [showReport, setShowReport] = useState(false)
  const anchor = useRef(null)
  const titleId = useId()
  const modeName = useId()
  const data = state.data
  const turns = data?.turns || []
  const selectedTurn = selected === 'latest' ? turns.at(-1) : turns.find(turn => turn.id === selected)
  const report = selectedTurn?.review
  const close = restore => { setOpen(false); if (restore) anchor.current?.focus() }
  const latestReview = turns.findLast(turn => turn.review)?.review
  const running = turns.some(turn => turn.review?.status === 'running')
  const error = Boolean(state.error || latestReview?.status === 'error')
  const mode = visibleMode(data, state.error)
  const status = state.error ? '审查服务异常' : running ? '正在审查' : error ? '最近一次审查失败' : ''
  const description = ['会话审查', modes[mode] || (state.error ? '模式未知' : '正在读取模式'), status].filter(Boolean).join(' · ')
  return <>
    <button type="button" ref={anchor} className="dsr dsr-trigger" data-mode={mode} aria-label={description} title={description}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) void store.refresh(); setOpen(!open) }}>
      <ModeIcon mode={mode}/>
      {running && !state.error ? <i className="dsr-activity dsr-activity-running" aria-hidden="true"/> :
        error ? <i className="dsr-activity dsr-activity-error" aria-hidden="true">!</i> : null}
    </button>
    {open && <SessionMenu anchor={anchor} close={close} titleId={titleId}>
      {state.error && <p className="dsr-error" role="alert">{state.error} <button type="button" className="dsr-link" onClick={store.refresh}>刷新</button></p>}
      {!data && !state.error && <p role="status">正在读取会话…</p>}
      {data && <>
        <fieldset className="dsr-mode-picker" disabled={state.busy}>
          <legend>触发时机</legend>
          <div>{Object.entries({ inherit: '跟随全局', ...modes }).map(([id, label]) =>
            <label key={id} title={id === 'inherit' ? '跟随设置中的默认审查方式' : modeHelp[id]}>
              <input type="radio" name={modeName} value={id} checked={data.mode === id} onChange={() => store.setMode(id)}/>
              <span><ModeIcon mode={id} size={16}/>{label}</span>
            </label>)}</div>
          {modes[mode] && <p className="dsr-hint">{data.mode === 'inherit' ? modes[mode] + ' · ' : ''}{modeHelp[mode]}</p>}
        </fieldset>
        {turns.length ? <>
          <label className="dsr-stack"><span>审查对象</span>
            <select value={selected} disabled={state.busy} onChange={e => { setSelected(e.target.value); setShowReport(false) }}>
              <option value="latest">最新已完成轮次</option>
              {turns.slice().reverse().map(turn => <option key={turn.id} value={turn.id}>{turn.label || '第 ' + turn.id + ' 轮'}</option>)}
            </select>
          </label>
          <div className="dsr-footer"><button type="button" className="dsr-primary" disabled={state.busy || !selectedTurn || report?.status === 'running'}
            onClick={() => { setShowReport(true); void store.run(selectedTurn.id) }}>{report?.status === 'running' ? '正在审查…' : '审查此轮'}</button>
            {report && <button type="button" className="dsr-link" onClick={() => setShowReport(!showReport)}>{showReport ? '收起报告' : '查看报告'}</button>}</div>
          {showReport && report && <ReviewReport key={selectedTurn.id + '/' + report.updatedAt} review={report} sessionId={sessionId} turnId={selectedTurn.id} addDraft={addDraft} onDraft={() => close(false)}/>}
        </> : <p className="dsr-hint">第一轮回答完成后即可审查。</p>}
      </>}
    </SessionMenu>}
  </>
}

export function ReviewIcon({ size = 16 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9.5L13 3.5Z"/><path d="M13 3.5v6h6M8.5 14.7l2 2 4.7-4.8"/>
  </svg>
}
