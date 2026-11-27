import test from 'node:test'
import assert from 'node:assert/strict'
import { listTurns, shouldReview, explainTrigger, reviewTurn } from '../lib/review.js'

const settings = { model: 'session', effort: 'inherit', checks: ['numbers', 'execution'], coverage: 'all', instructions: '核对分母' }
const route = { provider: 'lab', model: 'lab/model', reasoningEffort: 'high' }
const text = value => [{ type: 'text', text: value }]
const empty = { reviewed: ['A1'], findings: [], limitations: [] }
const event = (type, data) => ({ type, data })
const user = question => event('user/message', { role: 'user', source: { kind: 'user' }, content: text(question) })
const answer = (turn, value) => event('assistant/message', { turn, message: { content: text(value), source: { kind: 'model', ...route } } })
const start = turn => event('turn/start', { turn })
const end = (turn, kind = 'completed') => event('turn/end', { turn, reason: { kind } })
const withSeq = events => events.map((entry, seq) => ({ ...entry, seq }))
const nativeEvents = withSeq([
  event('request/header', { header: { config: route } }),
  start(0), user('请读 results.tsv'), event('user/message', { source: { kind: 'skill' }, content: text('秘密的技能上下文') }),
  event('tool/call', { turn: 0, step: 0, name: 'read', callId: 'c1', arguments: '{"path":"results.tsv"}' }),
  event('tool/result', { turn: 0, step: 0, message: { toolCallId: 'c1', content: text('n=9；均值 1.20 µM') } }),
  event('todo/write', { todos: [{ content: '核对分母', status: 'completed' }] }),
  answer(0, '已读取 results.tsv。'), end(0),
  start(1), user('归纳上一轮的结果。'), answer(1, '均值为 2.20 µM。'), end(1),
  start(2), user('下一问'), answer(2, '下一轮的结果'), end(2),
])

function context(responses, model = { reasoning: { efforts: [{ id: 'high' }, { id: 'low' }], defaultEffort: 'low' } }) {
  const calls = []
  const ctx = { llm: {
    async listModels() { return [{ id: 'other/model' }] },
    async prepareCall(config, signal, configure) {
      signal.throwIfAborted()
      const selected = configure(config, model)
      return { config: { reasoningEffort: model.reasoning?.defaultEffort, ...selected }, stream(request) {
        const response = responses[calls.length]
        calls.push(request)
        return (async function* () {
          if (Array.isArray(response)) { yield* response; return }
          yield { type: 'text-delta', index: 0, text: typeof response === 'string' ? response : JSON.stringify(response) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      } }
    },
  } }
  return { ctx, calls }
}

const session = { id: 'session-test', snapshotEvents: () => nativeEvents }
const target = listTurns(nativeEvents)[1]
const finding = { check: 'numbers', severity: 'error', claim: '2.20 µM', source: 'E5', quote: '1.20 µM',
  reason: '原始结果中的均值与回答不同。', suggestion: '将均值修正为原始值。' }

test('原生轮次边界、历史工具结果及计划可追溯，未带入注入消息或后续问题', () => {
  assert.deepEqual(listTurns(nativeEvents).map(t => [t.number, t.id, t.answerSeq, t.endSeq]), [[0, '0', 7, 8], [1, '1', 11, 12], [2, '2', 15, 16]])
  assert.equal(target.question, '归纳上一轮的结果。')
  assert.equal(target.route.model, 'lab/model')
  assert.equal(target.evidence.find(e => e.id === 'E5').turn, 0)
  assert.equal(target.evidence.find(e => e.id === 'E6').turn, 0)
  assert.doesNotMatch(JSON.stringify(target), /下一问|秘密的技能/)
  assert.equal(shouldReview({ ...target, answer: '好的。' }), false)
  assert.equal(shouldReview({ ...target, answer: '表达量提高了 2.5 倍。' }), true)
})

test('原生嵌套工具、附件元数据和文件交付登记可用，隐藏推理与中断回答忽略', () => {
  const events = withSeq([start(7), user('请核对图件'), event('tool/ptc-dispatch-start', { subCallId: 'p1', name: 'read', arguments: { path: 'plot.txt' } }),
    event('tool/ptc-dispatch', { subCallId: 'p1', name: 'read', content: text('x=1'), isError: true }),
    event('deliverables/presented', { turn: 7, files: [{ path: 'plot.png' }] }),
    event('assistant/message', { turn: 7, message: { content: [{ type: 'reasoning', text: 'hidden' }, ...text('完成')] } }),
    end(7), start(8), user('不要返回中断的回答'), answer(8, 'partial'), end(8, 'aborted')])
  const [turn] = listTurns(events)
  assert.equal(listTurns(events).length, 1)
  assert.equal(turn.answer, '完成')
  assert.match(turn.evidence.find(row => row.id === 'E3').text, /read \[p1\] 失败\nx=1/)
  assert.ok(turn.limitations.some(value => value.includes('交付登记')))
  assert.doesNotMatch(JSON.stringify(turn), /hidden/)
})

test('独立调用沿用目标回答路由和 effort，不附带工具；证据逐字核对并显示来源轮次', async () => {
  const { ctx, calls } = context([{ ...empty, findings: [finding] }])
  const result = await reviewTurn({ ctx, session, turn: '1', settings })
  assert.deepEqual(result.model, { provider: 'lab', model: 'lab/model', effort: 'high' })
  assert.equal(calls[0].tools, undefined)
  assert.equal(calls[0].purpose, 'dsh-review')
  assert.equal(calls[0].sessionId, session.id)
  assert.equal(result.findings[0].evidence, '[E5 · 第 0 轮] 1.20 µM')
  assert.equal(result.findings[0].claim, '2.20 µM')
  assert.match(calls[0].messages[0].content[0].text, /核对分母/)
})

test('独立模型 id 含斜杠，显式及默认 effort 与模型目录相符', async () => {
  const { ctx } = context([empty, empty])
  const fixed = { ...settings, model: JSON.stringify(['another/provider', 'other/model']) }
  const result = await reviewTurn({ ctx, session, turn: target, settings: fixed })
  assert.deepEqual(result.model, { provider: 'another/provider', model: 'other/model', effort: 'low' })
  assert.equal((await reviewTurn({ ctx, session, turn: target, settings: { ...fixed, effort: 'high' } })).model.effort, 'high')
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings: { ...fixed, effort: 'extreme' } }), /不支持/)
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings: { ...fixed, model: '["p","removed"]' } }), /模型列表/)
})

