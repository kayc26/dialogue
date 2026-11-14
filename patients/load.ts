// Load patients/fixtures/*.json into public.patients + public.glucose_readings.
//
//   npm run patients:load -- --yes
//
// Replaces only the demo patients (ids starting "demo-"); other rows (e.g. the RLS
// test fixture on the rls-dev branch) are untouched. Readings cascade with their
// patient. Uses the owner DATABASE_URL from .env.local (tables are admin-written,
// ADR-0011) and prints only the host. Dry run unless --yes.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

interface Reading { minutes_before_load: number; value_mgdl: number; source: 'cgm' | 'fingerstick' }
interface Fixture {
  id: string; display_name: string; age: number; diabetes_type: 'type1' | 'type2'; uses_cgm: boolean
  regimen: unknown; flags: unknown; clinic_history: unknown; data_source: unknown; readings: Reading[]
}

const here = dirname(fileURLToPath(import.meta.url))
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run patients:load` (it reads .env.local).')
  process.exit(2)
}
const dir = join(here, 'fixtures')
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture)
if (fixtures.some((f) => !f.id.startsWith('demo-'))) throw new Error('fixture ids must start with "demo-"')

const total = fixtures.reduce((n, f) => n + f.readings.length, 0)
console.log(`target database host: ${new URL(url).hostname}`)
console.log(`demo patients:        ${fixtures.length} (${fixtures.map((f) => f.id).join(', ')})`)
console.log(`glucose readings:     ${total}`)
if (!process.argv.includes('--yes')) {
  console.log('\nDry run. This REPLACES all demo-* patients and their readings. Re-run with --yes to load.')
  process.exit(0)
}

const sql = neon(url)
const BATCH = 500
const statements = [sql`delete from public.patients where id like 'demo-%'`]
for (const f of fixtures) {
  statements.push(sql`
    insert into public.patients (id, display_name, age, diabetes_type, uses_cgm, regimen, flags, clinic_history, data_source)
    values (${f.id}, ${f.display_name}, ${f.age}, ${f.diabetes_type}, ${f.uses_cgm},
            ${JSON.stringify(f.regimen)}::jsonb, ${JSON.stringify(f.flags)}::jsonb,
            ${JSON.stringify(f.clinic_history)}::jsonb, ${JSON.stringify(f.data_source)}::jsonb)`)
  for (let i = 0; i < f.readings.length; i += BATCH) {
    const chunk = f.readings.slice(i, i + BATCH)
    statements.push(sql`
      insert into public.glucose_readings (patient_id, minutes_before_load, value_mgdl, source)
      select ${f.id}, m, v, s
      from unnest(${chunk.map((r) => r.minutes_before_load)}::int[],
                  ${chunk.map((r) => r.value_mgdl)}::numeric[],
                  ${chunk.map((r) => r.source)}::text[]) as t(m, v, s)`)
  }
}
await sql.transaction(statements)

const rows = await sql`
  select p.id, p.age, p.diabetes_type, count(g.id)::int as readings,
         min(g.value_mgdl)::float as min, max(g.value_mgdl)::float as max
  from public.patients p left join public.glucose_readings g on g.patient_id = p.id
  where p.id like 'demo-%' group by p.id, p.age, p.diabetes_type order by p.id`
console.table(rows)
