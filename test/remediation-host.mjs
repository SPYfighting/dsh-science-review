// Script only the model responses. Source reads, writes, presentations, scoped
// tools, original authorization, rereads, and refusals all run in the DSH host.
import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const sourceName = 'batch-counts.txt'
const original = ['批次 A 独立样本数=12','批次 B 独立样本数=15']
const corrected = ['批次 A 独立样本数=6','批次 B 独立样本数=9']
const render = rows => rows.join('\n')+'\n'
let scenario

export function fileScenarioReply(body) {
  if (!scenario) return undefined
  const {file} = scenario
  if (body.model === 'test-reviewer') {
    const data = JSON.parse(body.messages[0].content[0].text)
    const reference = data.evidence.find(r => r.path === sourceName && r.kind === '工具结果')
    const snapshot = data.evidence.find(r => r.file === file)
    assert.ok(reference && snapshot,'Native source read and immutable deliverable snapshot must both be present')
    return JSON.stringify({reviewed:data.answer.map(row => row.id),findings:original.map((claim,i) => ({
      check:'numbers',severity:'error',claim,claimSource:snapshot.id,source:reference.id,quote:corrected[i],
      reason:'报告与同一批次的原始数值不一致。',suggestion:'按原始记录更正。'
    })), gaps:[]})
  }
  const isRepair = body.messages.some(m => m.content?.some?.(block => block.text?.startsWith('回答审查修正请求')))
  if (!isRepair) {
    switch (scenario.authorCalls++) {
      case 0: return {name:'read',arguments:{file_path:sourceName}}
      case 1: return {name:'write',arguments:{file_path:file,content:render(original)}}
      case 2: return {name:'present',arguments:{files:[{path:file}]}}
      default: return '已交付报告。'
    }
  }
  for (const block of body.messages.at(-1)?.content ?? []) {
    if (block.type === 'tool_result') scenario.toolErrors.push(block.is_error)
  }
  const i = scenario.correctionCalls++
  if (i < original.length) return {name:'edit',arguments:{file_path:file,old_string:original[i],new_string:corrected[i]}}
  return '已处理。'
}

export async function exerciseHostFileRemediation({workspace,plugin,rpc,until}) {
  const cwd = await realpath(workspace)
  await writeFile(join(cwd,sourceName),render(corrected))
  try {
    for (const name of ['allowed','changed','unauthorized']) {
      const file = 'batch-'+name+'.md'
      scenario = {file,authorCalls:0,correctionCalls:0,toolErrors:[]}
      const {sessionId} = await rpc('session/create',{cwd})
      const view = () => plugin('session?sessionId='+encodeURIComponent(sessionId))
      const status = async () => (await view()).turns[0]?.review
      const job = async (which) => until(async () => {
        const review = await status()
        if (review?.status === 'error') throw new Error(review.error)
        const result = review?.remediation?.[which]
        if (result?.phase === 'interrupted') throw new Error(JSON.stringify(result))
        return result?.phase === 'done' && result
      },name+' remediation '+which,30000)
      await plugin('session',{sessionId,mode:'manual',handling:'conditional'})
      const prompt = '请读取 '+sourceName+(name === 'unauthorized' ? '，说明各批次样本数。' : '，然后生成 '+file+'。')
      await rpc('session/prompt',{sessionId,mode:'queue',requestId:crypto.randomUUID(),content:[{type:'text',text:prompt}]})
      const first = await until(async () => (await view()).turns[0],name+' deliverable')
      const afterUserEdit = render(original)+'用户校订：未发布。\n'
      if (name === 'changed') await writeFile(join(cwd,file),afterUserEdit)
      await plugin('run',{sessionId,turnId:first.id})
      const automatic = await job(0)
      const report = await status()
      assert.equal(report.result.findings.length,2)
      assert.ok(report.result.findings.every(f => f.repair?.target === 'file'))
      assert.equal(automatic.automatic,true)
      const expected = name === 'allowed' ? 'verified' : 'needs_evidence'
      assert.deepEqual(automatic.steps.map(step => step.status),[expected,expected])
      if (name === 'allowed') {
        assert.deepEqual(scenario.toolErrors,[false,false])
        assert.equal(await readFile(join(cwd,file),'utf8'),render(corrected))
      } else {
        assert.equal(scenario.correctionCalls,0)
        assert.equal(automatic.usage.correction.requests,0)
        assert.equal(await readFile(join(cwd,file),'utf8'),name === 'changed' ? afterUserEdit : render(original))
      }
      if (name === 'unauthorized') {
        await plugin('remedy',{sessionId,turnId:first.id,revision:report.revision,id:automatic.id,
          action:'fix',indices:[0,1]})
        const manual = await job(1)
        assert.equal(manual.textOnly,true)
        assert.deepEqual(scenario.toolErrors,[true,true],'real native tool attempts must be denied')
        assert.deepEqual(manual.steps.map(step => step.status),['needs_evidence','needs_evidence'])
        assert.equal(await readFile(join(cwd,file),'utf8'),render(original))
      }
    }
  } finally {
    scenario = undefined
  }
  console.log('PASS: two authorized corrections reread from disk, user edits preserved, no unauthorized automatic requests, native writes denied on manual follow-up.')
}
