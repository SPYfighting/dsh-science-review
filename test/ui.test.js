import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLabels, checkPresets, identifyCheckPreset } from '../lib/presets.js'
import { evidenceParts, feedbackLabel, orderedFindings, prepareFollowup, remedyActive, retryJobId, reviewLabel, standardsHint, usageDetails, usageLabel, visibleMode } from '../client/report.js'

test('核查预设按勾选项判定，兼容已有九项配置和自定义顺序', () => {
  assert.deepEqual(checkPresets.efficient, ['numbers', 'execution', 'methods'])
  assert.deepEqual(checkPresets.full, Object.keys(checkLabels))
  assert.equal(identifyCheckPreset([...checkPresets.full].reverse()), 'full')
  assert.equal(identifyCheckPreset([...checkPresets.efficient].reverse()), 'efficient')
  assert.equal(identifyCheckPreset([...checkPresets.efficient, 'writing']), 'custom')
  assert.equal(identifyCheckPreset(['numbers', 'execution', 'execution']), 'custom')
  assert.equal(identifyCheckPreset([]), 'custom')
})

test('空白会话在数据就绪后显示实际继承的模式，加载或请求失败时显示未知', () => {
  assert.equal(visibleMode(null), 'unknown')
  assert.equal(visibleMode({ mode: 'inherit', effectiveMode: 'every', turns: [] }), 'every')
  assert.equal(visibleMode({ mode: 'inherit', effectiveMode: 'key' }), 'key')
  assert.equal(visibleMode({ mode: 'manual', effectiveMode: 'manual' }, '连接中断'), 'unknown')
  assert.equal(visibleMode({ mode: 'inherit' }), 'unknown')
})

test('报告排列实质问题、待核实事项和提示，并在收起时保留证据限制', () => {
  const findings = [{ severity: 'note' }, { severity: 'warning' }, { severity: 'error' }]
  assert.deepEqual(orderedFindings(findings), [findings[2], findings[1], findings[0]])
  assert.match(reviewLabel({ status: 'done', result: { findings, limitations: ['缺少原始数据'] } }),
    /实质问题 1 · 待核实 1 · 提示 1 · 有核查限制/)
  assert.equal(reviewLabel({ status: 'done', result: { findings: [], limitations: ['缺少原始数据'] } }), '有核查限制')
  assert.equal(reviewLabel({ status: 'error' }), '审查未完成')
  assert.notEqual(reviewLabel({ status: 'running' }), reviewLabel({ status: 'error' }))
  assert.match(feedbackLabel({ sent: 0, total: 2 }), /下次发言/)
  assert.match(feedbackLabel({ sent: 1, total: 2 }), /1\/2/)
  assert.match(feedbackLabel({ sent: 2, total: 2 }), /已带入主助手上下文/)
})

test('保留带方括号的原始文件定位和引文，兼容早期纯文本报告', () => {
  assert.deepEqual(evidenceParts({ evidence: '[F2.0 · 第 1 轮 · records[1].csv:7] n=[12]', quote: 'n=[12]' }),
    { location: 'F2.0 · 第 1 轮 · records[1].csv:7', quote: 'n=[12]' })
  assert.deepEqual(evidenceParts({ evidence: '旧版原文' }), { location: '', quote: '旧版原文' })
})

test('报告用量区分请求次数与实测总 token 数，兼容历史报告和未返回用量的模型', () => {
  assert.equal(usageLabel(undefined), '')
  assert.equal(usageLabel({ requests: 1 }), '模型请求 1 次')
  assert.equal(usageLabel({ requests: 2, totalTokens: null }), '模型请求 2 次')
  assert.equal(usageLabel({ requests: 1, totalTokens: 0 }), '模型请求 1 次 · 共 0 tokens')
  assert.equal(usageLabel({ requests: 2, totalTokens: 5432 }), '模型请求 2 次 · 共 5,432 tokens')
  assert.match(usageLabel({ requests: 0 }), /0 次/)
  const detail = Object.fromEntries(usageDetails({ cacheReadTokens: 0, inputTokens: 1024 }).map(v => [v.key, v.value]))
  assert.equal(detail.cacheReadTokens, '0')
  assert.equal(detail.inputTokens, '1,024')
  assert.equal(detail.outputTokens, '未提供')
})