test('伪造数值、引用与无效 JSON 都不能产生无问题报告，格式仅重试一次', async () => {
  const { ctx, calls } = context([{ ...empty, findings: [{ ...finding, quote: '1.21 µM' }] }, 'none'])
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings }), /两次未通过校验/)
  assert.equal(calls.length, 2)
  const repaired = context(['bad', empty])
  assert.equal((await reviewTurn({ ctx: repaired.ctx, session, turn: target, settings })).findings.length, 0)
})

test('单条引文失败会点明条目、字段和合法来源，混合报告保留有原文依据的发现', async () => {
  const bad = { ...finding, source: 'E5', quote: '未经核实的内容 SHOULD_NEVER_ENTER_SYSTEM' }
  const both = { ...empty, findings: [finding, bad] }
  for (const second of [both, empty, 'invalid JSON']) {
    const { ctx, calls } = context([both, second])
    const report = await reviewTurn({ ctx, session, turn: target, settings })
    assert.equal(report.findings.length, 1)
    assert.equal(report.findings[0].quote, '1.20 µM')
    assert.match(report.limitations.join(' '), /未通过校验/)
    assert.equal(report.usage.requests, 2)
    assert.match(JSON.parse(calls[1].messages[0].content[0].text).retry.instruction, /findings\[1\] quote.*E5\.text/)
    assert.doesNotMatch(calls[1].system, /SHOULD_NEVER_ENTER_SYSTEM/u)
  }
})

test('伪造来源、括号与大小写不能作为逐字引文，补审返回空数组也不能报告无问题', async () => {
  for (const invalid of [
    { ...finding, source: 'FORGED_SOURCE_NEVER_IN_PROMPT' },
    { ...finding, quote: '1.20 µm' },
    { ...finding, claimSource: 'A1', claim: '（2.20 µM）' },
  ]) {
    const { ctx, calls } = context([{ ...empty, findings: [invalid] }, empty])
    await assert.rejects(reviewTurn({ ctx, session, turn: target, settings }), /无法确认本轮无问题/)
    assert.doesNotMatch(calls[1].system, /FORGED_SOURCE_NEVER_IN_PROMPT/)
  }
  const { ctx } = context([{ ...empty, findings: [{ ...finding, quote: '1.20 µm' }] }, { ...empty, findings: [finding] }])
  const repaired = await reviewTurn({ ctx, session, turn: target, settings })
  assert.equal(repaired.findings[0].quote, '1.20 µM')
})

test('多来源仅在列出的合法编号中唯一逐字命中时采纳，仍对实际命中来源检查授权和自证', async () => {
  const row = (id, value) => ({ id, turn: 1, kind: '工具结果', text: value })
  const turn = { ...target, question: '仅起草，禁止发送。', evidence: [row('E3', '样本，另有说明'), row('E4', '样本，均值 1.20 µM')] }
  const run = async (source, quote, check, expected) => {
    const item = { ...finding, source, quote, check }
    const response = { ...empty, findings: [item] }
    const { ctx, calls } = context([response, response])
    const task = reviewTurn({ ctx, session, turn, settings: { ...settings, checks: [check] } })
    if (expected) {
      const report = await task
      assert.equal(report.findings[0].source, expected)
      assert.equal(report.findings[0].quote, quote)
      assert.equal(calls.length, 1)
    } else {
      await assert.rejects(task, /两次未通过校验/)
      assert.equal(calls.length, 2)
    }
  }
  await run('E3、E4', '1.20 µM', 'numbers', 'E4')
  await run('E3, Q； E4', '1.20 µM', 'numbers', 'E4')
  await run('E4；Q', '禁止发送', 'scope', 'Q')
  for (const [source, quote, check] of [
    ['E3、E4', '样本', 'numbers'], ['E3、E4', '缺失的文本', 'numbers'],
    ['E99、E4', '1.20 µM', 'numbers'], ['E4、E4', '1.20 µM', 'numbers'],
    ['Q,E3,E4,A1', '1.20 µM', 'numbers'], ['E3 或 E4', '1.20 µM', 'numbers'],
    ['E4；Q', '1.20 µM', 'scope'], ['E4；A1', '2.20 µM', 'numbers'],
  ]) await run(source, quote, check)
})

