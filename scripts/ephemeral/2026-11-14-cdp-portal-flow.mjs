// 2026-11-14-cdp-portal-flow.mjs
// Context: Kay showed the real portal's message flow (Send a message → Contact your
// care team → disclaimer → "What type of medical question?" → Non-urgent medical
// question) and its expanded window; the assistant now lives on that path (ADR-0004).
// This walks the flow in headless Chrome against a local build pointed at rls-dev,
// with NO OpenRouter key ($0), screenshotting every step plus the expanded window and
// the high-contrast theme, and reporting page errors and any OpenRouter request.
//
// Usage: WINDOW=1500,950 BASE_URL=http://localhost:5174/ RLS_PASSWORD=… \
//        node scripts/ephemeral/2026-11-14-cdp-portal-flow.mjs <email> <shotDir>

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [email, shotDir] = process.argv.slice(2)
mkdirSync(shotDir, { recursive: true })
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${join(shotDir, 'profile')}`,
  `--window-size=${process.env.WINDOW ?? '1500,950'}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
setTimeout(() => { console.log('watchdog: gave up after 120 s'); chrome.kill(); process.exit(2) }, 120_000).unref()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 50 && !targets; i++) { await sleep(200); try { targets = await (await fetch('http://127.0.0.1:9335/json')).json() } catch {} }
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
const click = (text, scope = 'document') => js(`(() => { const b = [...${scope}.querySelectorAll('button')].find(x => x.innerText.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)})); if (!b) return 'MISSING: ${text.replace(/'/g, '')}'; b.click(); return 'ok' })()`)
const shot = async (name, note) => {
  await sleep(1200)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(shotDir, `${name}.png`), Buffer.from(r.result.data, 'base64'))
  const title = await js(`document.querySelector('#win-title')?.innerText ?? '(no window)'`)
  console.log(`${name.padEnd(16)} window: ${title}${note ? `  [${note}]` : ''}`)
}

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
await send('Page.navigate', { url: process.env.BASE_URL })
await sleep(3000)
await js(setVal('#email', email)); await js(setVal('#password', process.env.RLS_PASSWORD))
await js(`document.querySelector('form button[type=submit]').click()`)
await sleep(4000)
await shot('01-portal')
console.log('  click Send a message:', await click('Send a message'))
await shot('02-menu')
console.log('  click Contact your care team:', await click('Contact your care team', "document.querySelector('section.win')"))
await shot('03-disclaimer')
console.log("  click Yes, it's not urgent:", await click("Yes, it's not urgent", "document.querySelector('section.win')"))
await shot('04-type')
console.log('  expand:', await js(`(document.querySelector('[aria-label="Make the window bigger"]')?.click(), 'ok')`))
await shot('05-type-expanded')
console.log('  click Non-urgent medical question:', await click('Non-urgent medical question', "document.querySelector('section.win')"))
await sleep(1500)
console.log('  pick first demo patient:', await js(`(document.querySelector('button.card')?.click(), 'ok')`))
await sleep(2000)
await js(setVal('#ask', process.env.MESSAGE ?? "my husband won't wake up and his sugar was low"))
await js(`document.querySelector('form.ask button[type=submit]').click()`)
await shot('06-chat-expanded', 'sent an emergency message with no key')
console.log('  shrink:', await js(`(document.querySelector('[aria-label="Make the window smaller"]')?.click(), 'ok')`))
await shot('07-chat-docked')
console.log('  high contrast:', await click('High Contrast Theme'))
await shot('08-high-contrast')
await click('High Contrast Theme') // back to normal for the next run (stored in localStorage)
const fab = await js(`(() => { const f = document.querySelector('.help-fab').getBoundingClientRect(); const w = document.querySelector('section.win')?.getBoundingClientRect(); if (!w) return 'no window'; const overlap = !(f.left > w.right || f.right < w.left || f.top > w.bottom || f.bottom < w.top); return overlap ? 'OVERLAPS the window' : 'clear of the window' })()`)
console.log(`\nhelp button vs window: ${fab}`)
console.log('errors / unexpected requests:', errors.length ? '\n' + errors.join('\n') : 'none')
ws.close(); chrome.kill()

// Outcome (2026-11-14): used three times against the rls-dev build at 1500×950.
// - Run 1 caught a wrong click: the welcome conversation's preview text contains
//   "Contact your care team", so clicks are now scoped to section.win.
// - Run 2 caught two bugs. The high-contrast theme didn't reach the portal (a Vue
//   :global() rule compiled onto <html> only); fixed with --portal-navy / --stage-bg
//   tokens. The docked window ran up under the top bar; fixed with a height cap.
// - Run 3 was clean: every step reached, the help button clear of the window, no page
//   errors, and no OpenRouter request ($0).
