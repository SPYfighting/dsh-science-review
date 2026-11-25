import { useEffect, useState } from 'react'
import { checks, modes, modeHelp, request } from './api.js'
import { checkPresets, identifyCheckPreset } from '../lib/presets.js'
import { refreshSessions } from './session.js'

function useResource(route, queryKey = '', query = {}) {
  const [counter, setCounter] = useState(0)
  const [state, setState] = useState(null)
  const identity = route + queryKey + counter
  useEffect(() => {
    if (!route) return
    const controller = new AbortController()
    request(route, { query, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setState({ identity, value }) })
      .catch(error => { if (!controller.signal.aborted) setState({ identity, error: error.message }) })
    return () => controller.abort()
  }, [identity])
  return { ...(state?.identity === identity ? state : {}), reload: () => setCounter(n => n + 1) }
}

function Retry({ text, retry }) {
  return <p className="dsr-error" role="alert">{text} <button type="button" className="dsr-link" onClick={retry}>重试</button></p>
}

export function Settings() {
  const saved = useResource('settings')
  if (saved.error) return <Retry text={saved.error} retry={saved.reload}/>
  if (!saved.value) return <p className="dsr-hint" role="status">正在读取审查设置…</p>
  return <SettingsForm initial={saved.value} reload={saved.reload}/>
}

function SettingsForm({ initial, reload }) {
  const catalog = useResource('models')
  const [stored, setStored] = useState(initial)
  const [draft, setDraft] = useState(initial.settings)
  const [state, setState] = useState({ phase: 'idle' })
  const following = draft.model === 'session'
  const efforts = useResource(following ? '' : 'efforts', draft.model, { model: draft.model })
  const models = catalog.value?.models || []
  const levels = efforts.value?.efforts || []
  const preset = identifyCheckPreset(draft.checks)
  const isDirty = Object.keys(draft).some(key => key === 'checks'
    ? draft.checks.length !== stored.settings.checks.length || draft.checks.some(check => !stored.settings.checks.includes(check))
    : draft[key] !== stored.settings[key])
  const change = (patch) => { setDraft(current => ({ ...current, ...patch })); setState({ phase: 'idle' }) }

  async function save(event) {
    event.preventDefault()
    if (state.phase === 'saving' || !draft.checks.length) return
    setState({ phase: 'saving' })
    try {
      const next = await request('settings', { body: { settings: draft, revision: stored.revision } })
      setStored(next)
      setDraft(next.settings)
      setState({ phase: 'saved' })
      refreshSessions()
    } catch (error) {
      setState({ phase: 'error', message: error.message, conflict: error.status === 409 })
    }
  }

  return <form className="dsr dsr-settings" onSubmit={save}>
    <header><h2>回答审查</h2><p>审查发现与证据会列在对应回答下方。</p></header>
    <fieldset className="dsr-fields" disabled={state.phase === 'saving'}>
      <div className="dsr-group">
        <h3>审查模型</h3>
        <label className="dsr-row"><span>模型</span>
          <select value={draft.model} onChange={e => change({ model: e.target.value, effort: 'inherit' })}>
            <option value="session">跟随会话模型</option>
            {draft.model !== 'session' && !models.some(m => m.value === draft.model) &&
              <option value={draft.model}>{draft.model}（已保存）</option>}
            {models.map(model => <option key={model.value} value={model.value}>{model.name} · {model.provider}</option>)}
          </select>
        </label>
        {catalog.error ? <Retry text={catalog.error} retry={catalog.reload}/> : !catalog.value ? <p className="dsr-hint">正在读取 DSH 模型目录…</p> :
          !models.length && <p className="dsr-hint">模型目录为空。可先在 DSH 的模型设置中添加模型。</p>}
        {catalog.value?.errors?.length > 0 && <Retry text={`未能读取这些提供方的模型：${catalog.value.errors.join('、')}`} retry={catalog.reload}/>}
        <label className="dsr-row"><span>推理强度 <small>Effort</small></span>
          <select value={draft.effort} disabled={following || !levels.length} onChange={e => change({ effort: e.target.value })}>
            <option value="inherit">{following ? '跟随会话' : '使用默认强度'}</option>
            {draft.effort !== 'inherit' && !levels.some(o => o.id === draft.effort) &&
              <option value={draft.effort}>{draft.effort}（已保存）</option>}
            {levels.map(level => <option key={level.id} value={level.id}>{level.name || level.id}</option>)}
          </select>
        </label>
        {!following && (efforts.error ? <Retry text={efforts.error} retry={efforts.reload}/> :
          !efforts.value ? <p className="dsr-hint">正在读取可用强度…</p> :
          !levels.length && <p className="dsr-hint">此模型未提供可选推理强度。</p>)}
      </div>
      <div className="dsr-group">
        <h3>默认审查方式</h3>
        <label className="dsr-row"><span>触发时机</span>
          <select value={draft.mode} onChange={e => change({ mode: e.target.value })}>
            {Object.entries(modes).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
        <p className="dsr-hint">{modeHelp[draft.mode]}</p>
        <label className="dsr-row"><span>单轮覆盖度</span>
          <select value={draft.coverage} onChange={e => change({ coverage: e.target.value })}>
            <option value="key">关键主张</option><option value="all">全部可核查主张</option>
          </select>
        </label>
        <p className="dsr-hint">{draft.coverage === 'all'
          ? '逐段检查可与要求或记录对照的陈述、决定、操作及交付内容。'
          : '优先核对一旦出错就会改变结论、下一步行动、交付可用性或授权范围的内容，如实验样本量、预约日期、写入失败的处理。'}</p>
      </div>
      <fieldset className="dsr-group dsr-checks"><legend>核查内容</legend>
        <div className="dsr-presets" role="group" aria-label="核查预设">
          <span>预设</span>
          {Object.entries({ efficient: '高效', full: '全面' }).map(([id, label]) =>
            <button key={id} type="button" className="dsr-secondary" aria-pressed={preset === id}
              onClick={() => change({ checks: checkPresets[id] })}>{label}</button>)}
          {preset === 'custom' && <small role="status">自定义</small>}
        </div>
        <div className="dsr-check-list">{Object.entries(checks).map(([id, text]) => <label key={id}>
          <input type="checkbox" checked={draft.checks.includes(id)} onChange={e => change({
            checks: e.target.checked ? [...draft.checks, id] : draft.checks.filter(check => check !== id),
          })}/>{text}
        </label>)}</div>
        {!draft.checks.length && <p className="dsr-error" role="alert">请至少保留一项核查内容。</p>}
      </fieldset>
      <label className="dsr-stack"><span>补充审查标准 <small>可选</small></span>
        <textarea rows={3} maxLength={2000} value={draft.instructions} placeholder="例如，核对样本量是否与分组统计一致。" onChange={e => change({ instructions: e.target.value })}/>
      </label>
    </fieldset>
    <div className="dsr-footer"><button type="submit" className="dsr-primary" disabled={!isDirty || !draft.checks.length || state.phase === 'saving'}>{state.phase === 'saving' ? '正在保存…' : '保存设置'}</button>
      {state.phase === 'saved' && <span role="status">已保存</span>}
      {state.phase === 'error' && <span role="alert" className="dsr-error">{state.message} {state.conflict && <button type="button" className="dsr-link" onClick={reload}>载入已保存设置</button>}</span>}
    </div>
  </form>
}
