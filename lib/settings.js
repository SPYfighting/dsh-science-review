import schema from '@deepseek-ai/schemastery'
import { checkPresets } from './presets.js'

export const name = 'dsh-review'
export const modes = ['manual', 'key', 'every']
export const handlingModes = ['manual', 'conditional', 'auto']
export const checks = checkPresets.full
export const defaults = {
  mode: 'manual', handling: 'manual', model: 'session', effort: 'inherit', coverage: 'key', checks, instructions: '',
}
export const Config = schema.object({
  mode: schema.union(modes).default(defaults.mode).volatile(),
  handling: schema.union(handlingModes).default(defaults.handling).volatile(),
  model: schema.string().default(defaults.model).volatile(),
  effort: schema.string().default(defaults.effort).volatile(),
  coverage: schema.union(['key', 'all']).default(defaults.coverage).volatile(),
  checks: schema.array(schema.union(checks)).default(checks).volatile(),
  instructions: schema.string().max(2000).default('').volatile(),
})

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export function configuration(config) {
  return Object.fromEntries(Object.entries(defaults).map(([key, initial]) =>
    [key, config[key]?.get?.() ?? config[key] ?? initial]))
}

export function modelRoute(value) {
  try {
    const pair = JSON.parse(value)
    if (Array.isArray(pair) && pair.length === 2 && pair.every(id => typeof id === 'string' && id.length > 0)) {
      return pair
    }
  } catch {}
  throw new RequestError(400, '请选择 DSH 模型目录中的模型。')
}

export async function catalog(llm) {
  const groups = await Promise.all(llm.listProviders().map(async provider => {
    try {
      const rows = await llm.listModels(provider.id)
      return { models: rows.map(({ provider, id, name }) => ({
        value: JSON.stringify([provider, id]), provider, id, name,
      })), errors: [] }
    } catch {
      return { models: [], errors: [provider.id] }
    }
  }))
  return { models: groups.flatMap(x => x.models), errors: groups.flatMap(x => x.errors) }
}

export async function efforts(llm, route) {
  if (!route) return { efforts: [] }
  const [provider, model] = route
  const info = await llm.resolveModelInfo(provider, model)
  return {
    efforts: (info.reasoning?.efforts ?? []).map(({ id, name }) => ({ id, name })),
    ...(info.reasoning?.defaultEffort ? { defaultEffort: info.reasoning.defaultEffort } : {}),
  }
}

export function settingsView(ctx, config) {
  const descriptor = ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === name)
  if (!descriptor) throw new RequestError(503, 'DSH 尚未载入审查设置页。')
  return { settings: configuration(config), revision: descriptor.revision }
}

export async function saveSettings(ctx, config, input) {
  const raw = input.settings
  // A settings page left open from an earlier version omits the new field.
  const s = raw && typeof raw === 'object' && !Object.hasOwn(raw, 'handling')
    ? { ...raw, handling: configuration(config).handling } : raw
  if (!s || typeof s !== 'object' || Object.keys(s).some(key => !Object.hasOwn(defaults, key))
    || !modes.includes(s.mode) || !handlingModes.includes(s.handling) || !['all', 'key'].includes(s.coverage)
    || typeof s.model !== 'string' || s.model.length > 1000
    || typeof s.effort !== 'string' || !s.effort || s.effort.length > 120
    || typeof s.instructions !== 'string' || s.instructions.length > 2000
    || !Array.isArray(s.checks) || !s.checks.length || s.checks.length > checks.length
    || new Set(s.checks).size !== s.checks.length || s.checks.some(key => !checks.includes(key))
    || !Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new RequestError(400, '设置无效。请至少选择一个检查项，自定义要求最多 2000 字符。')
  }
  if (s.model !== 'session') {
    const route = modelRoute(s.model)
    const available = await ctx.llm.listModels(route[0])
    if (!available.some(row => row.id === route[1])) throw new RequestError(400, '所选模型已从 DSH 模型目录移除。')
    if (s.effort !== 'inherit' && !(await efforts(ctx.llm, route)).efforts.some(row => row.id === s.effort)) {
      throw new RequestError(400, '所选模型不支持这个思考强度。')
    }
  } else if (s.effort !== 'inherit') {
    throw new RequestError(400, '跟随会话模型时，请同时跟随其思考强度。')
  }
  try {
    await ctx.settings.update(name, s, input.revision)
  } catch (error) {
    if (error.code === 'SETTINGS_CONFLICT') throw new RequestError(409, '其他窗口已更新设置。请重新载入后保存。')
    throw new RequestError(409, 'DSH 拒绝写入设置。请检查配置文件是否可写，以及是否有优先级更高的配置覆盖。')
  }
  return settingsView(ctx, config)
}
