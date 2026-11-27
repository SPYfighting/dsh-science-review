import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as tick } from 'node:timers/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { openReviewStore } from '../lib/review-store.js'
import { Session } from '@deepseek-ai/dsh-session'
import { projection, createRunner, withFeedback, registerRoutes, readTurn } from '../lib/index.js'
import { defaults, configuration, catalog, efforts, saveSettings } from '../lib/settings.js'

const events = [
  { type: 'turn/start', data: { turn: 1 } },
  { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '核对结果' }] } },
  { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '均值为 9。' }] } } },
  { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
].map((event, seq) => ({ ...event, seq }))
const fold = (rows, inherited = 0) => rows.reduce(projection.apply, projection.init({}, inherited))
const result = { summary: '有一处数值冲突', findings: [{ severity: 'error', check: 'numbers',
  claim: '9', evidence: '8', reason: '记录中的均值为 8。', suggestion: '按原始数据纠正。' }] }

function fixture(mode = 'manual') {
  const session = Session.create('review-test')
  const ctx = {
    sessions: { get: () => session, flush: async () => true },
    logger: { warn: message => { throw new Error(message) } },
  }
  const settings = { ...defaults, mode }
  const store = openReviewStore(':memory:')
  const state = () => store.state(session.id, fold(events))
  let count = 0
  const runner = createRunner(ctx, settings, state, store, async () => { count++; return result },
    async () => ({ id: '1', question: '核对结果', answer: '均值为 9。', evidence: [], limitations: [] }))
  return { ctx, runner, session, settings, store, state, count: () => count }
}

test('相同回合并发请求合并，完成报告重用，更改审查项后可重新运行', async () => {
  const f = fixture()
  assert.equal(f.runner.start(f.session, '1').status, 'running')
  assert.equal(f.runner.start(f.session, '1').status, 'running')
  await tick()
  assert.equal(f.count(), 1)
  const report = f.runner.snapshot(f.session).turns[0].review
  assert.equal(report.result.summary, result.summary)
  assert.equal(report.trigger.mode, 'manual')
  assert.deepEqual(report.feedback, { sent: 0, total: 1 })
  assert.equal(f.runner.start(f.session, '1').status, 'done')
  f.settings.instructions = '核对分母'
  f.runner.start(f.session, '1')
  await tick()
  assert.equal(f.count(), 2)
  assert.equal(f.session.snapshotEvents().length, 0)
  await f.runner.close()
})

test('失败报告的请求用量写入会话并可从投影快照恢复，兼容没有用量的旧报告', async () => {
  const f = fixture()
  const usage = { requests: 2, totalTokens: 110 }
  const runner = createRunner(f.ctx, f.settings, f.state, f.store,
    async () => { throw Object.assign(new Error('审查输出两次未通过校验'), { reviewUsage: usage }) },
    async () => ({ id: '1', limitations: [] }))
  runner.start(f.session, '1')
  await tick()
  assert.deepEqual(f.state().reports['1'].usage, usage)
  const saved = projection.stateSchema.parse(JSON.parse(JSON.stringify(f.state())))
  const restored = createRunner(f.ctx, f.settings, () => saved)
  const report = restored.snapshot(f.session).turns[0].review
  assert.equal(report.status, 'error')
  assert.match(report.error, /两次未通过校验/)
  assert.deepEqual(report.usage, usage)
  delete saved.reports['1'].usage
  assert.equal(restored.snapshot(f.session).turns[0].review.usage, undefined)
  await Promise.all([runner.close(), restored.close(), f.runner.close()])
})

test('仅有完成的主会话真人请求可自动启动，手动模式不花费模型请求', async () => {
  const f = fixture()
  f.runner.onTurnEnd(f.session, events.at(-1))
  await tick()
  assert.equal(f.count(), 0)
  f.settings.mode = 'every'
  f.runner.onTurnEnd({ header: { origin: 'subagent' } }, events.at(-1))
  f.runner.onTurnEnd(f.session, { ...events.at(-1), data: { turn: 1, reason: { kind: 'error' } } })
  f.runner.onTurnEnd(f.session, { ...events.at(-1), type: 'plugin:dsh-review/report' })
  await tick()
  assert.equal(f.count(), 0)
  f.runner.onTurnEnd(f.session, events.at(-1))
  await tick()
  assert.equal(f.count(), 1)
  const noHuman = fold(events.filter(e => e.type !== 'user/message'))
  const isolated = createRunner(f.ctx, f.settings, () => noHuman, f.store, () => assert.fail('内部回合不得触发'))
  isolated.onTurnEnd(f.session, events.at(-1))
  await tick()
  assert.equal(isolated.snapshot(f.session).turns[0].review, null)
  await isolated.close()
  await f.runner.close()
})

