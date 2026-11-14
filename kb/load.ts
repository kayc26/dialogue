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

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import type { Passage } from '../src/lib/kb/chunk.ts'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run kb:load` (it reads .env.local).')
  process.exit(2)
}
const host = new URL(url).hostname
const { snapshotDate, passages } = JSON.parse(readFileSync(join(here, 'out', 'passages.json'), 'utf8')) as {
  snapshotDate: string
  passages: Passage[]
}
if (passages.some((p) => p.needsReview)) {
  console.error('passages.json contains passages marked needsReview; rebuild with kb/build.ts.')
  process.exit(1)
}

console.log(`target database host: ${host}`)
console.log(`passages to load:     ${passages.length} (snapshot ${snapshotDate})`)
if (!process.argv.includes('--yes')) {
  console.log('\nDry run. This REPLACES every row in public.kb_chunks. Re-run with --yes to load.')
  process.exit(0)
}

const sql = neon(url)
await sql.transaction([
  sql`delete from public.kb_chunks`,
  ...passages.map(
    (p) => sql`insert into public.kb_chunks (id, doc_title, source_label, section, body, tags, snapshot_date)
               values (${p.id}, ${p.docTitle}, ${p.sourceLabel}, ${p.section}, ${p.body}, ${p.tags}, ${snapshotDate})`,
  ),
])

const rows = await sql`
  select count(*)::int as total,
         count(*) filter (where 'dose_related' = any(tags))::int as dose_related,
         count(*) filter (where 'urgent' = any(tags))::int as urgent,
         count(distinct doc_title)::int as documents
  from public.kb_chunks`
console.log('loaded:', rows[0])
