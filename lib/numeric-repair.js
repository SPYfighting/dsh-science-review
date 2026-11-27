// Authorize only an exact replacement of one labeled scalar. Free text,
// estimates, derived statistics, and a differently labeled group stay manual.
const scalar = /^((?:(?:批次|组别|分组|batch|group)\s*[:：=]?\s*[A-Za-z0-9_-]{1,32}[\s,，;；/|]+)?(?:独立样本数|生物学重复数|技术重复数|样本量|均值|中位数|independent sample count|sample count|mean|median)\s*(?:[：:=,，\t]|为|是)\s*)(-?\d+(?:\.\d+)?)(\s*(?:µM|μM|mM|nM|mg|kg|µg|μg|mL|µL|μL|mm|cm|%|％|个)?[。.]?)$/iu

function sourceLines(record) {
  if (record.file) return record.text.split('\n').map(raw => {
    const m = /^L(\d+) \| (.*)$/u.exec(raw)
    return { raw, text: m?.[2] ?? '', line: m && Number(m[1]) }
  })
  const content = record.text.replace(/^(?:read|read_file) \[[^\n]+\] 返回\n/iu, '')
  if (!record.path || !content.startsWith('<path>')) {
    return content.trimEnd().split('\n').map(text => ({ raw: text, text }))
  }
  // DSH read renders a numbered window followed by either a continuation or
  // the total file length. A partial read cannot exclude conflicting rows.
  const envelope = /^<path>[^\n]+<\/path>\n<type>file<\/type>\n<content>\n([\s\S]+?)\n\n\(End of file - total (\d+) lines\)\n<\/content>$/u.exec(content)
  if (!envelope) return []
  const lines = envelope[1].split('\n').map((raw, index) => {
    const m = /^(\d+): (.*)$/u.exec(raw)
    return m && Number(m[1]) === index + 1 ? { raw, text: m[2] } : null
  })
  return lines.length === Number(envelope[2]) && lines.every(Boolean) ? lines : []
}

function rows(record) {
  return sourceLines(record).map(row => ({ ...row, parts: scalar.exec(row.text) })).filter(r => r.parts)
}

function trusted(row, targetTurn) {
  if (row.turn !== targetTurn) return false
  if (row.file) return /\.(?:csv|tsv|txt)$/iu.test(row.file)
  return row.kind === '工具结果' && typeof row.path === 'string' && /\.(?:csv|tsv|txt)$/iu.test(row.path)
    && /^(?:read|read_file) \[[^\n]+\] 返回\n/iu.test(row.text)
}

export function numericRepair(item, subject, reference, data) {
  if (item.check !== 'numbers' || item.severity !== 'error' || subject.id === reference.id || !trusted(reference, data.targetTurn)) return
  if (!(subject.id.startsWith('A') || (subject.file && subject.turn === data.targetTurn && /\.(?:md|markdown|txt)$/iu.test(subject.file)))) return
  if (subject.file && [reference.path, reference.file].some(value => typeof value === 'string'
    && (value === subject.file || value.replaceAll('\\', '/').endsWith('/' + subject.file)))) return
  // Clipping can hide a second, conflicting value for this observation.
  if (data.limitations.some(value => /记录超过上限|仅保留首尾|部分记录只含首尾|部分证据记录/u.test(value))
    || [subject.text, reference.text].some(value => value.includes('〔中间内容已截去〕'))) return
  if (reference.file && data.limitations.some(value => value.startsWith(reference.file + ' ')
    && /只保留部分行|只提供改动段/u.test(value))) return
  // The model must quote both scalars. It may quote the label as well.
  const highlighted = rows(subject).filter(r => r.raw.includes(item.claim) && item.claim.includes(r.parts[2]))
  const evidence = rows(reference).filter(r => r.raw.includes(item.quote) && item.quote.includes(r.parts[2]))
  if (highlighted.length !== 1 || evidence.length !== 1) return
  const [wrong] = highlighted
  const [right] = evidence
  const compatible = r => r.parts[1] === wrong.parts[1] && r.parts[3] === wrong.parts[3]
  if (!compatible(right) || Number(wrong.parts[2]) === Number(right.parts[2])) return
  // An unlabeled batch heading elsewhere in a multi-row data source can change
  // the meaning of identical metric names. Admit only a qualified scalar or a
  // one-line source and one-line subject for that case.
  if (!/^(?:批次|组别|分组|batch|group)/iu.test(wrong.text)) {
    if (sourceLines(reference).length !== 1 || sourceLines(subject).length !== 1 || data.answer.length !== 1) return
  }
  if (data.evidence.some(r => trusted(r, data.targetTurn) && r.id !== subject.id
    && rows(r).some(line => compatible(line) && line.parts[2] !== right.parts[2]))) return
  return { kind: 'number', target: subject.file ? 'file' : 'answer', from: wrong.text,
    to: wrong.parts[1] + right.parts[2] + wrong.parts[3], source: reference.id,
    ...(subject.file ? { file: subject.file, line: wrong.line, snapshotId: subject.id, workspaceSeq: Number(subject.id.slice(1).split('.')[0]) } : {}) }
}