test('跨补审合并同一问题的句末句号变化，保留不同段落、源文件和数字内部小数点的引文', async () => {
  const turn = { ...target, answer: '均值为 2.20 µM。\n均值为 2.20 µM。',
    evidence: ['E3', 'E4'].map(id => ({ id, turn: 1, kind: '工具结果', text: '样本来自 A 组。\nValue 1.20.\n数值 3.14。'})) }
  async function merged(first, second) {
    const make = item => ({ ...finding, claimSource: 'A1', source: 'E3', ...item })
    const { ctx } = context([{ ...empty, findings: [make(first)] }, { ...empty, reviewed: ['A1', 'A2'], findings: [make(second)] }])
    const report = await reviewTurn({ ctx, session, turn, settings })
    assert.equal(report.usage.requests, 2)
    return report.findings.length
  }
  assert.equal(await merged({ quote: '样本来自 A 组。' }, { quote: '样本来自 A 组' }), 1)
  assert.equal(await merged({ quote: 'Value 1.20' }, { quote: 'Value 1.20.' }), 1)
  assert.equal(await merged({ quote: '数值 3.' }, { quote: '数值 3' }), 2)
  assert.equal(await merged({ quote: '样本来自 A 组。' }, { quote: '样本来自 A 组。', claimSource: 'A2' }), 2)
  assert.equal(await merged({ quote: 'Value 1.20' }, { quote: 'Value 1.20.', source: 'E4' }), 2)
})

test('授权审查在不同任务中都区分用户委托的建议与实际行动', async () => {
  for (const [question, answer] of [
    ['请评估是否应该增加独立样本。', '建议增加独立样本。'],
    ['请比较两种报价并推荐一项。', '建议采用乙方报价。'],
  ]) {
    const { ctx, calls } = context([empty])
    await reviewTurn({ ctx, session, turn: { ...target, question, answer }, settings: { ...settings, checks: ['scope'] } })
    const data = JSON.parse(calls[0].messages[0].content[0].text)
    assert.equal(data.question.text, question)
    assert.match(data.checks.scope, /给出结论或建议本身在范围内/u)
  }
})

test('历史窗口缺结果、过长和逐条审查遗漏可辨识', async () => {
  const { ctx } = context([empty])
  const report = await reviewTurn({ ctx, session, turn: { ...target, answer: '第一段\n' + '超'.repeat(25000) + '\n最后一段', evidence: [] }, settings })
  assert.ok(report.limitations.some(value => value.includes('未覆盖中间')))
  assert.ok(report.limitations.some(value => value.includes('未覆盖') && value.includes('段落')))
  assert.ok(report.limitations.some(value => value.includes('没有工具结果')))
})

test('目标不存在、取消、缺少终止块、输出截断及工具请求均不产生审查报告', async () => {
  const { ctx } = context([])
  await assert.rejects(reviewTurn({ ctx, session, turn: '99', settings }), /不存在/)
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings, signal: AbortSignal.abort() }), { name: 'AbortError' })
  for (const [stream, expected] of [
    [[{ type: 'text-delta', text: '{}', index: 0 }], /中断/],
    [[{ type: 'finish', reason: { kind: 'max-tokens' } }], /长度上限/],
    [[{ type: 'tool-call-delta', index: 0 }], /工具未执行/],
  ]) {
    const fake = context([stream])
    await assert.rejects(reviewTurn({ ctx: fake.ctx, session, turn: target, settings }), expected)
    assert.equal(fake.calls.length, 1)
  }
})

test('只核对正式交付文件的同轮结束版本，精确定位行号并排除删除行和工作区外文件', async () => {
  const events = withSeq([start(1), user('交付 results.tsv'), answer(1, '均值为 2.20 µM。'),
    event('deliverables/presented', { turn: 1, files: [{ path: './results.tsv' }, { path: '/other/secret.txt' }, { path: 'plot.png' }] }),
    event('workspace/changes', { turn: 1 }), end(1), event('workspace/changes', { turn: 1 })])
  const [turn] = listTurns(events)
  assert.equal(turn.workspaceSeq, 6)
  const { ctx, calls } = context([{ ...empty, findings: [{ ...finding, source: 'F6.1', quote: '1.20 µM' }] }])
  const requests = []
  ctx.get = () => ({
    summary: () => ({ turn: 1, cwd: '/work', files: [{ path: 'unrelated.txt' }, { path: '/work/results.tsv' }, { path: '/other/secret.txt' }, { path: 'plot.png', binary: true }] }),
    async diff(sid, seq, index) {
      requests.push([sid, seq, index])
      return { kind: 'text', path: 'results.tsv', before: true, after: true,
        hunks: [{ newStart: 12, lines: [' unchanged', '-2.20 µM', '+1.20 µM', ' stable'] }] }
    },
  })
  const result = await reviewTurn({ ctx, session, turn, settings })
  assert.deepEqual(requests, [['session-test', 6, 1]])
  assert.equal(result.findings[0].evidence, '[F6.1 · 第 1 轮 · results.tsv:13] 1.20 µM')
  const file = JSON.parse(calls[0].messages[0].content[0].text).evidence.find(row => row.id === 'F6.1')
  assert.equal(file.text, 'L12 | unchanged\nL13 | 1.20 µM\nL14 | stable')
  assert.ok(result.limitations.some(line => line.includes('其余行')))
  assert.ok(result.limitations.some(line => line.includes('二进制')))
  assert.ok(result.limitations.some(line => line.includes('工作区内')))
})

