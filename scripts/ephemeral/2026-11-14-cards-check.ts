// 2026-11-14-cards-check.ts
// Context: ADR-0013 (QST-KB-SHAPE: C, QST-KB-REVIEW: A). Kay asked to see the topic
// cards and their proposed answers before any pipeline is built. Nibble drafted them by
// hand in kb/out/cards-draft.json (gitignored: ADA-derived text). This script:
//   1. runs every card through the assistant's own answer guard (src/lib/chat/guard.ts):
//      no dose advice, citations only to its listed sources, and every number in the
//      card must appear in those sources;
//   2. checks that every source id exists, and flags dose-tagged sources;
//   3. writes kb/out/cards-draft.md: each card beside its source passages, for Kay and
//      the clinical sponsor to review.
// $0: no model calls. Prints card ids and pass/fail only.
//
// Usage: node scripts/ephemeral/2026-11-14-cards-check.ts
//
// Outcome (2026-11-14): all 30 hand-drafted cards passed: no dose advice, and every
// number appears in its sources. 15 cards draw on dose-tagged sources (only their
// non-dose sentences) and say so in their review notes. The review doc gives Kay and
// the sponsor one card per section, with its sources in a collapsible block.

import { readFileSync, writeFileSync } from 'node:fs'
import { checkAnswer } from '../../src/lib/chat/guard.ts'

type Passage = { id: string; docTitle: string; sourceLabel: 'ADA' | 'care_team'; section: string | null; body: string; tags: string[] }
// How the card will be credited in the chat (ChatPanel's source chips): by source, not document title.
const SOURCE = { ADA: 'American Diabetes Association', care_team: 'Your care team' } as const
const creditFor = (ids: string[], byId: Map<string, Passage>) =>
  [...new Set(ids.map((s) => byId.get(s)?.sourceLabel).filter((l): l is Passage['sourceLabel'] => !!l))].map((l) => `📄 ${SOURCE[l]}`).join('  ')
type Card = { id: string; topic: string; asks: string[]; answer: string; sources: string[]; review_notes: string[] }

const passages = (JSON.parse(readFileSync('kb/out/passages.json', 'utf8')) as { passages: Passage[] }).passages
const byId = new Map(passages.map((p) => [p.id, p]))
const draft = JSON.parse(readFileSync('kb/out/cards-draft.json', 'utf8')) as { status: string; cards: Card[] }

let failed = 0
const md: string[] = [
  '# Topic cards: DRAFT for clinical review',
  '',
  `> ${draft.status}`,
  '',
  'Each card shows the proposed answer, the questions it is meant for, and the approved passages it was written from.',
  'Checked automatically: no dose advice, and every number in the answer appears in its sources.',
  'To review, mark each card **Approve**, **Edit** (write the change), or **Drop**.',
  '',
  '## Topics',
  '',
  ...draft.cards.map((c, i) => `${i + 1}. [${c.topic}](#${c.id})`),
  '',
]

for (const [i, c] of draft.cards.entries()) {
  const missing = c.sources.filter((s) => !byId.has(s))
  const shown = c.sources.filter((s) => byId.has(s)).map((s) => ({ id: s, body: byId.get(s)!.body }))
  const verdict = checkAnswer(`${c.answer} ${c.sources.map((s) => `[kb:${s}]`).join(' ')}`, shown, '')
  const doseTagged = c.sources.filter((s) => byId.get(s)?.tags.includes('dose_related'))
  const words = c.answer.split(/\s+/).length
  const ok = verdict.ok && missing.length === 0
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(22)} ${String(words).padStart(3)} words${verdict.ok ? '' : `  guard: ${verdict.reason}`}${missing.length ? `  missing: ${missing.join(',')}` : ''}${doseTagged.length ? `  dose-tagged sources: ${doseTagged.length}` : ''}`)

  md.push(
    `---`,
    '',
    `<a id="${c.id}"></a>`,
    `## ${i + 1}. ${c.topic}`,
    '',
    `**For questions like:** ${c.asks.map((a) => `“${a}”`).join(' · ')}`,
    '',
    '**Proposed answer:**',
    '',
    `> ${c.answer}`,
    '',
    `**Shown to patients as:** ${creditFor(c.sources, byId)}`,
    '',
    `*${words} words · automatic checks: ${ok ? 'passed' : `FAILED (${verdict.ok ? 'missing source' : verdict.reason})`}*`,
    '',
  )
  if (c.review_notes.length) md.push('**Questions for the reviewer:**', '', ...c.review_notes.map((n) => `- ${n}`), '')
  md.push('**Review:** ☐ Approve ☐ Edit ☐ Drop', '', '<details><summary>Source passages (' + c.sources.length + ')</summary>', '')
  for (const s of c.sources) {
    const p = byId.get(s)
    if (!p) continue
    md.push(`**${s}**${p.tags.includes('dose_related') ? ' *(dose-tagged)*' : ''}: ${p.docTitle}${p.section ? ` · ${p.section}` : ''}`, '', '```', p.body.trim(), '```', '')
  }
  md.push('</details>', '')
}

