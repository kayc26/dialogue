// The always-reachable help path (ADR-0006). It must work with no JavaScript at all,
// because its job is to still be there when the app has failed, and in this demo it
// must never place a real call (QST-TRIAGE-DEMO-DIAL: B).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const body = html.slice(html.indexOf('<body>'))
const assistantWindow = readFileSync(join(process.cwd(), 'src/app/NewMessageWindow.vue'), 'utf8')

describe('help path in index.html', () => {
  it('is plain markup ahead of the app mount, so it renders without the app', () => {
    expect(body.indexOf('id="help"')).toBeGreaterThan(-1)
    expect(body.indexOf('id="help"')).toBeLessThan(body.indexOf('<div id="app">'))
  })

  it("is opened by the banner's Get help now link, the only way in since the red button went", () => {
    // Kay, 2026-11-17: the floating red button was removed because the banner already
    // says "Get help now". If the banner stopped linking to #help, the 911 / nurse-line
    // panel would still be in the page but nothing would open it.
    expect(assistantWindow).toMatch(/<a class="help" href="#help">Get help now<\/a>/)
  })

  it('opens and closes with links and CSS :target, not script', () => {
    expect(html).toMatch(/\.help-panel:target\s*{\s*display: block;/)
    expect(body).not.toMatch(/\son[a-z]+=/i) // no inline event handlers
  })

  it('offers 911 and the nurse line (988 was dropped, ADR-0006 iteration 4)', () => {
    expect(body).toMatch(/Call 911/)
    expect(body).toMatch(/Call the nurse line/)
    expect(body).not.toMatch(/988/)
  })

  it('never dials in the demo: no tel: links, and each call button opens a demo notice', () => {
    expect(html).not.toMatch(/href\s*=\s*["']\s*tel:/i) // a dialing link, not the word in a comment
    expect(body).toMatch(/href="#demo-911"/)
    expect(body).toMatch(/id="demo-911"[\s\S]*Nothing was dialed/)
    expect(body).toMatch(/id="demo-nurse"[\s\S]*Nothing was dialed/)
  })
})