test('工作区快照缺失不声称读过产物；常见中文数量进入关键轮次', async () => {
  const { ctx } = context([empty])
  const turn = { ...target, workspaceSeq: 3, presentedPaths: ['output.csv'] }
  const result = await reviewTurn({ ctx, session, turn, settings })
  assert.ok(result.limitations.some(line => line.includes('没有可用的 DSH 工作区快照')))
  for (const answer of ['实验共分3组。', '纳入12例。', '其中5个样本。']) {
    assert.equal(shouldReview({ ...turn, answer, evidence: [] }), true)
  }
})

test('逐条检查遗漏触发一次补审，合并已定位的问题和段落，保留先前有效发现', async () => {
  const { ctx, calls } = context([{ ...empty, findings: [finding] }, { ...empty, reviewed: ['A2'] }])
  const report = await reviewTurn({ ctx, session, turn: { ...target, answer: target.answer + '\n第二段。' }, settings })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].system, calls[1].system)
  const { retry, ...secondPayload } = JSON.parse(calls[1].messages[0].content[0].text)
  assert.deepEqual(JSON.parse(calls[0].messages[0].content[0].text), secondPayload)
  assert.deepEqual(retry.targetIds, ['A2'])
  assert.match(retry.instruction, /仅补审 A2/)
  assert.equal(report.findings[0].claim, '2.20 µM')
  assert.equal(report.coverage.reviewed, 2)
  assert.ok(report.limitations.every(line => !line.startsWith('逐条审查未覆盖 ')))
})

test('按维度传入待办与历史要求，合并重复快照并保留每次状态变化、原始调用及结果', async () => {
  const todo = status => event('todo/write', { turn: 2, todos: [{ content: '统计样本数', status }] })
  const run = withSeq([start(1), user('样本数是 12，只汇总。'), answer(1, '收到。'), end(1),
    start(2), user('继续。'), todo('pending'), todo('pending'),
    event('tool/call', { turn: 2, step: 0, name: 'read', callId: 'r', arguments: '{"path":"n.txt"}' }),
    todo('pending'), todo('completed'), todo('pending'),
    event('tool/result', { turn: 2, step: 0, message: { toolCallId: 'r', content: text('n=12') } }),
    answer(2, '样本数为12。'), end(2)])
  const turn = listTurns(run)[1]
  async function request(checks, review = turn) {
    const { ctx, calls } = context([empty])
    await reviewTurn({ ctx, session, turn: review, settings: { ...settings, checks } })
    assert.equal(calls.length, 1)
    return JSON.parse(calls[0].messages[0].content[0].text)
  }
  const numeric = await request(['numbers'])
  assert.deepEqual(Object.keys(numeric.checks), ['numbers'])
  assert.deepEqual(numeric.evidence.map(row => row.id), ['U1', 'E8', 'E12'])
  assert.match(numeric.evidence[0].text, /样本数是 12/)
  assert.doesNotMatch(JSON.stringify(numeric.evidence), /"seq"/)
  for (const check of ['plan', 'execution', 'scope']) {
    const result = await request([check])
    assert.deepEqual(result.evidence.map(row => row.id), ['U1', 'E6', 'E8', 'E10', 'E11', 'E12'])
  }
  const separate = { ...turn, question: '给这个班估计人数。' }
  assert.deepEqual((await request(['numbers'], separate)).evidence.map(row => row.id), ['E8', 'E12'])
  assert.ok((await request(['scope'], separate)).evidence.some(row => row.id === 'U1'))
})

test('用量按实际请求汇总终止时的完整计数，不重复计算缓存、推理或流中的更新', async () => {
  const usage = totalTokens => ({ type: 'usage', usage: { inputTokens: 15, outputTokens: 20, reasoningTokens: 10, cacheReadTokens: 5, totalTokens } })
  const reply = (value, ...events) => [
    { type: 'text-delta', index: 0, text: typeof value === 'string' ? value : JSON.stringify(value) },
    ...events, { type: 'finish', reason: { kind: 'stop' } },
  ]
  async function run(streams, turn = target) {
    const { ctx } = context(streams)
    return reviewTurn({ ctx, session, turn, settings })
  }
  const aggregated = (counts, total) => ({ requests: counts.length,
    stages: counts.map((value, i) => ({ stage: i ? 'retry' : 'initial', ...(value === 'unfinished' ? {} : {
      inputTokens: 15, outputTokens: 20, cacheReadTokens: 5, reasoningTokens: 10,
      ...(Number.isSafeInteger(value) && value >= 0 ? { totalTokens: value } : {}),
    }) })),
    ...(!counts.includes('unfinished') ? { inputTokens: 15 * counts.length, outputTokens: 20 * counts.length,
      cacheReadTokens: 5 * counts.length, reasoningTokens: 10 * counts.length } : {}),
    ...(total === undefined ? {} : { totalTokens: total }),
  })
  assert.deepEqual((await run([reply(empty, usage(20), usage(40))])).usage, aggregated([40], 40))
  assert.deepEqual((await run([reply('bad', usage(40)), reply(empty, usage(70))])).usage, aggregated([40, 70], 110))
  await assert.rejects(run([reply('bad', usage(40)), reply('still bad', usage(70))]), error => {
    assert.match(error.message, /两次未通过校验/)
    assert.deepEqual(error.reviewUsage, aggregated([40, 70], 110))
    return true
  })
  await assert.rejects(run([[usage(40)]]), error => {
    assert.match(error.message, /响应中断/)
    assert.deepEqual(error.reviewUsage, aggregated(['unfinished']))
    return true
  })
  for (const total of [undefined, null, -1, 0.5]) {
    assert.deepEqual((await run([reply('bad', usage(total)), reply(empty, usage(70))])).usage, aggregated([total, 70]))
  }
  const extended = { ...target, answer: target.answer + '\n第二段。' }
  const truncated = [usage(30), { type: 'finish', reason: { kind: 'max-tokens' } }]
  const partial = await run([reply(empty, usage(40)), truncated], extended)
  assert.deepEqual(partial.usage, aggregated([40, 30], 70))
  assert.equal(partial.coverage.reviewed, 1)
  assert.deepEqual((await run([reply(empty, usage(40)), [usage(30)]], extended)).usage, aggregated([40, 'unfinished']))
  const { ctx } = context([reply(empty, usage(40))])
  const prepare = ctx.llm.prepareCall
  let prepared = 0
  ctx.llm.prepareCall = (...args) => {
    if (prepared++) throw new Error('model unavailable')
    return prepare(...args)
  }
  const serviceFailure = await reviewTurn({ ctx, session, turn: extended, settings })
  assert.deepEqual(serviceFailure.usage, aggregated([40], 40))
})

