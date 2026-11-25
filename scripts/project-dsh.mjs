import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const localHome = fileURLToPath(new URL('../.dsh-dev/', import.meta.url))
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'))
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DSH_HOME: localHome }
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.once('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
})
