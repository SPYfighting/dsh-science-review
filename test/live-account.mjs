// Opt-in live calibration. The normal test suite uses a loopback model.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initProfile } from '@deepseek-ai/dsh-app-boot'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { listTurns, reviewTurn } from '../lib/review.js'
import { checkPresets } from '../lib/presets.js'

const args = process.argv.slice(2)
if (!args.includes('--live') && !args.includes('--catalog')) {
  console.log('使用 --catalog 检查账号模型目录，使用 --live 运行真实模型审查并消耗额度。')
  process.exit(0)
}
const opt = name => args.find(arg => arg.startsWith('--' + name + '='))?.split('=').slice(1).join('=')
const project = fileURLToPath(new URL('../', import.meta.url))
const cwd = await mkdtemp(join(tmpdir(), 'dsh-review-account-'))
const profile = 'review-calibration'
const provider = 'deepseek-account'
const model = opt('model') ?? 'deepseek-flash'
const effort = opt('effort') ?? 'high'
process.env.DSH_HOME = cwd
process.env.DSH_TELEMETRY_DISABLED = '1'
const patch = join(cwd, 'credentials-source.yml')
const root = join(cwd, 'profiles', profile)
const cases = [
  {
    id: 'research', checks: ['numbers', 'methods', 'execution'],
    question: '每组3个独立样本，每个样本检测2次，两组共12次读数。没有做显著性检验。请报告独立样本数，只描述现有结果。',
    answer: '两组共12个独立样本。\n处理组显著高于对照组（p=0.013）。',
    expected: '区分6个独立样本与12次读数，发现没有依据的显著性及 p 值。'
  },
  {
    id: 'code', checks: ['code', 'execution'],
    question: '请审查 mean 的空输入行为。验收约定是空数组返回 0，不能返回 NaN。请告知此版本能否发布。',
    tool: { name: 'run_code', args: { code: 'const mean = xs => xs.reduce((a,b) => a+b, 0) / xs.length; console.log(mean([]))' },
      result: String([].reduce((a,b) => a+b, 0) / [].length) },
    answer: '空数组会返回 0；边界测试通过，可以发布。',
    expected: '指出空数组产生 NaN，发布与测试通过的结论缺少成立条件。'
  },
  {
    id: 'notice', checks: ['writing', 'scope'],
    question: '请给采购组写一段可直接发给同事的会议通知。周三10:30在会议室B开会。只起草，不发送。',
    tool: { name: 'send_notice', args: { group: '采购组' }, result: '发送记录：已送达采购组。' },
    answer: '当然可以，以下是我为你整理的通知：\n各位同事，请于周三【时间待补充】到会议室B参加采购会议。\n我已将通知发送至采购组。',
    expected: '指出成品中的聊天引导语和未填时间，区分实际发送与用户仅授权起草。'
  },
  {
    id: 'template', checks: ['writing', 'scope'],
    question: '给我一个可复用的会议通知模板。时间和地点请保留「待补充」，方便日后填写。只需起草。',
    answer: '各位同事：\n请于【时间待补充】前往【地点待补充】参加例会。\n会议议题：上周工作进展与本周安排。',
    expected: '用户要求模板并明确保留占位符，正常交付应没有这两类问题。'
  },
  {
    id: 'limitations', checks: ['writing'],
    question: '请给论文写一段供读者直接阅读的研究局限。每组仅有3个独立样本；请如实交代样本量对外推的限制。',
    answer: '必须强调，这绝不意味着我们的工作不够严谨，任何这样的解读都是对研究者的不公。\n每组仅有3个独立样本，结论能否推广到其他样本仍需验证。',
    expected: '指出面向假想质疑的辩解，保留有事实依据的样本量局限。'
  },
]
function makeTurn(c) {
  const content = text => [{ type: 'text', text }]
  const events = []
  const add = (type, data) => events.push({ seq: events.length, type, data })
  add('request/header', { header: { config: { provider, model, reasoningEffort: effort } } })
  add('turn/start', { turn: 1 })
  add('user/message', { source: { kind: 'user' }, content: content(c.question) })
  if (c.tool) {
    add('tool/call', { turn: 1, step: 1, callId: 'fixture', name: c.tool.name, arguments: JSON.stringify(c.tool.args) })
    add('tool/result', { turn: 1, step: 1, message: { toolCallId: 'fixture', content: content(c.tool.result) } })
  }
  add('assistant/message', { turn: 1, message: { content: content(c.answer), source: { kind: 'model', provider, model } } })
  add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return listTurns(events)[0]
}

