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
  if (!Number.isSafeInteger(usage?.requests) || usage.requests < 1) return ''
  const calls = `模型请求 ${usage.requests} 次`
  return Number.isSafeInteger(usage.totalTokens) && usage.totalTokens >= 0
    ? calls + ' · 共 ' + usage.totalTokens.toLocaleString('zh-CN') + ' tokens'
    : calls
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
