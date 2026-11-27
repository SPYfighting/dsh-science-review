const levels = ['error', 'warning', 'note']
const categories = { error: '实质问题', warning: '待核实', note: '提示' }

export function visibleMode(data, error) {
  const mode = data?.effectiveMode
  return !error && ['manual', 'key', 'every'].includes(mode) ? mode : 'unknown'
}

export function orderedFindings(findings = []) {
  const rank = finding => {
    const index = levels.indexOf(finding.severity)
    return index < 0 ? levels.length : index
  }
  return findings.slice().sort((a, b) => rank(a) - rank(b))
}

export function reviewLabel(review) {
  if (review.status === 'running') return '审查中'
  if (review.status === 'error') return '审查未完成'
  const result = review.result
  if (!Array.isArray(result?.findings)) return '审查报告'
  if (result.schemaVersion >= 2) {
    const labels = result.partial ? ['部分完成'] : []
    const counted = new Set()
    let errors = 0, warnings = 0, notes = 0, gaps = 0
    for (const f of orderedFindings(result.findings)) {
      const key = f.claim && JSON.stringify([f.claimSource || f.claimLocation, f.claim])
      if (key && counted.has(key)) continue
      if (key) counted.add(key)
      if (f.severity === 'error') errors++
      else if (f.severity === 'warning') warnings++
      else notes++
    }
    for (const gap of result.gaps || []) {
      const key = JSON.stringify([gap.claimSource, gap.claim])
      if (!counted.has(key)) { counted.add(key); gaps++ }
    }
    if (errors) labels.push(`${errors} 项实质问题`)
    if (warnings) labels.push(`${warnings} 项风险待核实`)
    if (gaps) labels.push(`${gaps} 项关键事实待核实`)
    if (notes) labels.push(`${notes} 项提示`)
    if (result.method === 'local' && result.localLabel && !labels.length) return result.localLabel
    return labels.join(' · ') || '已审查 · 未发现具体问题'
  }
  const counts = levels.map(level => {
    const count = result.findings.filter(f => f.severity === level).length
    return count ? categories[level] + ' ' + count : null
  }).filter(Boolean)
  if (!counts.length && result.findings.length) counts.push('审查发现 ' + result.findings.length)
  if (result.limitations?.length) counts.push('有核查限制')
  return counts.length ? counts.join(' · ') : '审查完成 · 未报告问题'
}

// New and saved v0.1 reports both carry the location plus a verbatim quote.
export function evidenceParts(finding) {
  const { evidence = '', quote } = finding
  if (typeof quote === 'string' && quote && evidence.startsWith('[') && evidence.endsWith('] ' + quote)) {
    return { location: evidence.slice(1, -quote.length - 2), quote }
  }
  return { location: '', quote: evidence || quote || '' }
}

export function feedbackLabel(feedback) {
  if (!feedback) return '有发现时，主助手会在后续用户提问时收到审查摘录。'
  if (feedback.total <= 0) return ''
  if (feedback.sent === 0) return '待交给主助手。你下次发言时，会附上审查摘录。'
  if (feedback.sent >= feedback.total) return '已带入主助手上下文。可起草请求，要求主助手逐项复核。'
  return '已有 ' + feedback.sent + '/' + feedback.total + ' 项带入主助手上下文，其余将在后续发言时送达。'
}

export function usageLabel(usage) {
  if (!Number.isSafeInteger(usage?.requests) || usage.requests < 0) return ''
  const calls = `模型请求 ${usage.requests} 次`
  return Number.isSafeInteger(usage.totalTokens) && usage.totalTokens >= 0
    ? calls + ' · 共 ' + usage.totalTokens.toLocaleString('zh-CN') + ' tokens'
    : calls
}

const usageFields = [
  ['inputTokens', '未缓存输入'], ['cacheReadTokens', '缓存读取'], ['cacheWriteTokens', '缓存写入'],
  ['outputTokens', '输出'], ['reasoningTokens', '推理'], ['totalTokens', '总量'],
]
export function usageDetails(usage) {
  return usageFields.map(([key, label]) => ({
    key, label, value: Number.isSafeInteger(usage?.[key]) && usage[key] >= 0
      ? usage[key].toLocaleString('zh-CN') : '未提供',
  }))
}

export const remedyPhases = {
  waiting: '等待会话空闲', queued: '已排队', running: '主助手处理中', verifying: '定向复审中',
  done: '本次处理结束', interrupted: '处理中断', cancelled: '已取消',
}
export const remedyOutcomes = {
  pending: '待处理', responded: '主助手已回应', verified: '修正已核验',
  inapplicable: '意见不适用', needs_evidence: '仍待核实',
}
export function remedyActive(job) {
  return ['waiting', 'queued', 'running', 'verifying'].includes(job.phase)
}

export function retryJobId(jobs, kind, index, action, note) {
  // A retry resumes an identical selection. A new note or subset is a new request.
  return jobs.findLast(job => !remedyActive(job) && job.action === action && (job.note || '') === note.trim() &&
    job.steps?.length === 1 && job.steps[0].kind === kind && job.steps[0].index === index)?.id
}

export function standardsHint(instructions, checks = []) {
  if (/(?:\bDOI\b|引文|文献标识)/iu.test(instructions) && !checks.includes('citations')) {
    return '当前核查项未包含“引文与文献标识”。可在设置中勾选。'
  }
  return ''
}

// The Host recognizes the first line on a real user submission. Model-generated
// claims and tool output stay in Host-attributed evidence, outside the user draft.
export function prepareFollowup(ctx, sessionId, turnId) {
  if (!/^\d+$/.test(turnId)) throw new Error('本轮编号无效。')
  const binding = ctx.sessions.binding(sessionId)
  if (!binding) throw new Error('原会话已关闭，请重新打开后起草。')
  const input = ctx.conversation.input
  const editor = input.for(binding.ctx)
  const first = '请复核第 ' + turnId + ' 轮的审查报告。'
  if (!editor.state.getSnapshot().draft.split(/\r?\n/).includes(first)) {
    const result = input.requestDraftInitialization(binding, {
      prompt: first + '\n请说明哪些问题成立及理由，并在答复中更正有误内容。',
      whenDraftExists: 'append',
    })
    if (result !== 'applied') throw new Error('当前输入框正在提交，请稍后再次起草。')
  }
  editor.focus()
}
