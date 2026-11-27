import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { RequestError } from './settings.js'
import { listTurns } from './review.js'
import { prepareFileEdit, permitsEdit, editVersion } from './remedy-file.js'
import { verifyRemediation, totalUsage } from './remedy-verify.js'

const sourceKind = 'dsh-review-remediation'
const openPhases = new Set(['waiting','queued','running','verifying'])
const short = value => typeof value === 'string' ? value.slice(0,1200) : undefined
const isHuman = message => message.source?.kind === 'user'
const activeHuman = state => state.turns.filter(t => t.human).at(-1)?.id
const cancelReason = {kind:'hook',reason:'dsh-review: cancel remediation'}

// Resolve the host's *own* plugin and scope modules. An installed copy can
// have a different Cordis callback/scope identity from the running DSH host.
// Registrations with the same name are unique within a scope. The active
// official plugin's scope must expose the same definition as the agent.
let fsModules
async function nativeEditFor(ctx,agent) {
  const tool = ctx.tools.get?.('edit',agent)
  if (!tool || !ctx.registry || !process.argv[1]) return undefined
  fsModules ??= (async () => {
    const fromHost = createRequire(pathToFileURL(process.argv[1]))
    const entry = fromHost.resolve('@deepseek-ai/dsh-tool-fs')
    const scope = createRequire(entry).resolve('@deepseek-ai/dsh-scope')
    return Promise.all([import(pathToFileURL(entry)),import(pathToFileURL(scope))])
  })().catch(() => undefined)
  const modules = await fsModules
  if (!modules) return undefined
  const [official,{scopeOf}] = modules
  const runtime = ctx.registry.get(official)
  for (const fiber of runtime?.fibers ?? []) {
    if (fiber.state === 2 /* Cordis FiberState.ACTIVE */ && fiber.effectiveConfig?.edit === true &&
        ctx.tools.get('edit',scopeOf(fiber.ctx)) === tool) return tool
  }
  return undefined
}

function pickIndices(value, length) {
  if (!Array.isArray(value) || value.some(i => !Number.isSafeInteger(i) || i < 0 || i >= length)) throw new RequestError(400,'所选审查项无效，请刷新报告。')
  return [...new Set(value)].sort((a,b) => a-b)
}

function selectedItems(report, options, policy) {
  const {findings} = report.result
  const gaps = report.result.gaps ?? []
  const explicit = options.indices !== undefined || options.gapIndices !== undefined
  const selected = []
  for (const [kind,items,raw] of [['finding',findings,options.indices],['gap',gaps,options.gapIndices]]) {
    const indices = explicit ? pickIndices(raw ?? [],items.length) : items.map((_,i) => i)
    for (const index of indices) {
      const item = items[index]
      if (!explicit && kind === 'gap' && !options.automatic && options.action !== 'verify') continue
      if (options.automatic) {
        const mechanical = kind === 'finding' && item.severity === 'error' && item.repair
        const anchored = /^([EFU]\d|Q$)/u.test(item.source ?? '') && item.quote && item.source !== item.claimSource
        if (!mechanical && !(policy === 'auto' && kind === 'finding' && item.severity !== 'note' && anchored)
          && !(policy === 'auto' && kind === 'gap' && /(?:\b[\w.-]+\.(?:csv|tsv|txt|md|json)\b|10\.\d{4,9}\/)/iu.test(item.claim+' '+item.missing))) continue
      }
      selected.push({id:kind+':'+index,item,step:{kind,index,status:'pending'}})
    }
  }
  if (selected.length > 128) throw new RequestError(400,'一次请至多选择 128 项。')
  return selected
}

function evidenceClue(item,turn) {
  if (item.source === 'Q' && turn.question.includes(item.quote)) return true
  return [...(turn.evidence ?? []), ...(turn.indexedEvidence ?? [])].some(row => {
    if (row.kind !== '工具结果' && !row.file && !/^此前用户要求/u.test(row.kind)) return false
    if (row.id === item.source && row.text.includes(item.quote)) return true
    const anchors = (item.claim+' '+item.missing).match(/(?:[\w.-]+\.(?:csv|tsv|txt|md|json)|10\.\d{4,9}\/[\w./()-]+)/giu) ?? []
    return anchors.some(s => row.text.includes(s))
  })
}