test('收到错误类型或取消时保留模型诊断，尚未发起请求的错误没有用量', async () => {
  const controller = new AbortController()
  const { ctx } = context([])
  const reason = new DOMException('取消本次审查', 'AbortError')
  ctx.llm.prepareCall = async () => ({ config: {}, stream() { controller.abort(reason); throw reason } })
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings, signal: controller.signal }), error => {
    assert.equal(error, reason)
    assert.deepEqual(error.reviewUsage, { requests: 1, stages: [{ stage: 'initial' }] })
    return true
  })
  const unavailable = Object.freeze(Object.assign(new Error('model unavailable'), { code: 'OFFLINE' }))
  ctx.llm.prepareCall = async () => ({ config: {}, stream() { throw unavailable } })
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings }), error => {
    assert.equal(error.cause, unavailable)
    assert.equal(error.message, unavailable.message)
    assert.equal(error.code, 'OFFLINE')
    assert.deepEqual(error.reviewUsage, { requests: 1, stages: [{ stage: 'initial' }] })
    return true
  })
  ctx.llm.prepareCall = async () => { throw unavailable }
  await assert.rejects(reviewTurn({ ctx, session, turn: target, settings }), error => {
    assert.equal(error, unavailable)
    assert.equal(error.reviewUsage, undefined)
    return true
  })
})

test('上下文预算缩减实际发给模型的内容；无法容纳时不会发出模型请求', async () => {
  const model = { context: { contextWindow: 12000 } }
  const fake = context([empty, empty], model)
  const localSettings = { ...settings, effort: 'low', coverage: 'key' }
  model.reasoning = { efforts: [{ id: 'low' }] }
  const turn = { ...target, answer: '大'.repeat(15000), evidence: [] }
  const report = await reviewTurn({ ctx: fake.ctx, session, turn, settings: localSettings })
  assert.ok(report.limitations.some(line => line.includes('上下文容量')))
  assert.ok(Buffer.byteLength(fake.calls[0].messages[0].content[0].text) + Buffer.byteLength(fake.calls[0].system) + fake.calls[0].maxTokens < 12000)
  const small = context([], { context: { contextWindow: 512 }, reasoning: model.reasoning })
  await assert.rejects(reviewTurn({ ctx: small.ctx, session, turn, settings: localSettings }), /上下文容量不足/)
  assert.equal(small.calls.length, 0)
})

test('明确选择与作者相同的模型时 inherit 指定模型默认 effort', async () => {
  const { ctx } = context([empty])
  ctx.llm.listModels = async () => [{ id: route.model }]
  const report = await reviewTurn({ ctx, session, turn: target, settings: { ...settings, model: JSON.stringify([route.provider, route.model]) } })
  assert.equal(report.model.effort, 'low')
})

