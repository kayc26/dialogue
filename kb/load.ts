// Load kb/out/passages.json into public.kb_chunks (full refresh, one transaction).
//
//   npm run kb:load -- --yes
//
// Reads DATABASE_URL from .env.local (written by `neon init`, git-ignored). The table
// is admin-written only (ADR-0011): signed-in members can read it through the Data
// API, nobody can write it there, so loading needs the owner connection string. The
// script prints only the database host, never the connection string.
//
// Without --yes it shows what it would do and exits.
//
// Needs migration 0003 (source label 'book', year, diabetes_type, kb_cards). After the
// load it re-syncs every topic card's source hash (app.kb_cards_resync), so an
// approved card whose source passages changed or vanished goes back to draft
// (ADR-0013 iteration 6) and the sponsor sees it again.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import type { BuiltPassage } from './build.ts'
import { checkTopicMap } from '../src/lib/chat/topics.ts'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run kb:load` (it reads .env.local).')
  process.exit(2)
}
const host = new URL(url).hostname
const { snapshotDate, passages } = JSON.parse(readFileSync(join(here, 'out', 'passages.json'), 'utf8')) as {
  snapshotDate: string
  passages: BuiltPassage[]
}
if (passages.some((p) => p.needsReview)) {
  console.error('passages.json contains passages marked needsReview; rebuild with kb/build.ts.')
  process.exit(1)
}
// The topic map (ADR-0018) names passages by id and book chapters by number range. A
// build it no longer fits would quietly shrink sections in production, so refuse it.
// Fix the map in src/lib/chat/topics.ts first; push it in the same sitting as the load,
// since the live site routes with whatever map it was deployed with.
const mapProblems = checkTopicMap(passages.map((p) => ({ id: p.id, source_label: p.sourceLabel, section: p.section })))
if (mapProblems.length) {
  console.error(`passages.json no longer fits the topic map in src/lib/chat/topics.ts (ADR-0018):\n  ${mapProblems.join('\n  ')}`)
  console.error('Update the map, then load.')
  process.exit(1)
}

console.log(`target database host: ${host}`)
console.log(`passages to load:     ${passages.length} (snapshot ${snapshotDate})`)
if (!process.argv.includes('--yes')) {
  console.log('\nDry run. This REPLACES every row in public.kb_chunks. Re-run with --yes to load.')
  process.exit(0)
}

const sql = neon(url)
const approvedIds = async () => (await sql`select id from public.kb_cards where status = 'approved'`).map((r) => r.id as string)
const before = await approvedIds()
await sql.transaction([
  sql`delete from public.kb_chunks`,
  ...passages.map(
    (p) => sql`insert into public.kb_chunks (id, doc_title, source_label, section, body, tags, snapshot_date, year, diabetes_type)
               values (${p.id}, ${p.docTitle}, ${p.sourceLabel}, ${p.section}, ${p.body}, ${p.tags}, ${snapshotDate}, ${p.year}, ${p.diabetesType})`,
  ),
  sql`select app.kb_cards_resync()`, // same transaction: no moment with new passages under stale approvals
])
const after = new Set(await approvedIds())
const demoted = before.filter((id) => !after.has(id))
if (demoted.length) console.log(`back to draft (their source passages changed): ${demoted.join(', ')}`)

const rows = await sql`
  select count(*)::int as total,
         count(*) filter (where 'dose_related' = any(tags))::int as dose_related,
         count(*) filter (where 'urgent' = any(tags))::int as urgent,
         count(distinct doc_title)::int as documents
  from public.kb_chunks`
console.log('loaded:', rows[0])
