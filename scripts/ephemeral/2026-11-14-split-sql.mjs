// 2026-11-14-split-sql.mjs
// Context: the Neon MCP `run_sql_transaction` tool takes one statement per array
// entry (no multi-statement strings), so a migration file has to be split. Splitting
// on ";" by eye breaks inside $$ ... $$ function bodies, so this does it mechanically.
// It drops `begin;` / `commit;` (the tool wraps its own transaction) and comment-only
// chunks, and prints a JSON array of statements.
//
// Usage: node scripts/ephemeral/2026-11-14-split-sql.mjs db/migrations/0001_schema_and_rls.sql

import { readFileSync } from 'node:fs'

const src = readFileSync(process.argv[2], 'utf8')
const out = []
let buf = ''
let inDollar = false
let inLineComment = false
for (let i = 0; i < src.length; i++) {
  const c = src[i]
  const two = src.slice(i, i + 2)
  if (!inDollar && !inLineComment && two === '--') { inLineComment = true }
  if (inLineComment) { if (c === '\n') { inLineComment = false; buf += c } continue }
  if (two === '$$') { inDollar = !inDollar; buf += two; i++; continue }
  if (c === ';' && !inDollar) { out.push(buf.trim()); buf = ''; continue }
  buf += c
}
if (buf.trim()) out.push(buf.trim())

const stmts = out
  .map((s) => s.replace(/\n{2,}/g, '\n').trim())
  .filter((s) => s && !/^(begin|commit)$/i.test(s))
console.log(JSON.stringify(stmts))
console.error(`${stmts.length} statements`)

// Used 2026-11-14: split db/migrations/0001_schema_and_rls.sql into 63 statements,
// applied in one run_sql_transaction to branch rls-dev (br-curly-hall-be03h6ji), then,
// after the RLS suite passed 20/20, to production (br-winter-forest-beewzuyw).
// Outcome: both branches carry 9 tables, RLS on all, the same 16 policies.
// The JSON output is derived; regenerate it rather than committing it.
