// Exercise the published DSH Web host, API-key adapter and authenticated session API.
// Both "models" are deterministic loopback fixtures. No user configuration is inherited.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import manifest from '../package.json' with { type: 'json' }

const root = fileURLToPath(new URL('../', import.meta.url))
const defaultCli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'))
const targetCli = process.env.DSH_TEST_CLI || defaultCli
const previousPackage = process.env.DSH_TEST_UPGRADE_FROM
let cli = previousPackage ? (process.env.DSH_TEST_LEGACY_CLI || defaultCli) : targetCli
const temp = await mkdtemp(join(tmpdir(), 'dsh-review-test-'))
const workspace = join(temp, 'workspace')
const patch = join(temp, 'overlay.yml')
const env = Object.fromEntries(['PATH', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'HOME', 'USERPROFILE']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]))
Object.assign(env, { DSH_HOME: join(temp, 'dsh'), DSH_AGENTS_HOME: join(temp, 'agents'),
  DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'loopback-test-only' })

const claims = { wrong: 'The total was 21 samples.', corrected: 'The total was 12 samples.' }
const reviewerCalls = []
const authorCalls = []
function scriptedAnswer(body) {
  if (body.model === 'test-author') {
    authorCalls.push(body)
    return JSON.stringify(body.messages).includes('先前回答的独立审查') ? claims.corrected : claims.wrong
  }
  assert.equal(body.model, 'test-reviewer')
  reviewerCalls.push(body)
  const data = JSON.parse(body.messages[0].content[0].text)
  const findings = data.answer.some(row => row.text === claims.wrong) ? [{
    check: 'numbers', severity: 'error', claim: '21 samples', source: 'Q',
    quote: '12 samples', reason: 'The answer reverses the digits in the user-provided count.',
    suggestion: 'Use the original count.',
  }] : []
  return JSON.stringify({ reviewed: data.answer.map(row => row.id), findings, limitations: [] })
}
const mock = createServer(async (req, res) => {
  try {
    assert.equal(req.method, 'POST')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks))
    const parts = [
      { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: body.model,
        content: [], usage: { input_tokens: 90, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: scriptedAnswer(body) } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } },
      { type: 'message_stop' },
    ]
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(parts.map(part => 'data: ' + JSON.stringify(part) + '\n\n').join(''))
  } catch (error) { res.writeHead(400).end(error.message) }
})
async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

