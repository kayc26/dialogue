// Routing test (ADR-0018): does the classifier pick the right knowledge-base topics?
// Borrowed from kayc26/diabetes_chatbot's run_tests.py. Each question in
// kb/routing-questions.txt goes to the live classifier on its own (no earlier
// conversation), using the app's model, prompt and parser; nothing else runs.
// Cheap: one small classifier call per question.
//
// Run: npm run kb:eval-routing -- --yes   (dry run without --yes)
// Writes kb/out/eval-routing.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseClassifier } from '../src/lib/chat/combine'
import { openRouterModels, type CostMeter } from '../src/lib/chat/models'
import { TOPIC_NAMES } from '../src/lib/chat/topics'

const MAX_DOLLARS = 0.05
const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'kb/routing-questions.txt'
const tests = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [expected, ...q] = l.split('|')
    return { expected: expected.split(',').map((t) => t.trim()).filter((t) => t && t !== 'none'), question: q.join('|').trim() }
  })
const unknown = tests.flatMap((t) => t.expected.flatMap((e) => e.split('/').map((x) => x.trim()))).filter((t) => !(TOPIC_NAMES as string[]).includes(t))
if (unknown.length) throw new Error(`unknown topics in ${file}: ${[...new Set(unknown)].join(', ')}`)

const key = process.env.OPENROUTER_API_KEY ?? ''
console.log(`${tests.length} questions from ${file} · OpenRouter key: ${key ? 'set' : 'NOT SET (OPENROUTER_API_KEY)'} · stop above $${MAX_DOLLARS}`)
if (!process.argv.includes('--yes') || !key) {
  console.log('Dry run: no model calls. Re-run with --yes.')
  process.exit(0)
}

const meter: CostMeter = { dollars: 0, calls: 0 }
const models = openRouterModels(key, meter)
const lines: string[] = []
let passed = 0
let failedCalls = 0
for (const [i, t] of tests.entries()) {
  if (meter.dollars > MAX_DOLLARS) {
    console.log(`stopping: $${meter.dollars.toFixed(4)} spent`)
    break
  }
  const c = parseClassifier(await models.classify(t.question, []))
  if (!c) failedCalls++
  const picked = c?.topics ?? []
  const ok = c !== null && (t.expected.length ? t.expected.every((e) => e.split('/').some((alt) => (picked as string[]).includes(alt.trim()))) : picked.length === 0)
  if (ok) passed++
  lines.push(`| ${i + 1} | ${ok ? 'PASS' : '**FAIL**'} | ${t.question} | ${t.expected.join(', ') || 'none'} | ${c ? picked.join(', ') || 'none' : 'no reply'} | ${c?.tier ?? '-'} |`)
  process.stdout.write(ok ? '.' : 'F')
}
const summary = `Routing passed ${passed}/${tests.length} (classifier unreadable: ${failedCalls}) · $${meter.dollars.toFixed(4)} over ${meter.calls} calls`
writeFileSync(
  'kb/out/eval-routing.md',
  `# Routing test (${new Date().toISOString().slice(0, 10)})\n\n**${summary}**\n\n| # | Result | Question | Expected | Picked | Tier |\n|---|---|---|---|---|---|\n${lines.join('\n')}\n`,
)
console.log(`\n${summary}\nwrote kb/out/eval-routing.md`)
