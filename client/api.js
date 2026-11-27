// Routes are served by the DSH instance that owns the current session.
export async function request(route, { query, body, signal } = {}) {
  const url = new URL('/plugins/dsh-review/' + route, window.location.origin)
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value)
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const error = new Error(data?.error || `审查服务请求失败（HTTP ${response.status}）`)
    error.status = response.status
    throw error
  }
  return data
}

export const modes = { manual: '仅手动', key: '关键轮次', every: '每一轮' }
export const handlingLabels = { manual: '手动启动', conditional: '分情况处理', auto: '自动核实与修正' }
export const handlingHelp = {
  manual: '点击报告中的按钮启动主助手。',
  conditional: '证据能确定改法时自动修正并复审，其余事项由你选择。',
  auto: '主助手可先用已有证据核实疑点，再修正并复审。需要补充材料时会等你处理。',
}
export { checkLabels as checks } from '../lib/presets.js'

export const modeHelp = {
  manual: '由你在会话中选择需要核对的回答。',
  key: '遇到交付物、重要结论或决定、实际变更及验证结果时审查。普通问候和单纯查阅通常会跳过。',
  every: '每次用户提问得到完整回答后都审查。',
}
