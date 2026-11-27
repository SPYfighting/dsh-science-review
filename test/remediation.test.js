import test from 'node:test'
import assert from 'node:assert/strict'
import { createRemediation } from '../lib/remediation.js'
import { correctedText,verifyRemediation } from '../lib/remedy-verify.js'
import { prepareFileEdit,permitsEdit,fileWasCorrected } from '../lib/remedy-file.js'

const drain = () => new Promise(resolve => setImmediate(resolve))
const date = { severity:'error', check:'numbers', claim:'今天是2026年11月26日', source:'D1',quote:'2026-11-27',
  repair:{kind:'date',target:'answer',from:'2026-11-26',to:'2026-11-27',source:'D1'} }
const note = {severity:'note',check:'writing',claim:'你好',source:'A1',quote:'你好'}
const options = {turnId:'1',revision:-3,action:'fix'}
const gap = {claimSource:'A1',claim:'论文正式出版',missing:'出版方时间',impact:'引用日期会改变。'}
function setup({policy='conditional', findings=[date,note],gaps=[gap],busy=false}={}) {
  const log=[],rows = new Map(),queued=[],listeners = {},captured={}
  const state = {turns:[{id:'1',human:true}],reports:{1:{status:'done',seq:-3,result:{findings,gaps}}}}
  const session = {id:'abc',header:{origin:'main'},snapshotEvents:(a,b)=>log.filter(e=>e.seq>=a && e.seq<b)}
  let release
  const idle = busy?new Promise(resolve=>{release=resolve}):Promise.resolve()
  const agent = {session,status:'idle',inbox:{nextStep:[],nextTurn:queued,remove:id=>{const i=queued.findIndex(x=>x.id===id); if(i>=0) queued.splice(i,1)}},
    whenIdle:()=>idle,followup(message){queued.push(message)},cancel(){captured.cancelled=true}}
  const ctx = {tools:{guard(fn){captured.guard=fn;return ()=>{captured.guard=null}}},
    sessionController:{resolveAgent:async()=>({agent})},
    on(name,fn){listeners[name]=fn;return ()=>{}}, get(){},llm:{}}
  const store = {remedies:()=>[...rows.values()],saveRemedy:(_,j)=>rows.set(j.id,structuredClone(j))}
  const origin = {question:'今天几号？',answer:'今天是2026年11月26日。',route:{provider:'fixture',model:'model'},evidence:[]}
  const r = createRemediation({ctx,store,stateOf:()=>state,policyOf:()=>policy,settingsOf:()=>({model:'session'}),loadTurn:async()=>origin})
  function event(type,data) {
    const e = {seq:log.length,type,data}
    log.push(e)
    return r.onEvent(session,e)
  }
  async function enter() {
    assert.equal(queued.length,1)
    const message=queued.shift()
    event('turn/start',{turn:2})
    const decision = await listeners['agent/pre-step']({agent},async()=>({kind:'enter',messages:[message]}))
    assert.equal(decision.kind,'enter')
    event('user/message',message)
    return message
  }
  function answer(text) {
    event('assistant/message',{turn:2,step:1,message:{source:{kind:'model',provider:'fixture',model:'model'},content:[{type:'text',text}]},usage:{inputTokens:7,outputTokens:2,totalTokens:9}})
    return event('turn/end',{turn:2,reason:{kind:'completed'}})
  }
  return {session,r,log,state,event,enter,answer,rows,queued,listeners,captured,release,agent,ctx,origin}
}

test('独立纠错回合绕开普通逐轮审查，自动批只选机械错误，原轮日期直接核验',async()=>{
  const t=setup()
  const job=t.r.start(t.session,{...options,automatic:true})
  await drain()
  assert.equal(job.phase,'queued')
  assert.equal(job.steps.length,1)
  assert.equal(t.r.start(t.session,{...options,automatic:true}).id,job.id)
  const message = await t.enter()
  assert.equal(message.source.kind,'dsh-review-remediation')
  assert.match(message.content[0].text,/回答审查修正请求/)
  assert.equal(typeof t.captured.guard({name:'bash',agent:t.agent,arguments:{}}),'string')
  assert.equal(typeof t.captured.guard({name:'edit',parent:'nested',agent:t.agent,arguments:{file_path:'x'}}),'string')
  assert.equal(t.captured.guard({name:'bash',agent:{session:{}}}),undefined)
  assert.equal(t.answer('今天是 2026 年 11 月 27 日。'),true)
  await drain()
  assert.equal(job.phase,'done')
  assert.equal(job.steps[0].status,'verified')
  assert.deepEqual(job.usage.correction,{requests:1,inputTokens:7,outputTokens:2,totalTokens:9})
  assert.deepEqual(job.usage.verification,{requests:0})
  assert.equal(t.r.start(t.session,{...options,automatic:true}).id,job.id)
  await t.r.close()
})