function launch(args) {
  const p = spawn(process.execPath, [cli, ...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const job = { p, output: '', ended: once(p, 'exit') }
  const collect = b => { job.output = (job.output + b).slice(-40000) }
  p.stdout.on('data', collect)
  p.stderr.on('data', collect)
  return job
}
async function until(fn, what, timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn()
    if (value) return value
    await delay(120)
  }
  throw new Error('Timed out waiting for ' + what)
}

let host
let origin
let cookie
async function startHost() {
  // Reserve a loopback port independently from the model server.
  const reservation = createServer()
  const port = await listen(reservation)
  await new Promise(resolve => reservation.close(resolve))
  host = launch(['web', '--patch', patch, '--no-open', '--host', '127.0.0.1', '--port', String(port)])
  const url = await until(() => {
    if (host.p.exitCode !== null) throw new Error('DSH exited before becoming ready')
    return host.output.match(/dsh web: (http:\/\/[^\s]+)/)?.[1]
  }, 'DSH Web startup', 60000)
  origin = new URL(url).origin
  const res = await fetch(url, { redirect: 'manual' })
  assert.equal(res.status, 303)
  cookie = res.headers.get('set-cookie').split(';')[0]
}
async function stopHost() {
  if (host && host.p.exitCode === null && host.p.signalCode === null) {
    host.p.kill('SIGTERM')
    await host.ended
  }
}
async function json(path, data) {
  const response = await fetch(origin + path, {
    method: data === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const text = await response.text()
  assert.equal(response.status, 200, path + ' returned ' + response.status + ': ' + text.slice(0, 350))
  return JSON.parse(text)
}
const plugin = (route, data) => json('/plugins/dsh-review/' + route, data)
async function rpc(method, request) {
  const { result } = await json('/api/' + method, {
    type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } },
  })
  assert.equal(result.ok, true, JSON.stringify(result.error))
  return result.value
}
try {
  await mkdir(workspace)
  const port = await listen(mock)
  await writeFile(patch, JSON.stringify([
    { id: 'llm-deepseek', config: { baseURL: 'http://127.0.0.1:' + port,
      models: [{ id: 'test-author' }, { id: 'test-reviewer' }] } },
    { id: 'llm-deepseek-account', disabled: true },
    { id: 'agent-default-model', config: { provider: 'deepseek-official', model: 'test-author' } },
    { id: 'session-title-llm', disabled: true },
  ]))
  const target = process.argv[2]
  const packageSpec = target === '--registry' ? manifest.name + '@' + manifest.version : target ? resolve(target) : 'link:' + root
  async function installPackage(spec) {
    const install = launch(['plugin', '--profile', 'web', 'add', spec])
    assert.equal((await install.ended)[0], 0, install.output)
  }
  await installPackage(previousPackage ? resolve(previousPackage) : packageSpec)
  await startHost()
  const global = await plugin('settings')
  assert.equal(global.settings.mode, 'manual')
  const { models } = await plugin('models')
  const model = models.find(row => row.id === 'test-reviewer').value
  const { efforts } = await plugin('efforts?model=' + encodeURIComponent(model))
  assert.ok(efforts.length, 'The fixture route should advertise reasoning efforts')
  const effort = efforts.at(-1).id
  await plugin('settings', { revision: global.revision, settings: {
    ...global.settings, model, effort, checks: ['numbers'], coverage: 'all' } })
  const { sessionId } = await rpc('session/create', { cwd: workspace })
  const view = () => plugin('session?sessionId=' + encodeURIComponent(sessionId))
  const ask = text => rpc('session/prompt', { sessionId, requestId: crypto.randomUUID(), mode: 'queue',
    content: [{ type: 'text', text }] })
  await ask('The source lists 12 samples. Give the total.')
  const first = await until(async () => (await view()).turns[0], 'first completed turn')
  assert.equal(first.review, null)
  await plugin('run', { sessionId, turnId: first.id })
  const report = await until(async () => {
    const review = (await view()).turns[0].review
    if (review?.status === 'error') throw new Error(review.error)
    return review?.result
  }, 'manual report')
  assert.equal(report.findings[0].quote, '12 samples')
  assert.equal(report.findings[0].claim, '21 samples')
  assert.equal(report.model.effort, effort)
  assert.deepEqual(report.usage, { requests: 1, totalTokens: 130 })
  assert.equal(reviewerCalls[0].tools?.length ?? 0, 0)
  assert.ok(!reviewerCalls[0].dsh_session_log)
  await plugin('run', { sessionId, turnId: first.id })
  assert.equal(reviewerCalls.length, 1)

  await plugin('session', { sessionId, mode: 'every' })
  await ask('Please confirm the count after checking the previous answer.')
  const second = await until(async () => (await view()).turns[1]?.review?.result, 'automatic report')
  assert.equal(second.findings.length, 0)
  assert.equal(reviewerCalls.length, 2)
  assert.equal(authorCalls.length, 2)
  assert.match(JSON.stringify(authorCalls[1].messages), /21 samples.*12 samples/s)
  assert.match(JSON.stringify(reviewerCalls[1].messages), /The total was 12 samples/)
  await stopHost()
  if (previousPackage) {
    cli = targetCli
    await installPackage(packageSpec)
  }
  await startHost()
  const recovered = await view()
  assert.equal(recovered.mode, 'every')
  assert.equal(recovered.turns[0].review.result.findings[0].source, 'Q')
  assert.deepEqual(recovered.turns[0].review.result.usage, report.usage)
  assert.equal((await plugin('settings')).settings.model, model)
  assert.equal(reviewerCalls.length, 2)
  assert.deepEqual(recovered.turns[0].review.feedback, { sent: 1, total: 1 })
  if (previousPackage) {
    await ask('Please state the final count again.')
    await until(async () => (await view()).turns[2]?.review?.result, 'first new report after upgrading')
    await stopHost()
    await startHost()
    const reread = await view()
    assert.deepEqual(reread.turns[0].review.result, report)
    assert.equal(reread.turns[0].review.feedback.sent, 1)
    assert.ok(reread.turns[2].review.result)
    assert.equal(reviewerCalls.length, 3)
    console.log('PASS: upgrade retained the original report, feedback receipt and mode alongside the new report.')
  }
  console.log('PASS: real DSH install, settings, manual and automatic reviews, evidence, feedback, restart.')
} catch (error) {
  if (process.env.DSH_TEST_DIAGNOSTICS) {
    const fs = await import('node:fs/promises')
    for (const file of await fs.readdir(join(env.DSH_HOME,'logs')).catch(() => [])) {
      if (/\.log$|\.jsonl$/.test(file)) {
        const lines = (await fs.readFile(join(env.DSH_HOME,'logs',file),'utf8')).split('\n')
        console.error(lines.filter(line => /Review route failed|could not|failed to|TypeError|ERR_MODULE/.test(line)).slice(-10).map(line=>line.slice(0,450)).join('\n'))
      }
    }
  }
  if (host) console.error(host.output.replace(/([?&]token=)[^\s]+/gi, '$1[redacted]').slice(-4000))
  throw error
} finally {
  await stopHost()
  mock.closeAllConnections()
  if (mock.listening) await new Promise(resolve => mock.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