writeFileSync('kb/out/cards-draft.md', md.join('\n'))

// The same review as a local web page (Kay: "where can i see the cards"). It stays in
// kb/out/, which is gitignored, and opens from disk; nothing is published.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Topic cards (draft)</title><style>',
  ':root{--bg:#f3f5f9;--card:#fff;--text:#1c1f26;--muted:#4f5563;--line:#c9ced8;--accent:#011f5b;--warn:#fff6df;--warnText:#6b4e00}',
  '@media (prefers-color-scheme: dark){:root{--bg:#111318;--card:#191c22;--text:#eef0f4;--muted:#b9becb;--line:#4a505c;--accent:#9db7ef;--warn:#3a3220;--warnText:#f5dc9a}}',
  'body{margin:0;background:var(--bg);color:var(--text);font:18px/1.55 system-ui,-apple-system,sans-serif}',
  'main{max-width:52rem;margin:0 auto;padding:1.5rem 1rem 4rem}h1{color:var(--accent);margin:.2rem 0}',
  '.banner{background:var(--warn);color:var(--warnText);padding:.7rem 1rem;border-radius:8px;margin:1rem 0}',
  'nav ol{columns:2;column-gap:2rem;padding-left:1.4rem}@media (max-width:640px){nav ol{columns:1}}',
  'a{color:var(--accent)}section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem 1.25rem;margin:1.25rem 0}',
  'section h2{margin:.1rem 0 .4rem;font-size:1.25rem}.asks{color:var(--muted);font-size:.92rem}',
  '.answer{border-left:4px solid var(--accent);padding:.4rem .9rem;margin:.8rem 0;font-size:1.05rem}',
  '.credit{display:inline-block;font-size:.85rem;border:1px solid var(--line);border-radius:999px;padding:.1rem .6rem;margin-bottom:.4rem}',
  '.meta{color:var(--muted);font-size:.85rem}.notes{background:var(--warn);color:var(--warnText);border-radius:8px;padding:.5rem .9rem .5rem 1.8rem;font-size:.92rem}',
  'details{margin-top:.6rem}summary{cursor:pointer;color:var(--accent)}pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.6rem;font-size:.85rem}',
  '.tag{font-size:.75rem;border:1px solid var(--line);border-radius:4px;padding:0 .3rem;margin-left:.3rem}',
  '</style></head><body><main>',
  '<h1>Topic cards (draft)</h1>',
  `<div class="banner"><strong>Not clinician-approved.</strong> ${esc(draft.status)}</div>`,
  '<p>Each card shows the proposed answer, the kinds of questions it is for, questions for the reviewer, and the passages it was written from. Checked automatically: no dose advice, and every number appears in its sources.</p>',
  '<nav><ol>',
  ...draft.cards.map((c) => `<li><a href="#${c.id}">${esc(c.topic)}</a></li>`),
  '</ol></nav>',
  ...draft.cards.map((c, i) => {
    const src = c.sources.map((s) => byId.get(s)).filter((p): p is Passage => !!p)
    return [
      `<section id="${c.id}"><h2>${i + 1}. ${esc(c.topic)}</h2>`,
      `<div class="asks">For questions like: ${c.asks.map((a) => `“${esc(a)}”`).join(' · ')}</div>`,
      `<div class="answer">${esc(c.answer)}</div>`,
      `<div class="credit">${esc(creditFor(c.sources, byId))}</div>`,
      `<div class="meta">${c.answer.split(/\s+/).length} words · ${c.sources.length} source passage${c.sources.length === 1 ? '' : 's'}</div>`,
      c.review_notes.length ? `<ul class="notes">${c.review_notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '',
      `<details><summary>Source passages</summary>${src.map((p) => `<p><strong>${p.id}</strong>${p.tags.includes('dose_related') ? '<span class="tag">dose-tagged</span>' : ''} · ${esc(p.docTitle)}${p.section ? ` · ${esc(p.section)}` : ''}</p><pre>${esc(p.body.trim())}</pre>`).join('')}</details>`,
      '</section>',
    ].join('')
  }),
  '</main></body></html>',
].join('\n')
writeFileSync('kb/out/cards-draft.html', html)
console.log(`\n${draft.cards.length} cards, ${failed} failed. Wrote kb/out/cards-draft.md`)
process.exit(failed ? 1 : 0)