test('关键轮次在科研、日常、开发和文本交付中给出可解释理由', () => {
  const completed = { question: '', number: 1, evidence: [] }
  const cases = [
    ['复述测量值', '相对丰度提高 2.5 倍。', '数值'],
    ['讨论一下昨天的结果', '结果表明该差异与批次相关。', '研究结论'],
    ['会议安排', '会议定在周四下午。', '日程'],
    ['约会几点开始？', '15：30。', '日程'],
    ['What time does the flight depart?', '17:25 local time.', '日程'],
    ['接口的约定呢？', '空数组返回 null。', '接口行为'],
    ['How does the endpoint handle empty input?', 'It returns an empty collection.', '接口行为'],
    ['哪个方案合适？', '选方案 B，可以赶上发货截止时间。', '决定'],
    ['要部署吗？', '我建议暂停部署，先修复测试。', '决定'],
    ['修复了吗？', '回归测试全部通过。', '验证结论'],
    ['Draft an email about the closure.', 'Dear colleagues, the library will be closed.', '书面交付'],
    ['给我一个函数', '```python\ndef add(x, y): return x + y\n```', '代码'],
  ]
  for (const [question, answer, expected] of cases) {
    assert.match(explainTrigger({ ...completed, question, answer }), new RegExp(expected), answer)
  }
  const read = { turn: 1, kind: '工具结果', text: 'read [r1] 返回\n12 samples' }
  for (const [question, answer] of [
    ['', '好的。'], ['', '等你选定方向后我再继续。'.repeat(65)],
    ['请写一封邮件', '请确认目标读者？'], ['请起草通知', '正在整理中。'],
    ['解释一下概念', '可以参考 https://example.org 。'],
  ]) {
    assert.equal(explainTrigger({ ...completed, question, answer, evidence: [read] }), null, answer)
  }
  const mutation = { turn: 1, kind: '工具结果', text: 'write [w1] 返回\nDone' }
  assert.match(explainTrigger({ ...completed, answer: '好的', evidence: [mutation] }), /写入/)
  assert.equal(explainTrigger({ ...completed, answer: '好的', evidence: [{ ...mutation, turn: 0 }] }), null)
})

test('写作缺陷可直接定位行文，模板留白和来源不明不推断作者身份', async () => {
  const input = { ...target, question: '请给我可直接刊登的活动公告。', answer: '活动时间：待补充。', limitations: [], evidence: [] }
  const issue = { check: 'writing', severity: 'warning', claim: '待补充', claimSource: 'A1',
    quote: '可直接刊登', source: 'Q', reason: '定稿中留下了没有填写的时间。', suggestion: '补齐活动时间后发布。' }
  const f = context([{ ...empty, findings: [issue] }])
  const report = await reviewTurn({ ctx: f.ctx, session, turn: input, settings: { ...settings, checks: ['writing', 'scope', 'execution'] } })
  assert.equal(report.findings[0].claimLocation, 'A1')
  assert.deepEqual(report.limitations, [])
  const prompt = JSON.parse(f.calls[0].messages[0].content[0].text)
  assert.match(prompt.checks.writing, /模板留白/)
  assert.match(prompt.checks.writing, /不推断作者/)
})

test('未在答复中承认的执行仍可引用；越界判定对照本轮或既往授权', async () => {
  const data = withSeq([start(1), user('只需起草，禁止发送。'), answer(1, '草稿已就绪。'), end(1),
    start(2), user('继续完善。'), event('tool/ptc-dispatch', { turn: 2, subCallId: 'm', name: 'send_email', isError: false, content: text('sent confirmation 123') }),
    answer(2, '已更新。'), end(2)])
  const turn = listTurns(data)[1]
  const issue = { check: 'scope', severity: 'error', claimSource: 'E6', claim: 'sent confirmation 123', source: 'U1',
    quote: '禁止发送', reason: '发送记录与先前约定冲突。', suggestion: '告知用户已发出，并询问如何处理。' }
  const f = context([{ ...empty, findings: [issue] }])
  const s = { ...settings, checks: ['scope'] }
  const report = await reviewTurn({ ctx: f.ctx, session, turn, settings: s })
  assert.deepEqual(report.findings.map(x => [x.claimLocation, x.evidence]), [['E6 · 第 2 轮', '[U1 · 第 1 轮] 禁止发送']])
  const invalid = { ...empty, findings: [{ ...issue, source: 'A1', quote: '已更新。' }] }
  const fake = context([invalid, invalid])
  await assert.rejects(reviewTurn({ ctx: fake.ctx, session, turn, settings: s }), /授权或限制/)
})

test('代码检查引用正式交付的实际源码行；未启用时保持原快照范围', async () => {
  const turn = { ...target, question: '请保持对空数组的支持。', answer: '请见 mean.py。', workspaceSeq: 30, presentedPaths: ['mean.py'] }
  const issue = { check: 'code', severity: 'error', claimSource: 'F30.0', claim: 'sum(x) / len(x)', source: 'Q',
    quote: '对空数组的支持', reason: '空数组会触发除零。', suggestion: '增加空输入分支并测试。' }
  const f = context([{ ...empty, findings: [issue] }, empty])
  let reads = 0
  f.ctx.get = () => ({
    summary: () => ({ turn: turn.number, cwd: '/work', files: [{ path: 'mean.py' }] }),
    diff: async () => { reads++; return { kind: 'text', path: 'mean.py', after: true, hunks: [{ newStart: 3, lines: ['+return sum(x) / len(x)'] }] } },
  })
  const report = await reviewTurn({ ctx: f.ctx, session, turn, settings: { ...settings, checks: ['code'] } })
  assert.match(report.findings[0].claimLocation, /mean\.py:3/)
  await reviewTurn({ ctx: f.ctx, session, turn, settings: { ...settings, checks: ['numbers'] } })
  assert.equal(reads, 1)
})

test('原段落不能同时作为其事实断言的反证', async () => {
  const invalid = { ...empty, findings: [{ ...finding, claimSource: 'A1', source: 'A1', quote: '均值为 2.20 µM。' }] }
  const f = context([invalid, invalid])
  await assert.rejects(reviewTurn({ ctx: f.ctx, session, turn: target, settings }), /不同于原断言/)
})