test('关键轮次记录具体触发依据，普通确认不产生审查报告', async () => {
  const f = fixture('key')
  let answer = '收到。'
  let calls = 0
  const runner = createRunner(f.ctx, f.settings, f.state, f.store, async () => { calls++; return result },
    async () => ({ id: '1', number: 1, question: '给出总费用', answer, evidence: [], limitations: [] }))
  runner.start(f.session, '1', true)
  await tick()
  assert.equal(calls, 0)
  answer = '总额为 280 元。'
  runner.start(f.session, '1', true)
  await tick()
  const report = runner.snapshot(f.session).turns[0].review
  assert.equal(calls, 1)
  assert.equal(report.trigger.mode, 'key')
  assert.match(report.trigger.reason, /数值|费用/)
  await runner.close()
})

test('模式和报告可重放；反馈仅在有真实用户输入时一次性纳入', async () => {
  const f = fixture()
  f.runner.setMode(f.session, 'every')
  assert.equal(f.runner.snapshot(f.session).effectiveMode, 'every')
  f.runner.start(f.session, '1')
  await tick()
  const state = f.state()
  assert.equal(projection.stateSchema.safeParse(state).success, true)
  const synthetic = { kind: 'enter', messages: [{ source: { kind: 'time-context' } }] }
  assert.equal(withFeedback(state, synthetic), synthetic)
  const real = { kind: 'enter', messages: [events[1].data] }
  const feedback = withFeedback(state, real).messages[0]
  assert.equal(feedback.source.kind, 'dsh-review-feedback')
  assert.match(feedback.content[0].text, /记录中的均值/)
  assert.match(feedback.content[0].text, /error/)
  assert.match(feedback.content[0].text, /说明理由/)
  assert.match(feedback.content[0].text, /只按用户已授权的范围行动/)
  const admitted = f.store.state(f.session.id, projection.apply(fold(events), { type: 'user/message', seq: 99, data: feedback }))
  assert.equal(withFeedback(admitted, real), real)
  assert.equal(fold(events, events.length).turns.length, 0)
  await f.runner.close()
})

test('宿主 API 拒绝未授权请求及分享访客，不泄露会话状态', async () => {
  const handlers = new Map()
  let auth = { rejection: 401 }
  const ctx = { effect: fn => fn(), webServer: { register: r => handlers.set(r.path, r.handler) },
    connection: { admit: () => auth } }
  registerRoutes(ctx, {}, {})
  for (const [principal, expected] of [[{ rejection: 403 }, 403], [auth, 401], [{ peer: { principal: { kind: 'guest' } } }, 403]]) {
    auth = principal
    for (const handler of handlers.values()) {
      let status
      await handler({ method: 'GET' }, { writeHead(code) { status = code }, end() {} })
      assert.equal(status, expected)
    }
  }
})

test('配置写入使用目录和修订号，支持模型名、provider id 中的斜杠', async () => {
  const provider = 'lab/gateway', id = 'family/model'
  const llm = { listProviders: () => [{ id: provider }, { id: 'offline' }],
    listModels: async p => { if (p === 'offline') throw new Error('offline'); return [{ id, name: 'Model', provider }] },
    resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } }) }
  const config = { ...defaults }
  let revision = 3
  const ctx = { llm, settings: {
    describe: () => [{ ns: 'dsh-review', revision }],
    update: async (_ns, s, rev) => {
      if (rev !== revision) throw Object.assign(new Error(), { code: 'SETTINGS_CONFLICT' })
      Object.assign(config, s); revision++
    },
  } }
  const directory = await catalog(llm)
  assert.deepEqual(directory.errors, ['offline'])
  assert.deepEqual((await efforts(llm, [provider, id])).efforts.map(e => e.id), ['high'])
  const settings = { ...config, model: directory.models[0].value, effort: 'high' }
  await assert.rejects(saveSettings(ctx, config, { settings: { ...settings, effort: 'max' }, revision }), /不支持/)
  assert.equal((await saveSettings(ctx, config, { settings, revision })).revision, 4)
  await assert.rejects(saveSettings(ctx, config, { settings, revision: 3 }), /重新载入/)
  assert.deepEqual(defaults.checks.slice(-3), ['code', 'writing', 'scope'])
  const original = { ...settings, checks: ['plan', 'execution'] }
  assert.deepEqual(configuration(original).checks, ['plan', 'execution'])
  for (const id of ['code', 'writing', 'scope']) {
    const saved = await saveSettings(ctx, config, { settings: { ...settings, checks: [id] }, revision })
    assert.deepEqual(saved.settings.checks, [id])
  }
})

