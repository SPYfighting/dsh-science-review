import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLabels, checkPresets, identifyCheckPreset } from '../lib/presets.js'
import { evidenceParts, feedbackLabel, orderedFindings, prepareFollowup, reviewLabel, usageLabel, visibleMode } from '../client/report.js'

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