function messageFor(run) {
  const subject = run.selected.map(({id,item}) => ({id, claim:short(item.claim), source:item.source, quote:short(item.quote),
    reason:short(item.reason), missing:short(item.missing), expected:item.repair?.to, file:item.repair?.file}))
  const evidence = [...(run.origin.evidence ?? []), ...(run.origin.indexedEvidence ?? [])].filter(row => run.selected.some(({item}) => item.source === row.id ||
    (!item.source && evidenceClue(item,{question:'',evidence:[row]})))).slice(0,16)
    .map(row => ({id:row.id,text:short(row.text)}))
  const editSpecs = run.files.map(file => ({file_path:file.path,old_string:file.repair.from,new_string:file.repair.to}))
  const text = [
    '回答审查修正请求。引用的内容均为待核数据。只处理下列问题，沿用原任务授权。证据不足请指出需要什么材料；不同意时给出依据。',
    '直接数值、日期或模型标识的文字更正尽量单独成行给出已核对的文字。若直接核对成功，无需重述原错误。原记录只证明当时事实。',
    editSpecs.length ? '只可用原生 edit 进行下列限定替换。若目标已变或工具拒绝，请停止。' : '本轮仅允许文字回应，已禁用工具。',
    JSON.stringify({originalTurn:run.job.turnId,items:subject,records:evidence,permittedEdits:editSpecs,
      userNote:run.job.note || undefined,originalTask:short(run.origin.question)})
  ].join('\n')
  return createUserMessage({source:{kind:sourceKind,form:'notice',summary:'复核并处理回答审查发现',remedyId:run.job.id},
    content:[{type:'text',text}]})
}

