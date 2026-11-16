// Load topic-card drafts into public.kb_cards (ADR-0013).
//
//   npm run kb:cards:load -- [cards file] [--yes]     default file: kb/out/cards-blind.json
//
// Every card must pass the same checks as kb:cards:check (kb/cards-lib.ts) against the
// current kb/out/passages.json, or nothing is loaded. The file is the whole card set:
// cards in the table but not in the file are deleted.
//
// Approval survives a reload only when nothing a patient would see changed. The
// database enforces it (migration 0003): new cards arrive as drafts, and a changed
// body, source list, or source-passage text sends an approved card back to draft.
// The dry run lists which approved cards a load would send back.
//
// Uses the owner DATABASE_URL from .env.local (kb_cards is admin-written, like
// kb_chunks) and prints only the host. Dry run unless --yes.

import { neon } from '@neondatabase/serverless'
import { checkCard, readCards, readPassages } from './cards-lib.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run kb:cards:load` (it reads .env.local).')
  process.exit(2)
}
const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'kb/out/cards-blind.json'
const { cards } = readCards(file)
const byId = readPassages()

const seen = new Set<string>()
const failures = cards.map((c) => ({ id: c.id, problems: checkCard(c, byId, seen).problems })).filter((f) => f.problems.length)
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f.id}: ${f.problems.join('; ')}`)
  console.error(`\n${failures.length} card(s) fail the checks; nothing loaded. Run npm run kb:cards:check -- ${file}`)
  process.exit(1)
}

const sql = neon(url)
console.log(`target database host: ${new URL(url).hostname}`)
const existing = new Map(
  (await sql`select id, body, source_ids, status from public.kb_cards`).map((r) => [r.id as string, r as { body: string; source_ids: string[]; status: string }]),
)
const fileIds = new Set(cards.map((c) => c.id))
const added = cards.filter((c) => !existing.has(c.id)).map((c) => c.id)
const changed = cards.filter((c) => {
  const e = existing.get(c.id)
  return e && (e.body !== c.answer || e.source_ids.join() !== c.sources.join())
})
const removed = [...existing.keys()].filter((id) => !fileIds.has(id))
const losesApproval = [...changed.map((c) => c.id), ...removed].filter((id) => existing.get(id)?.status === 'approved')

console.log(`cards in ${file}: ${cards.length} · new ${added.length} · text or sources changed ${changed.length} · removed ${removed.length}`)
if (removed.length) console.log(`  removed: ${removed.join(', ')}`)
if (losesApproval.length) console.log(`  approved cards that would go back to draft or be removed: ${losesApproval.join(', ')}`)
if (!process.argv.includes('--yes')) {
  console.log('\nDry run. Re-run with --yes to load.')
  process.exit(0)
}

await sql.transaction([
  ...removed.map((id) => sql`delete from public.kb_cards where id = ${id}`),
  ...cards.map(
    (c) => sql`insert into public.kb_cards (id, topic, asks, body, source_ids)
               values (${c.id}, ${c.topic}, ${c.asks}, ${c.answer}, ${c.sources})
               on conflict (id) do update set topic = excluded.topic, asks = excluded.asks,
                 body = excluded.body, source_ids = excluded.source_ids`,
  ),
  sql`select app.kb_cards_resync()`,
])
const [counts] = await sql`select count(*)::int as cards, count(*) filter (where status = 'approved')::int as approved from public.kb_cards`
console.log('loaded:', counts)
