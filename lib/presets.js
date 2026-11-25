export const checkLabels = {
  numbers: '数字与单位', execution: '执行记录', figures: '图表与数据',
  citations: '引文与文献标识', plan: '计划完成情况', methods: '方法与结论',
  code: '代码关键节点', writing: '交付文本中的 AI 痕迹', scope: '任务范围与授权',
}

export const checkPresets = {
  efficient: ['numbers', 'execution', 'methods'],
  full: Object.keys(checkLabels),
}

export function identifyCheckPreset(checks) {
  for (const [id, preset] of Object.entries(checkPresets)) {
    if (checks.length === preset.length && preset.every(check => checks.includes(check))) return id
  }
  return 'custom'
}
