// Read-only review of what testers did on the live site (KANBAN: "Read the testers'
// first conversations"; ADR-0018, ADR-0007). Prints, per member, sessions / turns /
// spend, then every turn with what the app logged: tier, retrieval path, topics, guard,
// monitor, plan, and the message and reply (trimmed).
//
//   node --env-file=.env.local scripts/ephemeral/2026-11-19-tester-sessions-review.ts [since=2026-11-17]
//
// SELECT only. Uses the owner connection (DATABASE_URL, .env.local) because the review
// spans every tester; prints the database host, never the connection string. Output goes
// to the terminal only: tester conversations must not be written into the repo.

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set; run with --env-file=.env.local')
  process.exit(2)
}
const since = process.argv[2] ?? '2026-11-17'
const sql = neon(url)
console.log(`host: ${new URL(url).hostname}   since: ${since}\n`)

const trim = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

const members = await sql`
  select m.user_id, m.role, m.display_name,
         (select count(*) from public.sessions s where s.user_id = m.user_id and s.started_at >= ${since})::int as sessions,
         (select count(*) from public.messages x join public.sessions s on s.id = x.session_id
           where s.user_id = m.user_id and x.role = 'user' and x.created_at >= ${since})::int as turns,
         (select coalesce(sum(cost), 0) from public.llm_spend l where l.user_id = m.user_id)::float as spend_total,
         (select max(x.created_at) from public.messages x join public.sessions s on s.id = x.session_id where s.user_id = m.user_id) as last_msg
  from public.members m
  order by m.role, m.display_name`
console.log('== members')
for (const m of members) {
  console.log(`${String(m.role).padEnd(16)} ${String(m.display_name).padEnd(22)} sessions ${String(m.sessions).padStart(3)}  turns ${String(m.turns).padStart(4)}  spend $${Number(m.spend_total).toFixed(4)}  last ${m.last_msg ? new Date(m.last_msg as string).toISOString().slice(0, 16) : '-'}`)
}

const turns = await sql`
  select s.id as session_id, s.patient_id, m.display_name as who, m.role,
         u.turn, u.created_at, u.content as msg, a.content as reply,
         t.tier, t.source, t.criteria, t.detail
  from public.messages u
  join public.sessions s on s.id = u.session_id
  join public.members m on m.user_id = s.user_id
  left join public.messages a on a.session_id = u.session_id and a.turn = u.turn and a.role = 'assistant'
  left join public.triage_events t on t.session_id = u.session_id and t.turn = u.turn and t.source <> 'monitor'
  where u.role = 'user' and u.created_at >= ${since}
  order by u.created_at`
const monitors = await sql`
  select t.session_id, t.turn, t.tier, t.criteria, t.detail
  from public.triage_events t join public.sessions s on s.id = t.session_id
  where t.source = 'monitor' and t.created_at >= ${since}`
const monKey = (s: string, n: number) => `${s}#${n}`
const monBy = new Map(monitors.map((r) => [monKey(r.session_id as string, r.turn as number), r]))

console.log(`\n== turns (${turns.length})`)
let lastSession = ''
for (const r of turns) {
  if (r.session_id !== lastSession) {
    lastSession = r.session_id as string
    console.log(`\n--- ${r.who} (${r.role}) · patient ${r.patient_id} · session ${String(r.session_id).slice(0, 8)}`)
  }
  const d = (r.detail ?? {}) as Record<string, unknown>
  const flags = [
    `tier=${r.tier ?? '?'}${r.source === 'rules' ? ' (classifier FAILED)' : ''}`,
    (r.criteria as string[] | null)?.length ? `criteria=${(r.criteria as string[]).join(',')}` : '',
    d.retrieval ? `retrieval=${d.retrieval}` : '',
    Array.isArray(d.topics) && d.topics.length ? `topics=${(d.topics as string[]).join('+')}` : '',
    d.guard ? `GUARD=${JSON.stringify(d.guard)}` : '',
    d.monitor && d.monitor !== 'none' ? `monitor=${d.monitor}` : '',
    d.monitor_verdict ? `verdict=${JSON.stringify(d.monitor_verdict)}` : '',
    d.dose_intent ? 'dose_intent' : '',
    d.plan ? `plan=${JSON.stringify(d.plan)}` : '',
    d.social ? `social=${d.social}` : '',
    d.language && d.language !== 'en' ? `lang=${d.language}` : '',
    `calls=${d.model_calls ?? '?'}`,
  ].filter(Boolean)
  const mon = monBy.get(monKey(r.session_id as string, r.turn as number))
  console.log(`\n[${new Date(r.created_at as string).toISOString().slice(5, 16)} t${r.turn}] ${flags.join('  ')}`)
  if (mon) console.log(`   MONITOR(bg): tier=${mon.tier} ${(mon.criteria as string[]).join(',')} ${trim((mon.detail as { reason?: string }).reason, 160)}`)
  console.log(`   Q: ${trim(r.msg as string, 300)}`)
  console.log(`   A: ${trim(r.reply as string, 420)}`)
  if (d.blocked_draft) console.log(`   BLOCKED DRAFT: ${trim(d.blocked_draft as string, 300)}`)
}

// --- Outcome (2026-11-19, since 2026-11-17) ---
// 72 turns: 64 Kay (admin), 8 one tester (Colin, 11-17); 3 testers have no sessions.
// Findings: off-topic and rude messages get the flat "no information" card (4 of the
// tester's 8 turns); "The passages don't say…" leaks into answers; a monitor raise adds
// a second help banner instead of replacing the first; a monitor outage in a dose
// session isn't logged as such; urgent highs show a definitional ADA chunk (ADR-0021).
// The carb-amount false vetoes (11-17 03:35, 04:00 UTC) predate fix 56402d1; none since.