function putReport(state, turnId, seq, findings) {
  return projection.apply(state, { type: 'plugin:dsh-review/report', seq,
    data: { key: 'fixture', updatedAt: 123, turnId, status: 'done', result: { summary: '复核报告', findings } } })
}
const humanDecision = text => ({ kind: 'enter', messages: [
  { source: { kind: 'user' }, content: [{ type: 'text', text }] },
] })
function receipt(state, message) {
  return projection.apply(state, { type: 'user/message', seq: 999, data: message })
}
function extracted(message) {
  return JSON.parse(message.content[0].text.split('\n').at(-1))
}

test('按严重程度分批传达多个报告，剩余发现保留到下一条用户输入，历史重放不重复送达', () => {
  const notes = Array.from({ length: 7 }, (_, i) => ({ ...result.findings[0], severity: 'note', claim: '说明' + i }))
  let state = putReport(fold(events), '1', 70, notes)
  state = putReport(state, '2', 80, result.findings)
  const decision = humanDecision('请继续')
  const first = withFeedback(state, decision).messages[0]
  assert.equal(extracted(first).findings[0].severity, 'error')
  assert.equal(extracted(first).remaining, 2)
  state = receipt(state, first)
  assert.deepEqual(state.reports['1'].sent, [0, 1, 2, 3, 4])
  assert.deepEqual(state.reports['2'].sent, [0])
  state = receipt(state, first)
  const second = withFeedback(state, decision).messages[0]
  assert.deepEqual(extracted(second).findings.map(row => row.item), [6, 7])
  state = receipt(state, second)
  assert.equal(withFeedback(state, decision), decision)
  const session = Session.create('progress')
  const runner = createRunner({}, defaults, () => state)
  assert.deepEqual(runner.snapshot(session).turns[0].review.feedback, { sent: 7, total: 7 })
})

test('显式复核旧报告可再次带入已送达的问题，相同时间戳的新报告不接受旧报告回执', () => {
  let state = putReport(fold(events), '1', 70, result.findings)
  const first = withFeedback(state, humanDecision('继续')).messages[0]
  state = receipt(state, first)
  const explicit = humanDecision('请复核第 1 轮的审查报告。\n请解释。')
  assert.deepEqual(extracted(withFeedback(state, explicit).messages[0]).findings.map(f => f.turn), ['1'])
  state = putReport(state, '1', 75, result.findings)
  assert.deepEqual(receipt(state, first).reports['1'].sent, [])
})

test('0.1.0 的全报告回执按实际曾发送的前四项恢复', () => {
  const findings = Array.from({ length: 6 }, () => result.findings[0])
  let state = putReport(fold(events), '1', 7, findings)
  state = receipt(state, { source: { kind: 'dsh-review-feedback', reviews: [['1', 123]] } })
  assert.deepEqual(state.reports['1'].sent, [0, 1, 2, 3])
  assert.equal(projection.stateSchema.safeParse(state).success, true)
  assert.deepEqual(extracted(withFeedback(state, humanDecision('继续')).messages[0]).findings.map(f => f.item), [5, 6])
})

test('自动筛选尚未完成时，用户手动要求审查的回合仍执行一次', async () => {
  const f = fixture('key')
  const input = Promise.withResolvers()
  let count = 0
  const runner = createRunner(f.ctx, f.settings, f.state, f.store, async () => { count++; return result }, () => input.promise)
  runner.start(f.session, '1', true)
  assert.equal(runner.start(f.session, '1').status, 'running')
  input.resolve({ id: '1', answer: '好的。', evidence: [], limitations: [] })
  await tick()
  assert.equal(count, 1)
  await runner.close()
})

test('迟到的工作区差异仍归入正确回合，能按最新事件编号读取', () => {
  const state = fold(events)
  const announced = projection.apply(state, { type: 'workspace/changes', seq: 11, data: { turn: 1 } })
  assert.equal(announced.turns[0].workspaceSeq, 11)
  assert.equal(projection.stateSchema.safeParse(announced).success, true)
})


test('存储后端返回短页时连续读取至选中轮次末尾，缺页时拒绝出具报告', async () => {
  const calls = []
  let closed = 0, missing = false
  const ctx = { sessions: { flush: async () => {} }, sessionPersistence: {
    open: async () => ({
      async read(start, count) {
        calls.push(start)
        return { events: missing && start === 2 ? [] : events.slice(start, start + Math.min(count, 2)) }
      }, close: async () => { closed++ },
    }),
  } }
  const entry = fold(events).turns[0]
  const turn = await readTurn(ctx, { id: 'tiny-pages' }, entry)
  assert.equal(turn.answer, '均值为 9。')
  assert.deepEqual(calls, [0, 2])
  missing = true
  await assert.rejects(readTurn(ctx, { id: 'tiny-pages' }, entry), /缺少/)
  assert.equal(closed, 2)
})

