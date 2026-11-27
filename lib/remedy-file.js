// A mutation is eligible only when the recorded deliverable can be compared to the
// live, bounded, regular workspace file and the original user explicitly requested it.
import { posix, win32 } from 'node:path'

const mutableText = /\.(?:md|markdown|txt|rst)$/iu
const safeRequest = /(?:写入|生成|保存|创建|更新|修正|修改|改写|编辑|create|write|update|edit|save)(?:\s*(?:文件|file))?\s*(?:到|为|as|to)?\s*[`"'“]?$/iu
const negated = /(?:不要|不得|禁止|别|无需|不必|先别|只(?:读|看|评论|解释|说明|建议)|未经|do not|don't|without|read.only|only (?:explain|review)|wait for)/iu

function authorizes(question, path) {
  if (!question || negated.test(question)) return false
  for (let at = question.indexOf(path); at >= 0; at = question.indexOf(path, at + path.length)) {
    if (safeRequest.test(question.slice(0, at)) && !/[\w./-]/u.test(question[at + path.length] || ' ')) return true
  }
  return false
}

function snapshotText(diff) {
  if (diff?.kind !== 'text' || diff.before || !diff.after || diff.hunks.length !== 1) return undefined
  const [hunk] = diff.hunks
  if (hunk.newStart !== 1 || hunk.lines.length !== hunk.newLines || hunk.lines.some(line => !line.startsWith('+'))) return undefined
  return hunk.lines.map(line => line.slice(1)).join('\n')
}

export async function prepareFileEdit(ctx, session, turn, repair, signal) {
  const path = repair.file
  if (!path || !mutableText.test(path) || win32.isAbsolute(path) || posix.isAbsolute(path) || /[\\:\x00-\x1f]/u.test(path)
    || path.split('/').some(part => !part || part.startsWith('.')) || !authorizes(turn.question, path)) return
  if (repair.target !== 'file' || repair.kind !== 'number' || repair.from === repair.to || !repair.from || !repair.to ||
    /[\r\n]/u.test(repair.from + repair.to) || !Number.isSafeInteger(repair.line) || repair.line < 1) return
  const svc = ctx.get?.('workspaceChanges'), fs = ctx.get?.('fs')
  if (!svc || !fs?.lstat || !ctx.get?.('workingDirectory')) return
  const seq = repair.workspaceSeq
  if (seq !== turn.workspaceSeq || !Number.isSafeInteger(seq)) return
  const summary = svc.summary(session.id, seq)
  if (summary?.turn !== turn.number) return
  const index = summary.files.findIndex(file => file.path === path && !file.binary && !file.oversized)
  if (index < 0 || repair.snapshotId !== 'F'+seq+'.'+index) return
  const diff = await svc.diff(session.id, seq, index, signal)
  const original = snapshotText(diff)
  if (original === undefined || original.split('\n')[repair.line-1] !== repair.from || original.split(repair.from).length !== 2) return
  const cwd = summary.cwd
  const parts = path.split('/')
  for (let i = 1; i <= parts.length; i++) {
    const type = (await fs.lstat(parts.slice(0, i).join('/'), { cwd, signal }))?.type
    if (type !== (i === parts.length ? 'file' : 'directory')) return
  }
  const target = await fs.resolve(path, { cwd, signal })
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file' || !Number.isSafeInteger(info.size) || info.size > 256 * 1024) return
  const live = (await fs.readText(target, signal)).replace(/\r\n/g, '\n')
  const expected = original.replace(repair.from, () => repair.to)
  const matches = value => live === value || live === value+'\n'
  const alreadyCorrected = matches(expected)
  if (!alreadyCorrected && !matches(original)) return { stale:true }
  const version = (await fs.stat(target, signal))?.version
  if (version !== info.version) return
  return { fs, cwd, path, target, version, alreadyCorrected, before:alreadyCorrected ? original : live,
    after:alreadyCorrected ? live : live.replace(repair.from, () => repair.to), repair }
}

export function permitsEdit(exec, files) {
  if (exec.name !== 'edit' || exec.parent || !exec.arguments) return undefined
  const args = exec.arguments
  if (args.replace_all || Object.keys(args).some(k => !['file_path','old_string','new_string','replace_all'].includes(k))) return undefined
  return files.find(file => args.file_path === file.path && args.old_string === file.repair.from && args.new_string === file.repair.to)
}

// Several allowed edits in one report can target different lines of the same
// file. The next edit still receives an atomic host version guard; only
// previously approved line substitutions may explain a newer file version.
async function readApprovedState(file, files, signal) {
  if (!file) return undefined
  const target = await file.fs.resolve(file.path, { cwd:file.cwd, signal })
  if (target.targetKey !== file.target.targetKey) return undefined
  const info = await file.fs.stat(target,signal)
  if (info?.type !== 'file' || !Number.isSafeInteger(info.size) || info.size > 256 * 1024) return undefined
  const content = (await file.fs.readText(target,signal)).replace(/\r\n/g, '\n')
  if ((await file.fs.stat(target,signal))?.version !== info.version) return undefined
  const before = file.before.split('\n'), live = content.split('\n')
  if (before.length !== live.length) return undefined
  const sameTarget = files.filter(f => f.target.targetKey === target.targetKey && f.before === file.before)
  for (let line = 0; line < live.length; line++) {
    if (before[line] !== live[line] && !sameTarget.some(f => f.repair.line === line+1 && f.repair.from === before[line] && f.repair.to === live[line])) return undefined
  }
  if (content === file.before && info.version !== file.version) return undefined
  return { version:info.version, value:live[file.repair.line-1] }
}

export async function editVersion(file, files, signal) {
  const state = await readApprovedState(file,files,signal)
  if (!state || state.value !== file.repair.from) throw new Error('文件内容或版本已变化，请重新审查。')
  return state.version
}

export async function fileWasCorrected(file, signal, files=[file]) {
  const state = await readApprovedState(file,files,signal)
  return !!state && state.value === file.repair.to
}
