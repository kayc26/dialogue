// Record the clinical sponsor's approval of topic cards (ADR-0013, QST-KB-REVIEW: A).
//
//   npm run kb:cards:approve -- --list
//   npm run kb:cards:approve -- --by "<approver's name>" card-a card-b ... [--yes]
//   npm run kb:cards:approve -- --revoke card-a ... [--yes]
//
// Only an approved card can reach a patient, and it is shown word for word. Approval
// names the approver and the time; the database sends a card back to draft if its
// text, sources, or source-passage text change afterwards (migration 0003). Source
// hashes are re-synced first, so an approval always covers the passages as they are now.
// There is no "approve all": each id is named, as the sponsor named it.
//
// Uses the owner DATABASE_URL from .env.local; prints only the host. Dry run unless --yes.

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run kb:cards:approve` (it reads .env.local).')
  process.exit(2)
}
const args = process.argv.slice(2)
const byIdx = args.indexOf('--by')
const by = byIdx >= 0 ? args[byIdx + 1] : undefined
const ids = args.filter((a, i) => !a.startsWith('--') && i !== byIdx + 1)
const revoke = args.includes('--revoke')
const yes = args.includes('--yes')

const sql = neon(url)
console.log(`target database host: ${new URL(url).hostname}`)

if (args.includes('--list') || ids.length === 0) {
  const rows = await sql`select id, status, approved_by, approved_at from public.kb_cards order by id`
  for (const r of rows) console.log(`${String(r.status).padEnd(9)} ${String(r.id).padEnd(28)} ${r.approved_by ?? ''} ${r.approved_at ? new Date(r.approved_at as string).toISOString().slice(0, 10) : ''}`)
  if (ids.length === 0 && !args.includes('--list')) console.log('\nName the card ids to approve (with --by "<name>") or to --revoke.')
  process.exit(0)
}
if (!revoke && !by?.trim()) {
  console.error('Approval needs the approver: --by "<name>".')
  process.exit(2)
}

const known = new Set((await sql`select id from public.kb_cards where id = any (${ids})`).map((r) => r.id as string))
const unknown = ids.filter((id) => !known.has(id))
if (unknown.length) {
  console.error(`No such card(s): ${unknown.join(', ')}. Nothing changed.`)
  process.exit(1)
}
console.log(`${revoke ? 'revoke' : `approve (by ${by})`}: ${ids.join(', ')}`)
if (!yes) {
  console.log('\nDry run. Re-run with --yes.')
  process.exit(0)
}

await sql.transaction(
  revoke
    ? [sql`update public.kb_cards set status = 'draft', approved_by = null, approved_at = null where id = any (${ids})`]
    : [
        sql`select app.kb_cards_resync()`,
        sql`update public.kb_cards set status = 'approved', approved_by = ${by!.trim()}, approved_at = now() where id = any (${ids})`,
      ],
)
const rows = await sql`select id, status, approved_by from public.kb_cards where id = any (${ids}) order by id`
for (const r of rows) console.log(`${String(r.status).padEnd(9)} ${r.id} ${r.approved_by ?? ''}`)
