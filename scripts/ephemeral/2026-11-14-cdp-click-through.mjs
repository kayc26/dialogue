// 2026-11-14-cdp-click-through.mjs
// Context: Kay reported "i can't click into patient view now" after the patient-view
// deploy (e635375). This drives a real headless Chrome over the DevTools protocol (no
// extra packages; Node 23 has WebSocket) against a local build pointed at the rls-dev
// branch: sign in as a test user, try the view switch and a patient card, and record
// console errors, page exceptions, page text, and screenshots after each step.
//
// Usage:
//   1. build: VITE_NEON_AUTH_URL=… VITE_NEON_DATA_API_URL=… npx vite build --outDir <dir>
//   2. serve: npx vite preview --outDir <dir> --port 5173 --strictPort
//   3. node scripts/ephemeral/2026-11-14-cdp-click-through.mjs <email> <outDir for shots>
//      (password from RLS_PASSWORD)

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [email, shotDir] = process.argv.slice(2)
const password = process.env.RLS_PASSWORD
mkdirSync(shotDir, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${join(shotDir, 'profile')}`,
  `--window-size=${process.env.WINDOW ?? '1100,1300'}`, '--no-first-run', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(200)
  try { targets = await (await fetch('http://127.0.0.1:9333/json')).json() } catch {}
}
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))

let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  else if (msg.method === 'Runtime.exceptionThrown') events.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`)
  else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) events.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
  else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') events.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`)
})
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(shotDir, `${name}.png`), Buffer.from(r.result.data, 'base64')) }
const text = () => evalJs('document.body.innerText.replace(/\\n{2,}/g, "\\n").slice(0, 900)')
const step = async (name, js, wait = 2500) => {
  const r = js ? await evalJs(js) : undefined
  await sleep(wait)
  await shot(name)
  console.log(`\n=== ${name}${r !== undefined ? ` (action: ${r})` : ''}\n${await text()}`)
  if (events.length) console.log('--- events:\n' + events.splice(0).join('\n'))
}

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
await send('Page.navigate', { url: process.env.BASE_URL ?? 'http://localhost:5173/' })
await step('1-loaded', null, 3000)
const fill = (sel, v) => `(() => { const el = document.querySelector('${sel}'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 'filled ${sel}' })()`
await evalJs(fill('#email', email)); await evalJs(fill('#password', password))
await step('2-signed-in', `(document.querySelector('form button[type=submit]').click(), 'clicked Sign in')`, 4000)
await step('3-care-team', `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Care team view'); if (!b) return 'no Care team button'; b.click(); return 'clicked Care team view' })()`)
await step('4-patient-view', `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Patient view'); if (!b) return 'no Patient view button'; b.click(); return 'clicked Patient view' })()`, 3500)
await step('5-patient-card', `(() => { const b = document.querySelector('button.card'); if (!b) return 'no patient card'; b.click(); return 'clicked card: ' + b.innerText.split('\\n')[0] })()`, 3500)
const hit = await evalJs(`(() => { const r = document.querySelector('nav.switch')?.getBoundingClientRect(); if (!r) return 'no switch'; const el = document.elementFromPoint(r.x + 20, r.y + r.height / 2); return el ? el.tagName + '.' + el.className + ' "' + (el.textContent||'').trim().slice(0,30) + '"' : 'none' })()`)
console.log(`\nelement on top of the view switch: ${hit}`)

ws.close(); chrome.kill()

// Used 2026-11-14 (rls-admin against a local build pointed at rls-dev): sign-in, the view
// switch (both directions), and a patient card all worked; nothing covers the switch.
// Kay's screenshot showed the pre-deploy page (no help button), i.e. a cached copy:
// fixed by a hard reload. The run did find a real defect: regimenLines threw on a stored
// regimen without usual_times (rls-dev placeholder shape); fixed and covered by a
// regression test; rerun showed "placeholder: dose not recorded." and no errors.
