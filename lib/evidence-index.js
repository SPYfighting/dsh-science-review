// Explicit identifiers keep retrieval small and auditable. An index hit brings
// the original observation with its turn/file version; never index review text.
export function evidenceTerms(text) {
  if (typeof text !== 'string') return []
  const keys = new Set()
  for (const match of text.matchAll(/\b10\.\d{4,9}\/[A-Za-z0-9._;():/-]+|\bPMID\s*[:：]?\s*\d{4,10}\b|(?:[\w./-]+\.(?:csv|tsv|xlsx?|jsonl?|ya?ml|txt|md|pdf|docx|pptx|png|svg|py|m?js|jsx|tsx?|r))\b|[\p{Script=Han}]+\.(?:csv|tsv|xlsx?|jsonl?|ya?ml|txt|md|pdf|docx|pptx|png|svg)\b|\b(?:batch|sample|assay|trial|project)[-_][\w.-]+|第\s*\d+\s*轮/giu)) {
    let key = match[0].replace(/[.,;:]+$/u, '').replace(/^PMID\s*[:：]?\s*/iu, 'pmid:').replace(/^第\s*(\d+)\s*轮$/u, 'turn:$1')
    if (/^10\./u.test(key)) {
      key = key.toLowerCase()
      // Markdown links may add a closing parenthesis; balanced DOI suffixes are legal.
      let extra = [...key].filter(c => c === ')').length - [...key].filter(c => c === '(').length
      while (extra-- > 0 && key.endsWith(')')) key = key.slice(0, -1)
      keys.add(key)
    } else {
      keys.add(key)
      if (key.includes('/') && keys.size < 48) keys.add(key.split('/').at(-1))
    }
    if (keys.size >= 48) break
  }
  return [...keys]
}

export function indexedEvidence(turn) {
  const entries = []
  for (const row of turn.evidence) {
    if (row.turn !== turn.number || (!row.file && row.kind !== '工具结果')) continue
    const terms = new Set(['turn:' + turn.number, ...evidenceTerms([row.file, row.path, row.text].filter(Boolean).join('\n'))])
    entries.push({ terms: [...terms], row })
  }
  return entries
}