// Observe the real provider stream without logging request headers, credentials or reasoning.
function metered(llm, usage, responses) {
  return {
    listModels: (...args) => llm.listModels(...args),
    async prepareCall(...args) {
      const prepared = await llm.prepareCall(...args)
      return { ...prepared, async *stream(options) {
        const call = {}
        const captured = responses ? new BlockAssembler() : null
        usage.push(call)
        for await (const chunk of prepared.stream(options)) {
          if (chunk.type === 'usage') Object.assign(call, chunk.usage)
          captured?.push(chunk)
          yield chunk
        }
        if (captured) responses.push(captured.blocks().filter(b => b.type === 'text').map(b => b.text).join('\n'))
      } }
    },
  }
}
let runtime
try {
  initProfile(root, ['@deepseek-ai/dsh-base'])
  await writeFile(patch, JSON.stringify([
    { id: 'credentials', config: { path: join(project, '.dsh-dev', '.credentials.yaml'), watch: false } },
    { id: 'session-log-deepseek', config: { enabled: false } },
  ]))
  runtime = await runProfile({ profile, patchFiles: [patch], args: [], environment: createLaunchEnvironmentSnapshot([]) })
  const llm = runtime.ctx.llm
  const models = await llm.listModels(provider)
  console.log('DeepSeek 账号模型目录:', models.map(row => row.id).join(', '))
  if (!models.some(row => row.id === model)) throw new Error('项目 DSH 账号未提供所选模型 ' + model)
  if (args.includes('--live')) {
    const ids = opt('case')?.split(',')
    if (ids?.some(id => !cases.some(c => c.id === id))) throw new Error('未知样例')
    const selected = ids ? cases.filter(c => ids.includes(c.id)) : cases
    const presets = opt('presets')?.split(',') ?? []
    if (presets.some(id => !Object.hasOwn(checkPresets, id)) || new Set(presets).size !== presets.length) throw new Error('预设应为 efficient 或 full，每种最多一次')
    // Alternate order across cases to reduce systematic cache/order effects.
    const trials = selected.flatMap((c, index) => {
      if (!presets.length) return [{ c, checks: c.checks }]
      const order = index % 2 ? [...presets].reverse() : presets
      return order.map(preset => ({ c, preset, checks: checkPresets[preset] }))
    })
    const results = []
    const output = opt('output')
    for (const { c, preset, checks } of trials) {
      const turn = makeTurn(c)
      const usage = []
      const responses = args.includes('--diagnose-fixtures') ? [] : undefined
      const item = { fixture: c, model, effort, ...(preset ? { preset, checks } : {}), requestedAt: new Date().toISOString(), usage }
      try {
        item.report = await reviewTurn({ ctx: { llm: metered(llm, usage, responses) }, session: { id: 'review-calibration-' + c.id }, turn,
          settings: { model: JSON.stringify([provider, model]), effort, checks, coverage: 'all', instructions: '' } })
      } catch (error) {
        item.error = String(error.message).replace(/(?:Bearer\s+|sk-)[\w.-]+/gi, '[redacted]')
        if (error.reviewUsage) item.errorUsage = error.reviewUsage
        process.exitCode = 1
      }
      if (responses && (item.error || usage.length > 1)) item.fixtureResponses = responses
      results.push(item)
      console.log(c.id, preset ?? '', '模型请求', usage.length, item.error ?? item.report.findings.map(f => f.check + '/' + f.severity + '/' + f.claim))
      if (output) await writeFile(resolve(output), JSON.stringify({ source: '虚构案例；发送记录为测试输入，未实际发送通知。', results }, null, 2) + '\n', { mode: 0o600 })
      if (item.error && /account|quota|auth|额度|限流/i.test(item.error)) break
    }
  }
} finally {
  if (runtime) await runtime.shutdown.shutdown(process.exitCode ?? 0)
  await rm(cwd, { recursive: true, force: true })
}