test('准备证据期间到达的本轮与历史交付物快照都按最新编号提交', async () => {
  const f = fixture()
  const original = f.state()
  const older = { ...original.turns[0], id: '0' }
  let projectionState = { ...original, turns: [older, ...original.turns] }
  const input = Promise.withResolvers()
  let observed
  const runner = createRunner(f.ctx, f.settings, () => projectionState, f.store, async ({ turn }) => {
    observed = turn
    return result
  }, () => input.promise)
  runner.start(f.session, '1')
  await tick()
  for (const [turn, seq] of [[0, 9], [1, 10]]) {
    projectionState = projection.apply(projectionState, { type: 'workspace/changes', seq, data: { turn } })
  }
  input.resolve({ id: '1', answer: '本次结果', limitations: [], previousDelivery: { number: 0 } })
  await tick()
  assert.equal(observed.workspaceSeq, 10)
  assert.equal(observed.previousDelivery.workspaceSeq, 9)
  await runner.close()
})

test('插件自有存储在重启后区分会话，并在重新审查时使旧反馈回执失效', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-review-store-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'reports.sqlite')
  let store = openReviewStore(file)
  const legacy = { mode: 'key', reports: { old: { seq: 8, sent: [0] } }, receipts: {} }
  const record = { status: 'done', result }
  store.setMode('session-a', 'every')
  store.saveReport('session-a', 'turn', record)
  const revision = store.state('session-a', legacy).reports.turn.seq
  store.close()
  store = openReviewStore(file)
  t.after(() => store.close())
  const receipt = { ...legacy, receipts: { turn: { revision, indices: [0] } } }
  assert.deepEqual(store.state('session-a', receipt).reports.turn.sent, [0])
  assert.equal(store.state('session-a', receipt).mode, 'every')
  assert.deepEqual(store.state('session-b', legacy).reports, legacy.reports)
  store.saveReport('session-a', 'turn', record)
  const updated = store.state('session-a', receipt)
  assert.notEqual(updated.reports.turn.seq, revision)
  assert.deepEqual(updated.reports.turn.sent, [])
  assert.deepEqual(updated.reports.old, legacy.reports.old)
})


test('宿主进程崩溃后修正记录可恢复，另一个活跃宿主保留其任务', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-review-recovery-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'reports.sqlite')
  const url = new URL('../lib/review-store.js', import.meta.url).href
  const job = { id: 'first', phase: 'running', correctionTurn: '2', turnId: '1', revision: 7,
    dispatchedIndices: [0], steps: [{ status: 'responded' }] }
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    const {openReviewStore} = await import(process.argv[1])
    const store = openReviewStore(process.argv[2])
    store.saveRemedy('s', JSON.parse(process.argv[3]))
    store.close()
  `, url, file, JSON.stringify(job)])
  const store = openReviewStore(file)
  t.after(() => store.close())
  const second = { ...job, id: 'second' }
  assert.throws(() => store.saveRemedy('s', second), /unique/i)
  store.interruptRemedies()
  const [interrupted] = store.remedies('s')
  assert.equal(interrupted.phase, 'interrupted')
  assert.equal(interrupted.steps[0].status, 'needs_evidence')
  const legacy = { mode: 'manual', reports: { '1': { seq: 7, result, sent: [] } } }
  assert.deepEqual(store.state('s', legacy).reports['1'].sent, [0])
  store.saveRemedy('s', second)
  const other = openReviewStore(file)
  t.after(() => other.close())
  other.interruptRemedies()
  assert.equal(other.remedies('s').at(-1).phase, 'running')
})

test('同一项连续重试后，服务端和报告页面都收到按发起时间排列的处理记录', () => {
  const store = openReviewStore(':memory:')
  try {
    const common = { phase: 'done', action: 'verify', turnId: '1', revision: 7, selectionKey: 'same' }
    for (const id of ['first', 'second', 'third']) store.saveRemedy('s', { ...common, id })
    store.saveRemedy('s', { ...common, id: 'first', detail: '补全记录' })
    assert.equal(store.remedies('s').findLast(j => j.selectionKey === 'same').id, 'third')
    const state = store.state('s', { mode: 'manual', reports: {} })
    assert.deepEqual(state.remedyJobs.map(j => j.id), ['first', 'second', 'third'])
  } finally {
    store.close()
  }
})