test('真实模型回归：针对假想批评的自辩只作措辞提示，保留样本量局限', async () => {
  const sentence = '必须强调，这绝不意味着我们的工作不够严谨，任何这样的解读都是对研究者的不公。'
  const input = { ...target, question: '请给论文写一段供读者直接阅读的研究局限。每组仅有3个独立样本；请如实交代样本量对外推的限制。',
    answer: sentence + '\n每组仅有3个独立样本，结论能否推广到其他样本仍需验证。', limitations: [], evidence: [] }
  const issue = { check: 'writing', severity: 'error', claimSource: 'A1', claim: sentence, source: 'Q', quote: input.question,
    reason: '该句防御对严谨性的潜在质疑，并自我评价。', suggestion: '删除第一句，保留样本量与外推限制。' }
  // The first response uses the older, untyped model format observed in a live run.
  for (const item of [issue, { ...issue, writingKind: 'style' }, { ...issue, writingKind: 'requirement' }]) {
    const f = context([{ reviewed: ['A1', 'A2'], findings: [item], limitations: [] }])
    const report = await reviewTurn({ ctx: f.ctx, session, turn: input, settings: { ...settings, checks: ['writing'] } })
    assert.deepEqual(report.findings.map(f => [f.claim, f.severity]), [[sentence, 'note']])
  }
})

test('修改写作严重度不掩盖影响使用的实质缺失或明确硬性违约', async () => {
  const turn = { ...target, question: '会议定在周三 10:30。只能输出 JSON。',
    answer: '会议时间：待补充。', evidence: [], limitations: [] }
  const base = { check: 'writing', severity: 'error', claimSource: 'A1', claim: turn.answer, source: 'Q',
    reason: '输出不能直接使用。', suggestion: '填入已给的时间并按指定格式返回。' }
  const raw = [
    { ...base, writingKind: 'incomplete', quote: '周三 10:30' },
    { ...base, writingKind: 'requirement', quote: '只能输出 JSON' },
  ]
  const f = context([{ ...empty, findings: raw }])
  const report = await reviewTurn({ ctx: f.ctx, session, turn, settings: { ...settings, checks: ['writing'] } })
  assert.deepEqual(report.findings.map(i => [i.writingKind, i.severity]), [['incomplete', 'error'], ['requirement', 'error']])
})

test('原轮次时间与消息来源本地核对短问；不按复查时间、审查模型或缺失时区猜测', async () => {
  const when = Date.UTC(2026, 10, 25, 17)
  const timezone = 'Asia/Shanghai'
  function observation(question, value, overrides = {}) {
    const message = user(question)
    message.data.source.clientTimeZone = timezone
    const [t] = listTurns(withSeq([start(12), message, answer(12, value), end(12)]).map(e => ({ ...e, time: when })))
    return { ...t, ...overrides }
  }
  const options = { ...settings, instructions: '', checks: ['numbers', 'execution'] }
  async function run(turn) {
    const fake = context([empty])
    const r = await reviewTurn({ ctx: fake.ctx, session, turn, settings: options })
    assert.equal(fake.calls.length, 0)
    assert.equal(r.method, 'local')
    assert.equal(r.usage.requests, 0)
    return r
  }
  const date = observation('今天是几月几日', '今天是 2026 年 11 月 26 日。')
  assert.equal((await run(date)).localLabel, '日期已核对')
  assert.equal((await run({ ...date, answer: '2026-11-25' })).findings[0].repair.to, '2026-11-26')
  assert.equal((await run({ ...date, clientTimeZone: undefined })).gaps.length, 1)
  assert.equal((await run({ ...date, answerTime: when + 86400000 })).gaps.length, 1)
  const model = observation('你是什么模型', '我当前使用的模型是 lab/model。DeepSeek Harness 是运行这个模型的工具平台，不是模型名称。')
  assert.equal((await run(model)).localLabel, '与本轮模型记录一致')
  assert.equal((await run({ ...model, messageRoute: undefined })).gaps.length, 1)
  assert.equal((await run({ ...model, answer: '我当前使用的模型是 wrong/model。' })).findings[0].repair.to, 'lab/model')
  for (const [t, change] of [[{ ...date, question: '今天几号、与会议相隔几天？' }, {}], [date, { sessionInstructions: '核对字数' }],
    [{ ...model, answer: model.answer + '支持 2M 上下文。' }, {}]]) {
    const f = context([empty]); await reviewTurn({ ctx: f.ctx, session, turn: t, settings: { ...options, ...change } })
    assert.equal(f.calls.length, 1)
    assert.ok(JSON.parse(f.calls[0].messages[0].content[0].text).evidence.some(r => /^H[12]$/u.test(r.id)))
  }
})

test('系统范围与可逐字定位的缺证分开，实际漏审独立标记为部分完成', async () => {
  const gap = { claimSource: 'A1', claim: '均值', missing: '缺少 batch-A.csv 的原始数值。', impact: '无法核验最终汇总。' }
  const f = context([{ reviewed: ['A1'], findings: [], gaps: [gap] }])
  const res = await reviewTurn({ ctx: f.ctx, session, turn: { ...target, limitations: ['仅选入部分此前记录，未检索全部历史。'] }, settings })
  assert.equal(res.partial, false)
  assert.deepEqual(res.gaps, [gap])
  assert.deepEqual(res.scopeNotes, ['仅选入部分此前记录，未检索全部历史。'])
  const bad = { reviewed: ['A1'], findings: [], gaps: [{ ...gap, claim: 'different source' }] }
  const invalid = context([bad, bad])
  await assert.rejects(reviewTurn({ ctx: invalid.ctx, session, turn: target, settings }), /未通过校验/)
  const truncated = context([empty, empty])
  assert.equal((await reviewTurn({ ctx: truncated.ctx, session, turn: { ...target, answer: '一段\n二段' }, settings })).partial, true)
})

