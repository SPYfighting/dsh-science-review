// Each fast path covers a whole question and a whole answer. Freeform additions
// and work performed during a turn need the normal independent review.
const dateQuestion = /^(?:请问\s*)?(?:(?:今天|今日)(?:是)?(?:几月几[日号]|几号|哪一天|什么日期)|(?:今天|今日)(?:的)?日期(?:是(?:什么|多少))?|what(?:'s| is) (?:today['’]s|the) date)[？?。!！]?$/iu
const modelQuestion = /^(?:请问\s*)?(?:你(?:现在|当前)?(?:用的|使用的)?是(?:哪个|什么)(?:模型|大模型)|你(?:用|使用)(?:的)?(?:哪个|什么)模型|what model (?:are you|are you using))[？?。!！]?$/iu
const dateAnswer = /^(?:今天(?:是)?\s*|今日(?:是)?\s*|Today is\s+)?(?:(\d{4})\s*(年|-)\s*)?(\d{1,2})\s*(月|-)\s*(\d{1,2})\s*(?:[日号])?[。.！!]?$/iu
const modelAnswer = /^(?:(?:我(?:现在|当前)?(?:使用|用)的模型是|我(?:是|使用的是)|当前模型(?:是|为)|I(?: am|'m) using)\s*)?`?([a-zA-Z0-9](?:[a-zA-Z0-9._/-]{0,126}[a-zA-Z0-9_-])?)`?\s*[。.]?(?:\s*DeepSeek Harness 是运行这个模型的工具平台[，,]\s*不是模型名称[。.]?)?$/u
const safeDate = ms => Number.isSafeInteger(ms) && Number.isFinite(new Date(ms).getTime())

function dateAt(time, zone) {
  if (!safeDate(time) || typeof zone !== 'string' || !zone) return undefined
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time)
    const fields = Object.fromEntries(parts.map(p => [p.type, p.value]))
    return [fields.year, fields.month, fields.day].join('-')
  } catch (error) {
    if (error instanceof RangeError) return undefined
    throw error
  }
}

function result(turn, kind, claimed, expected, record, unknown) {
  const date = kind === 'date'
  const label = date ? '日期已核对' : '与本轮模型记录一致'
  const check = date ? 'numbers' : 'execution'
  const gap = unknown ? [{ claimSource: 'A1', claim: turn.answer, missing: unknown, impact: date ? '无法确定当时应显示的当地日期。' : '无法核对本轮实际记录的模型标识。' }] : []
  const findings = expected && expected !== claimed ? [{
    check, severity: 'error', claim: turn.answer, claimSource: 'A1', claimLocation: 'A1', source: 'host', quote: expected,
    evidence: record, reason: date ? '回答日期与原轮次的当地日期不一致。' : '回答的模型名与 DSH 在该条回答记录的模型标识不一致。',
    suggestion: date ? '将本轮日期更正为 ' + expected + '。' : '注明本轮 DSH 所记录的模型标识为 ' + expected + '。',
    repair: { kind, target: 'answer', from: claimed, to: expected, source: 'host' },
  }] : []
  return { schemaVersion: 2, method: 'local', localLabel: gap.length ? '本地证据不足' : findings.length ? '本地核对发现差异' : label,
    summary: unknown || record, findings, gaps: gap, scopeNotes: [], limitations: [], partial: false,
    coverage: { mode: 'all', reviewed: 1, available: 1 }, usage: { requests: 0, totalTokens: 0 } }
}

export function localFactReview(turn, settings) {
  if (settings.instructions?.trim() || settings.sessionInstructions?.trim() || turn.presentedPaths?.length || turn.workspaceSeq != null
    || turn.evidence?.some(row => row.turn === turn.number) || turn.limitations?.some(note => note.includes('附件'))) return null
  const question = turn.question.trim()
  const answer = turn.answer.trim()
  if (!answer || /[\r\n]/u.test(answer)) return null
  if (dateQuestion.test(question) && settings.checks.includes('numbers')) {
    const match = dateAnswer.exec(answer)
    if (!match || (match[2] ? (match[2] === '年') !== (match[4] === '月') : match[4] !== '月')) return null
    const start = dateAt(turn.userTime, turn.clientTimeZone)
    const finish = dateAt(turn.answerTime, turn.clientTimeZone)
    const claimed = [match[1] || start?.slice(0,4), match[3].padStart(2, '0'), match[5].padStart(2, '0')].filter(Boolean).join('-')
    if (!start || !finish) return result(turn, 'date', claimed, null, '', '原轮次缺少可靠时间或用户时区。')
    if (start !== finish) return result(turn, 'date', claimed, null, '', '提问和回答跨越当地午夜，需要明确“今天”所指时点。')
    return result(turn, 'date', claimed, start, '原轮次日期 ' + start + '（' + turn.clientTimeZone + '）。')
  }
  if (modelQuestion.test(question) && settings.checks.includes('execution')) {
    const match = modelAnswer.exec(answer)
    if (!match) return null
    const route = turn.messageRoute
    if (route?.model !== match[1] && !/[-./]/u.test(match[1])) return null
    if (!route) return result(turn, 'model', match[1], null, '', '该条主回答未记录提供方和模型标识。')
    return result(turn, 'model', match[1], route.model, 'DSH 主回答记录：' + route.provider + ' / ' + route.model + '。')
  }
  return null
}

// Mixed answers or custom criteria go through the reviewer. Give it the same
// host evidence when a date/identity claim is present, without exposing
// unrelated session metadata on ordinary tasks.
export function runtimeEvidence(turn) {
  const rows = []
  const text = turn.question + '\n' + turn.answer
  if (turn.messageRoute && /(?:什么|哪个|当前|使用的)模型|模型(?:是|为|标识)|what model/iu.test(text))
    rows.push({ id: 'H1', turn: turn.number, kind: '原轮次 DSH 主回答模型记录', text: turn.messageRoute.provider + ' / ' + turn.messageRoute.model })
  if (/(?:今天|今日|today)/iu.test(text)) {
    const start = dateAt(turn.userTime, turn.clientTimeZone)
    const finish = dateAt(turn.answerTime, turn.clientTimeZone)
    if (start && finish) rows.push({ id: 'H2', turn: turn.number, kind: '原轮次用户时区与日期',
      text: '用户时区 ' + turn.clientTimeZone + '；提问日期 ' + start + '；回答日期 ' + finish })
  }
  return rows
}