test('新报告只突出影响判断的缺口，同一陈述在标题中只计一次', () => {
  const label = patch => reviewLabel({ status: 'done', result: { schemaVersion: 2, method: 'model', findings: [], scopeNotes: ['已选入近三轮'], ...patch } })
  assert.equal(label({}), '已审查 · 未发现具体问题')
  assert.equal(label({ partial: true }), '部分完成')
  assert.equal(label({ method: 'local', localLabel: '日期已核对' }), '日期已核对')
  const claim = { claim: '日期为周二', claimSource: 'A1' }
  const other = { claim: '首次上线为 12 月', claimSource: 'A1' }
  assert.equal(label({ findings: [{ ...claim, severity: 'error' }], gaps: [claim, other, other] }), '1 项实质问题 · 1 项关键事实待核实')
  assert.equal(label({ partial: true, gaps: [other] }), '部分完成 · 1 项关键事实待核实')
})

test('会话提醒缺失的引文核查项，只在修正或复审有活动时轮询', () => {
  assert.ok(standardsHint('请逐条核查 DOI', ['methods']))
  assert.equal(standardsHint('请逐条核查 DOI', ['citations']), '')
  assert.equal(standardsHint('核实独立样本数', ['methods']), '')
  for (const phase of ['waiting', 'queued', 'running', 'verifying']) assert.equal(remedyActive({ phase }), true)
  for (const phase of ['done', 'cancelled', 'interrupted']) assert.equal(remedyActive({ phase }), false)
})

test('相同行为和依据重试原任务，补充了依据或从整批选一项时新建任务', () => {
  const step = { kind: 'gap', index: 1 }
  const first = { id: 'first', phase: 'done', action: 'verify', steps: [step] }
  const batch = { ...first, id: 'batch', steps: [step, { kind: 'gap', index: 2 }] }
  assert.equal(retryJobId([batch], 'gap', 1, 'verify', ''), undefined)
  assert.equal(retryJobId([first, batch], 'gap', 1, 'verify', ''), first.id)
  assert.equal(retryJobId([first], 'gap', 1, 'verify', '新证据'), undefined)
  assert.equal(retryJobId([{ ...first, note: '新证据' }], 'gap', 1, 'verify', ' 新证据 '), first.id)
  assert.equal(retryJobId([first], 'gap', 1, 'fix', ''), undefined)
})

test('复核请求只追加到原生会话草稿，保留已有正文且重复点击不会重复添加', () => {
  let draft = '请保留当前工作。'
  let calls = 0
  let focus = 0
  const binding = { ctx: {} }
  const editor = { state: { getSnapshot: () => ({ draft }) }, focus: () => { focus++ } }
  const ctx = { sessions: { binding: id => id === 's' ? binding : undefined }, conversation: { input: {
    for: scope => { assert.equal(scope, binding.ctx); return editor },
    requestDraftInitialization(session, options) {
      calls++
      assert.equal(binding, session)
      assert.equal(options.whenDraftExists, 'append')
      draft += '\n' + options.prompt
      return 'applied'
    },
  } } }
  prepareFollowup(ctx, 's', '3')
  prepareFollowup(ctx, 's', '3')
  assert.equal(calls, 1)
  assert.equal(focus, 2)
  assert.match(draft, /^请保留当前工作。\n请复核第 3 轮的审查报告。\n/)
  assert.throws(() => prepareFollowup(ctx, 's', 'x'), /编号/)
  assert.throws(() => prepareFollowup(ctx, 'other', '3'), /原会话/)
  ctx.conversation.input.requestDraftInitialization = () => 'blocked'
  assert.throws(() => prepareFollowup(ctx, 's', '4'), /正在提交/)
})