test('手动、疑点、无依据的自动项，及用户主动重试',async()=>{
  const t=setup({policy:'manual'})
  assert.equal(t.r.start(t.session,{...options,automatic:true}).phase,'skipped')
  const j=t.r.start(t.session,{...options,indices:[0]})
  await drain();await t.enter();t.answer('已经修好了')
  await drain()
  assert.equal(j.steps[0].status,'needs_evidence')
  assert.equal(t.r.start(t.session,{...options,indices:[0]}).id,j.id)
  const retry=t.r.start(t.session,{...options,id:j.id,indices:[0]})
  assert.notEqual(retry.id,j.id)
  t.r.cancel(t.session,retry.id)
  assert.equal(retry.phase,'cancelled')
  await t.r.close()
  const x=setup({policy:'auto',findings:[],gaps:[{...gap,missing:'papers.csv 的作者原始记录'}]})
  const pending=x.r.start(x.session,{...options,automatic:true})
  await drain()
  assert.equal(pending.steps[0].status,'needs_evidence')
  assert.equal(x.queued.length,0)
  await x.r.close()
})

test('等待期间的用户输入、证据变更、会话取消均不触发新模型轮次',async()=>{
  for (const cause of ['input','revision','stop']) {
    const t=setup({busy:true})
    const j=t.r.start(t.session,{...options,automatic:true})
    await drain()
    if(cause==='input') t.listeners['agent/inbox/inserted']({agent:t.agent,message:{source:{kind:'user'}}})
    if(cause==='revision') t.state.reports[1].seq=-4
    if(cause==='stop') t.event('turn/end',{turn:3,reason:{kind:'aborted'}})
    t.release();await drain()
    assert.equal(j.phase,'interrupted'); assert.equal(t.queued.length,0)
    await t.r.close()
  }
})

test('重启后拒绝残留的插件排队消息并保留并行的真实用户输入',async()=>{
  const t=setup()
  const old={id:'stale',source:{kind:'dsh-review-remediation',remedyId:'missing'}}
  const decide= (messages)=> t.listeners['agent/pre-step']({agent:t.agent},async()=>({kind:'enter',messages}))
  assert.deepEqual(await decide([old]),{kind:'reject'})
  const user={id:'u',source:{kind:'user'}}
  assert.deepEqual((await decide([old,user])).messages,[user])
  await t.r.close()
})

test('本地确认比对整行，原值、承诺或模型的复述不能标记成功',()=>{
  assert.equal(correctedText(date.repair,'我以后会说2026-11-27。'),false)
  assert.equal(correctedText(date.repair,'2026-11-27'),true)
  assert.equal(correctedText({kind:'model',target:'answer',to:'lab/model'},'当前模型是 lab/model。'),true)
  assert.equal(correctedText({kind:'model',target:'answer',to:'lab/model'},'也许是 lab/model。'),false)
  assert.equal(correctedText({kind:'number',target:'answer',from:'均值=9',to:'均值=8'},'均值=9\n均值=8'),false)
})

test('文件自述不能通过定向复审，单个文件的限定 edit 受快照与版本约束',async()=>{
  const repair={kind:'number',target:'file',file:'report.md',line:1,workspaceSeq:99,snapshotId:'F99.0',from:'独立样本=12',to:'独立样本=6'}
  const signal = new AbortController().signal
  let text='独立样本=12\n'
  const fs={lstat:async()=>({type:'file'}),resolve:async()=>({targetKey:'opaque:1'}),stat:async()=>({type:'file',version:'v',size:40}),readText:async()=>text}
  const changes={summary:()=>({turn:1,cwd:'/work',files:[{path:'report.md'}]}),
    diff:async()=>({kind:'text',before:false,after:true,hunks:[{newStart:1,newLines:1,lines:['+独立样本=12']}]})}
  const ctx={get:name=>({fs,workspaceChanges:changes,workingDirectory:{}})[name]}
  const origin={question:'请生成 report.md',workspaceSeq:99,number:1}
  const file=await prepareFileEdit(ctx,{id:'s'},origin,repair,signal)
  assert.ok(file)
  assert.equal(await fileWasCorrected(file,signal),false)
  const selected=[{id:'finding:0',item:{repair},step:{}}]
  await verifyRemediation({ctx,session:{id:'s'},settings:{},origin,corrected:{answer:'文件已修改'},files:[file],selected,signal,usage:{requests:0}})
  assert.equal(selected[0].step.status,'needs_evidence')
  const args={file_path:'report.md',old_string:repair.from,new_string:repair.to}
  assert.equal(permitsEdit({name:'edit',arguments:args},[file]),file)
  assert.equal(permitsEdit({name:'edit',arguments:{...args,replace_all:true}},[file]),undefined)
  assert.equal(permitsEdit({name:'edit',parent:{},arguments:args},[file]),undefined)
  assert.equal(await prepareFileEdit(ctx,{id:'s'},{...origin,question:'只解释 report.md，不要修改'},repair,signal),undefined)
  text='独立样本=6\n'
  assert.equal(await fileWasCorrected(file,signal),true)
  assert.equal((await prepareFileEdit(ctx,{id:'s'},origin,repair,signal)).alreadyCorrected,true)
})