test('精确索引只传回同会话提供的原文，修正用量与稳定前缀可区分', async () => {
  const { indexedEvidence, evidenceTerms } = await import('../lib/evidence-index.js')
  const row = { id: 'E7', seq: 7, turn: 1, kind: '工具结果', text: 'read [1] 返回\n样本量：6', path: 'samples-A.tsv' }
  const entries = indexedEvidence({ number: 1, evidence: [row, { ...row, id: 'E8', kind: '助手先前陈述' }] })
  assert.equal(entries.length, 1)
  assert.ok(entries[0].terms.includes('samples-A.tsv'))
  assert.deepEqual(evidenceTerms('按第 1 轮 samples-A.tsv 核对 PMID 41231234'), ['turn:1','samples-A.tsv','pmid:41231234'])
  assert.deepEqual(evidenceTerms('read /work/data/samples-A.tsv [paper](https://doi.org/10.1234/A(B))'), ['/work/data/samples-A.tsv','samples-A.tsv','10.1234/a(b)'])
  const t = { ...target, number: 32, indexedEvidence: [row], evidence: [], question: '核对第 1 轮 samples-A.tsv 的样本量' }
  const f = context([empty])
  await reviewTurn({ ctx: f.ctx, session, turn: t, settings })
  const data = JSON.parse(f.calls[0].messages[0].content[0].text)
  assert.equal(data.evidence[0].text, row.text)
  assert.equal(data.evidence[0].turn, 1)
  assert.deepEqual(Object.keys(data).slice(0,4), ['checks','coverage','focus','targetTurn'])
})

test('同批次、同指标和单位的独立唯一读数才允许机械修正，模型不能伪造资格', async () => {
  const expected = '批次A 独立样本数：6'
  const wrong = '批次A 独立样本数：12'
  const row = { id: 'E17', seq: 17, turn: 1, kind: '工具结果', text: 'read [c9] 返回\n' + expected, path: 'batches.tsv' }
  async function issue(source, extra = [], answerText = wrong, ref = row, limitations = []) {
    const item = { ...finding, source: ref.id, quote: source, claim: answerText, repair: { kind: 'number', to: '900' } }
    const f = context([{ ...empty, findings: [item] }])
    const r = await reviewTurn({ ctx: f.ctx, session, turn: { ...target, answer: answerText, evidence: [ref, ...extra], limitations }, settings })
    return r.findings[0]
  }
  assert.equal((await issue(expected)).repair.to, expected)
  assert.equal((await issue(expected)).repair.from, wrong)
  assert.equal((await issue(expected, [], wrong, { ...row, turn: 0 })).repair, undefined)
  assert.equal((await issue(expected, [], '批次B 独立样本数：12')).repair, undefined)
  assert.equal((await issue(expected, [], wrong, { ...row, path: undefined })).repair, undefined)
  assert.equal((await issue(expected, [{ ...row, id: 'E19', text: row.text.replace('：6','：8') }])).repair, undefined)
  const prefix = 'read [c9] 返回\n<path>/project/batches.tsv</path>\n<type>file</type>\n<content>\n'
  const native = { ...row, text: prefix + '1: ' + expected + '\n\n(End of file - total 1 lines)\n</content>' }
  assert.equal((await issue('1: ' + expected, [], wrong, native)).repair.to, expected)
  const single = { ...row, text: native.text.replace(expected, '样本量：6') }
  assert.equal((await issue('样本量：6', [], '样本量：12', single)).repair.to, '样本量：6')
  const partial = native.text.replace('(End of file - total 1 lines)', '(Showing lines 1-1 of 2. Use offset=2 to continue.)')
  assert.equal((await issue(expected, [], wrong, { ...row, text: partial })).repair, undefined)
  assert.equal((await issue(expected, [], wrong, { ...row, text: native.text.replace('1: ', '3: ') })).repair, undefined)
  const fragment = { id:'F17.0', seq:17, turn:1, kind:'交付文件结束版本快照', text:'L21 | ' + expected, file:'batches.tsv' }
  assert.equal((await issue(expected, [], wrong, fragment, ['batches.tsv 只提供改动段及其上下文，未核对文件中其余行。'])).repair, undefined)
})

test('长答案按遗漏项定向补审，修订指令放在稳定 system 和已选规则之后', async () => {
  const turn = { ...target, answer: '第一段' + '长'.repeat(1300) + '\n第二段', question: '逐段核对。' }
  const f = context([{ ...empty }, { ...empty, reviewed: ['A2'] }])
  const r = await reviewTurn({ ctx: f.ctx, session, turn, settings })
  assert.deepEqual(r.coverage, { mode: 'all', reviewed: 2, available: 2 })
  assert.equal(r.partial, false)
  assert.equal(f.calls[0].system, f.calls[1].system)
  const retry = JSON.parse(f.calls[1].messages[0].content[0].text)
  assert.deepEqual(retry.answer, [{ id:'A2', text:'第二段' }])
  assert.deepEqual(Object.keys(retry).at(-1), 'retry')
})