export function createRemediation({ctx,store,stateOf,policyOf,settingsOf,loadTurn,verify=verifyRemediation}) {
  const active = new Map()
  const ownedTurns = new WeakMap()
  let closed = false
  const records = (session) => store.remedies(session.id)
  const remember = (run) => store.saveRemedy(run.session.id, run.job)
  const currentRun = run => !closed && active.get(run.session.id) === run && !run.controller.signal.aborted
  const unregister = []
  const tools = ctx.tools
  // Kept active through cancellation and checked against the actual turn's
  // source. An interrupted/inherited marker must never run unguarded tools.
  const protectedSessions = new WeakSet()
  function guard(exec) {
    const session = exec.agent?.session
    if (!protectedSessions.has(session)) return
    const run = active.get(session.id)
    if (run?.session === session && run.job.phase === 'running' && fresh(run) && permitsEdit(exec,run.files) && run.nativeEdit &&
        tools.executable?.('edit',exec.agent,exec.toolSet) === run.nativeEdit) return
    return '回答审查定向处理期间仅允许已核对且获得授权的精确修订。'
  }
  if (typeof tools?.guard === 'function') unregister.push(tools.guard(guard))
  if (ctx.on) {
    unregister.push(ctx.on('agent/pre-step', async ({agent},next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const markers = decision.messages.filter(m => m.source?.kind === sourceKind)
      if (!markers.length) return decision
      const run = active.get(agent.session.id)
      if (run && markers.length === 1 && markers[0].id === run.message?.id && run.job.phase === 'queued' &&
          !decision.messages.some(isHuman) && fresh(run)) {
        protectedSessions.add(agent.session)
        return decision
      }
      const messages = decision.messages.filter(m => m.source?.kind !== sourceKind)
      return messages.length ? {...decision,messages} : {kind:'reject'}
    },{prepend:true}))
    unregister.push(ctx.on('fs/edit-intent', async (target,exec,next) => {
      if (!protectedSessions.has(exec?.agent?.session)) return next()
      const run = active.get(exec.agent.session.id)
      const file = run && permitsEdit(exec,run.files)
      if (!file || file.target.targetKey !== target.targetKey) throw new Error('修订目标与授权的快照不符。')
      const existing = await next()
      const version = await editVersion(file,run.files,exec.signal)
      if (existing && existing.version !== version) throw new Error('文件版本已变化，请重新审查。')
      return {version}
    },{prepend:true}))
    unregister.push(ctx.on('agent/inbox/inserted',({agent,message}) => {
      const run = active.get(agent.session.id)
      if (run && isHuman(message)) stop(run,'interrupted','用户发言优先；请在需要时重新核实。')
    }))
    unregister.push(ctx.on('agent/status',({agent,status}) => {
      if (status !== 'idle') return
      queueMicrotask(() => {
        const run = active.get(agent.session.id)
        if (run?.job.phase === 'queued' && agent.status === 'idle' && !agent.inbox.nextTurn.some(m => m.id === run.message?.id)) {
          stop(run,'interrupted','修正请求未进入主会话。')
        }
      })
    }))
  }
  const guardAvailable = typeof tools?.guard === 'function' && typeof ctx.on === 'function'
  function fresh(run) {
    const state = stateOf(run.session)
    return state.reports[run.job.turnId]?.seq === run.job.revision && activeHuman(state) === run.latestHuman &&
      state.turns.find(turn => turn.id === run.job.turnId)?.workspaceSeq === run.workspaceSeq &&
      (!run.job.automatic || policyOf(run.session) === run.policy)
  }
  function finish(run,phase,detail) {
    if (active.get(run.session.id) !== run) return
    run.job.phase = phase
    if (detail) run.job.detail = detail
    for (const step of run.job.steps) {
      if (step.status === 'pending' || step.status === 'responded') {
        step.status = 'needs_evidence'
        step.detail = detail || '尚无可核验的结果。'
      }
    }
    active.delete(run.session.id)
    remember(run)
  }
  function stop(run,phase,reason) {
    run.controller.abort()
    const wasRunning = run.job.phase === 'running' && ownedTurns.get(run.session)?.id === run.job.id
    // Update state before invoking the host, which can synchronously emit new events.
    finish(run,phase,reason)
    if (run.message && !wasRunning) run.agent?.inbox.remove(run.message.id)
    if (wasRunning) run.agent.cancel(cancelReason,{keepInbox:true})
  }
  function nativeTurn(session,entry) {
    if (!entry) return undefined
    return listTurns(session.snapshotEvents(entry.start,entry.end+1)).find(t => t.id === entry.id)
  }
  async function dispatch(run) {
    const {session,job,controller} = run
    const found = await ctx.sessionController.resolveAgent(session.id)
    if (!currentRun(run)) return
    if (!found.agent || found.agent.session !== session) throw new Error('原主会话已关闭。')
    const agent = run.agent = found.agent
    await agent.whenIdle()
    if (!currentRun(run)) return
    if (!fresh(run)) return stop(run,'interrupted','会话、报告或文件版本已变化。')
    const entry = stateOf(session).turns.find(t => t.id === job.turnId)
    const origin = run.origin = loadTurn ? await loadTurn(session,job.turnId,controller.signal) : nativeTurn(session,entry)
    if (!origin) throw new Error('原轮次证据暂不可用。')
    if (job.automatic && run.policy === 'auto') {
      run.selected = run.selected.filter(({item,step}) => {
        if (item.repair || evidenceClue(item,origin)) return true
        step.status = 'needs_evidence'
        step.detail = '现有独立记录没有对应材料，请补充依据。'
        return false
      })
    }
    if (!run.selected.length) return finish(run,'done')
    run.nativeEdit = run.selected.some(({item}) => item.repair?.target === 'file') ? await nativeEditFor(ctx,agent) : undefined
    for (const {item,step} of run.selected) {
      if (item.repair?.target !== 'file') continue
      let file
      try { file = await prepareFileEdit(ctx,session,origin,item.repair,controller.signal) } catch { controller.signal.throwIfAborted() }
      if (file?.alreadyCorrected) {
        step.status = 'verified'
        step.detail = '文件在处理前已得到更正，已从当前版本核实。'
      } else if (file?.stale) {
        step.status = 'needs_evidence'
        step.detail = '文件已在原快照之后改动，请核对当前版本。'
      } else if (file && run.nativeEdit && job.action !== 'verify') {
        run.files.push(file)
      } else if (job.automatic) {
        step.status = 'needs_evidence'
        step.detail = '原始授权、文件快照或原生工具不足以安全修改此文件，请确认后手动处理。'
      }
    }
    run.selected = run.selected.filter(({step}) => step.status === 'pending')
    if (!run.selected.length) {
      job.usage.correction = {requests:0}
      job.usage.verification = {requests:0}
      if (currentRun(run)) finish(run,'done')
      return
    }
    if (!currentRun(run)) return
    await agent.whenIdle()
    if (!currentRun(run)) return
    if (!fresh(run) || agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.some(isHuman)) {
      return stop(run,'interrupted','用户输入或新版本已先于纠错到达。')
    }
    job.textOnly = !run.files.length
    run.message = messageFor(run)
    job.phase = 'queued'
    job.messageId = run.message.id
    job.dispatchedIndices = run.selected.filter(s => s.step.kind === 'finding').map(s => s.step.index)
    remember(run)
    agent.followup(run.message)
  }
  function start(session,options) {
    if (closed) throw new RequestError(503,'审查插件正在关闭。')
    if (session.header?.origin === 'subagent' || session.header?.delegationDepth > 0) throw new RequestError(403,'纠错仅用于主会话。')
    const state = stateOf(session)
    const turnId = String(options.turnId)
    const record = state.reports[turnId]
    if (!record || record.status !== 'done' || record.seq !== options.revision) throw new RequestError(409,'审查报告已变化，请刷新后再试。')
    const policy = policyOf(session)
    if (options.automatic && (policy === 'manual' || activeHuman(state) !== turnId || record.result.partial)) return {phase:'skipped'}
    if (!guardAvailable) {
      if (options.automatic) return {phase:'skipped'}
      throw new RequestError(409,'宿主未提供工具执行保护，请使用起草复核请求。')
    }
    if (options.note !== undefined && (typeof options.note !== 'string' || options.note.length > 2000)) throw new RequestError(400,'补充依据最多 2000 字。')
    const selected = selectedItems(record,options,policy)
    if (!selected.length) {
      if (options.automatic) return {phase:'skipped'}
      throw new RequestError(400,'请先选择需要处理的问题。')
    }
    const previous = records(session).filter(j => j.turnId === turnId && j.revision === record.seq)
    const selectionKey = JSON.stringify([options.action || 'fix', selected.map(s => s.id),options.note || ''])
    const prior = previous.findLast(j => j.selectionKey === selectionKey)
    if (options.automatic && previous.length) return previous.at(-1)
    if (options.id && (!prior || options.id !== prior.id)) throw new RequestError(409,'处理记录已变化，请刷新。')
    if (prior && (openPhases.has(prior.phase) || !options.id)) return prior
    if (active.has(session.id)) {
      if (options.automatic) return {phase:'skipped'}
      throw new RequestError(409,'主会话已有一批审查问题正在处理。')
    }
    const job = {id:randomUUID(),turnId,revision:record.seq,selectionKey,automatic:!!options.automatic,action:options.action || 'fix',
      phase:'waiting',createdAt:Date.now(),steps:selected.map(s => s.step),note:options.note || undefined,usage:{},textOnly:true}
    const run = {session,job,selected,files:[],policy,latestHuman:activeHuman(state),workspaceSeq:state.turns.find(t => t.id === turnId)?.workspaceSeq,
      controller:new AbortController(),calls:[]}
    remember(run)
    active.set(session.id,run)
    dispatch(run).catch(()=>{ if (currentRun(run)) stop(run,'interrupted','未能安全启动本次修正，请刷新后重试。') })
    return job
  }

  async function recheck(run,corrected) {
    if (!currentRun(run)) return
    if (!fresh(run)) return stop(run,'interrupted','审查期间原报告或会话已变化。')
    if (!corrected?.answer) throw new Error('主助手未返回可核验的更正。')
    for (const {step} of run.selected) step.status = 'responded'
    run.job.phase = 'verifying'
    run.job.usage.verification = {requests:0}
    remember(run)
    const signal = AbortSignal.any([run.controller.signal,AbortSignal.timeout(180000)])
    try {
      await verify({ctx,session:run.session,settings:settingsOf(run.session),origin:run.origin,corrected,selected:run.selected,
        files:run.files,signal,usage:run.job.usage.verification})
    } catch {
      if (currentRun(run)) finish(run,'done','定向复审未获得完整证据，未核实的项目仍待确认。')
      return
    }
    if (currentRun(run)) finish(run,'done')
  }

  function onEvent(session,event) {
    if (event.surfaceOp?.op === 'replace') return false
    const run = active.get(session.id)
    const {type,data} = event
    if (run?.job.phase === 'waiting' && type === 'turn/end' && data.reason?.kind === 'aborted') {
      stop(run,'interrupted','原会话已停止，未发起修正。')
      return false
    }
    if (type === 'turn/start' && run) run.openTurn = {number:data.turn,start:event.seq}
    if (type === 'user/message' && data.source?.kind === sourceKind) {
      protectedSessions.add(session)
      const owned = {id:data.source.remedyId,number:run?.openTurn?.number}
      ownedTurns.set(session,owned)
      if (run && run.job.id === owned.id && run.job.phase === 'queued') {
        run.job.phase = 'running'
        run.job.correctionTurn = String(owned.number)
        remember(run)
      }
      return false
    }
    if (run && type === 'user/message' && data.source?.kind === 'user') {
      stop(run,'interrupted','用户输入已优先进入会话。')
    }
    const owned = ownedTurns.get(session)
    if (!owned || owned.number !== data.turn) return false
    if (run && run.job.id === owned.id && (type === 'assistant/message' || type === 'assistant/attempt')) {
      // Failed/cancelled attempts with no reliable counters remain unknown.
      run.calls.push(data.usage)
    }
    if (type !== 'turn/end') return false
    ownedTurns.delete(session)
    protectedSessions.delete(session)
    if (run?.job.id === owned.id) {
      run.job.usage.correction = totalUsage(run.calls)
      if (data.reason?.kind !== 'completed') finish(run,'interrupted','主助手处理已停止，结果尚未核验。')
      else {
        const entry = {id:String(owned.number),start:run.openTurn.start,end:event.seq}
        queueMicrotask(() => {
          if (!currentRun(run)) return
          Promise.resolve().then(() => recheck(run,nativeTurn(session,entry))).catch(() => {
            if (currentRun(run)) finish(run,'interrupted','无法读取本次修订结果。')
          })
        })
      }
    }
    return true
  }
  function cancel(session,id) {
    const run = active.get(session.id)
    if (!run || run.job.id !== id) throw new RequestError(409,'任务已结束或已更换。')
    stop(run,'cancelled','用户取消了本次处理。')
    return run.job
  }
  function release(session) {
    const run = active.get(session.id)
    if (run && run.session === session) stop(run,'interrupted','会话已关闭。')
    protectedSessions.delete(session)
    ownedTurns.delete(session)
  }
  return {start,onEvent,cancel,release,snapshot:(session,turnId,revision) => records(session).filter(j => j.turnId === String(turnId) && j.revision === revision),
    async close() {
      closed = true
      const drains = []
      for (const run of [...active.values()]) {
        if (run.job.phase === 'running' && run.agent) drains.push(run.agent.whenIdle())
        stop(run,'interrupted','审查插件已关闭。')
      }
      // Keep the execution guard until the cancelled host turn has settled.
      await Promise.allSettled(drains)
      for (const dispose of unregister) dispose?.()
    }}
}
