// Build the knowledge-base passages from the team's source documents.
//
//   node kb/build.ts --kb-dir "<path to the team Drive knowledgebase folder>"
//   (or set KB_DIR). Requires poppler's `pdftotext` (brew install poppler).
//
// Reads kb/manifest.json, extracts each document, splits it into passages, tags them
// (dose_related / medication / urgent), and writes git-ignored output:
//   kb/out/passages.json   what kb/load.ts loads (infographic passages and table scraps already removed)
//   kb/out/review.md       for a human: every dose_related passage to check, plus the
//                          infographic passages and table scraps that were skipped
// ADA text is copyrighted: nothing this script writes is committed (ADR-0005).

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chunkDoc, type Passage } from '../src/lib/kb/chunk.ts'

interface ManifestDoc { id: string; file: string; dir: 'kb' | 'local'; title: string; sourceLabel: 'ADA' | 'care_team' }
interface Manifest { snapshotDate: string; documents: ManifestDoc[] }

const here = dirname(fileURLToPath(import.meta.url))
const argIdx = process.argv.indexOf('--kb-dir')
const kbDir = argIdx > 0 ? process.argv[argIdx + 1] : process.env.KB_DIR
if (!kbDir) {
  console.error('Usage: node kb/build.ts --kb-dir "<team Drive knowledgebase folder>"  (or set KB_DIR)')
  process.exit(2)
}
const localDir = join(here, 'local-sources')
const outDir = join(here, 'out')
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')) as Manifest

function readSource(d: ManifestDoc): string {
  const path = join(d.dir === 'kb' ? kbDir! : localDir, d.file)
  if (d.file.endsWith('.pdf')) return execFileSync('pdftotext', [path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return readFileSync(path, 'utf8')
}

const kept: Passage[] = []
const skipped: Passage[] = []
for (const d of manifest.documents) {
  const passages = chunkDoc({ id: d.id, title: d.title, sourceLabel: d.sourceLabel, text: readSource(d) })
  // Kay, 2026-11-14: "you can skip infographic". Out-of-order graphics, and table scraps that lose their meaning, are dropped,
  // not repaired.
  for (const p of passages) (p.needsReview ? skipped : kept).push(p)
  console.log(`${d.id.padEnd(20)} ${String(passages.length).padStart(4)} passages`)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'passages.json'), JSON.stringify({ snapshotDate: manifest.snapshotDate, passages: kept }, null, 2))

const dose = kept.filter((p) => p.tags.includes('dose_related'))
const block = (p: Passage) => `### ${p.id} (${p.docTitle})\n*Section*: ${p.section ?? '(none)'} · *Tags*: ${p.tags.join(', ')}\n\n${p.body}\n`
writeFileSync(
  join(outDir, 'review.md'),
  [
    `# Knowledge-base review (${manifest.snapshotDate})`,
    '',
    `Kept ${kept.length} passages; skipped ${skipped.length} passages (infographics and table scraps).`,
    '',
    `## Dose-related passages to check (${dose.length})`,
    '',
    'Each is shown to patients only word for word, never rewritten by the model (ADR-0005, QST-DIAB-DOSE-GUARD: D).',
    'Check that nothing here should be removed outright, and that nothing dose-related elsewhere was missed.',
    '',
    ...dose.map(block),
    `## Skipped passages (infographics and table scraps) (${skipped.length})`,
    '',
    ...skipped.map((p) => `${block(p)}\n*Why skipped*: ${p.reviewReason}\n`),
  ].join('\n'),
)

const count = (t: string) => kept.filter((p) => p.tags.includes(t as never)).length
console.log(`\nkept ${kept.length} · skipped (infographic or table scrap) ${skipped.length} · dose_related ${count('dose_related')} · medication ${count('medication')} · urgent ${count('urgent')}`)
console.log(`wrote ${join('kb', 'out', 'passages.json')} and ${join('kb', 'out', 'review.md')}`)
