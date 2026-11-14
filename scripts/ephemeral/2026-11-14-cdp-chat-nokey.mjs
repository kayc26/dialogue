// 2026-11-14-cdp-chat-nokey.mjs
// Context: the chat panel's first UI check, at $0. With NO OpenRouter key, a patient
// message must still run the fixed-rule triage and show help (the help path never
// depends on the key; ADR-0006). Drives headless Chrome over the DevTools protocol
// against a local build pointed at rls-dev, signed in as a patient tester.
//
// Usage: BASE_URL=http://localhost:5174/ RLS_PASSWORD=… node scripts/ephemeral/2026-11-14-cdp-chat-nokey.mjs <email> <shotDir>

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [email, shotDir] = process.argv.slice(2)
mkdirSync(shotDir, { recursive: true })
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${join(shotDir, 'profile')}`, `--window-size=${process.env.WINDOW ?? '1100,1600'}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
// Watchdog: the first version hung silently without --no-first-run.
setTimeout(() => { console.log('watchdog: gave up after 90 s'); chrome.kill(); process.exit(2) }, 90_000).unref()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 50 && !targets; i++) { await sleep(200); try { targets = await (await fetch('http://127.0.0.1:9334/json')).json() } catch {} }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  else if (msg.method === 'Network.requestWillBeSent' && /openrouter/.test(msg.params.request.url)) errors.push(`UNEXPECTED OpenRouter request: ${msg.params.request.url}`)
})
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
const js = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value
const setVal = (sel, v) => `(() => { const el = document.querySelector('${sel}'); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
await js(`try { localStorage.clear() } catch {}`)
await send('Page.navigate', { url: process.env.BASE_URL })
await sleep(3000)
await js(setVal('#email', email)); await js(setVal('#password', process.env.RLS_PASSWORD))
await js(`document.querySelector('form button[type=submit]').click()`)
await sleep(4000)
await js(`document.querySelector('button.card')?.click()`)
await sleep(3000)
for (const [n, msg] of [["my husband won't wake up and his sugar was low"], ['What fruit can I eat?']].entries()) {
  await js(setVal('#ask', msg[0]))
  await js(`document.querySelector('form.ask button[type=submit]').click()`)
  await sleep(2500)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(shotDir, `chat-${n}.png`), Buffer.from(shot.result.data, 'base64'))
  console.log(`\n=== sent: ${msg[0]}`)
  console.log(await js(`[...document.querySelectorAll('ol.items > li')].slice(-3).map(li => li.className + ': ' + li.innerText.replace(/\\n+/g, ' | ')).join('\\n')`))
}
console.log('\nerrors / unexpected requests:', errors.length ? '\n' + errors.join('\n') : 'none')
ws.close(); chrome.kill()

// Used 2026-11-14 against rls-dev as rls-a with no key: the emergency message showed the
// 911 card at once; a plain question first showed a check-in card (the classifier-failure
// floor wrongly applied to "no key"), fixed so it shows only the add-your-key note. No
// OpenRouter request was made in either run; no page errors. The first run hung without
// --no-first-run; a 90 s watchdog now prevents silent hangs.

// Also used 2026-11-14 with WINDOW=1500,950 and WINDOW=430,900 to check the mockup-style
// chat window: desktop fine first time; phone first showed the footer squeezing the chat,
// fixed by compact phone styles; rerun showed the Ask row and help button both clear.
