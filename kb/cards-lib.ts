// Shared by kb/cards-check.ts and kb/cards-load.ts: the checks every topic card must
// pass before the sponsor reads it, and again before it is loaded (ADR-0013).

import { readFileSync } from 'node:fs'
import { checkAnswer } from '../src/lib/chat/guard.ts'

export interface Passage { id: string; docTitle: string; sourceLabel: 'ADA' | 'care_team' | 'book'; section: string | null; body: string; tags: string[] }
export interface DraftCard { id: string; topic: string; asks: string[]; answer: string; sources: string[]; review_notes?: string[] }

export function readPassages(path = 'kb/out/passages.json'): Map<string, Passage> {
  const { passages } = JSON.parse(readFileSync(path, 'utf8')) as { passages: Passage[] }
  return new Map(passages.map((p) => [p.id, p]))
}

export function readCards(path: string): { status?: string; cards: DraftCard[] } {
  return JSON.parse(readFileSync(path, 'utf8')) as { status?: string; cards: DraftCard[] }
}

/** Syllables by vowel groups, with a silent final e; close enough for a grade level. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups?.length ?? 1)
}

/** Flesch-Kincaid grade level (Kay's target: 6th–8th grade). */
export function gradeLevel(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length)
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w))
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  return 0.39 * (words.length / sentences) + 11.8 * (syl / Math.max(1, words.length)) - 15.59
}

export interface CardCheck {
  problems: string[] // any problem blocks the card
  cited: Passage[]
  doseTagged: string[] // for the sponsor's closer reading (QST-KB-DOSE-CARDS: B)
  grade: number
  words: number
}

/**
 * 1. id shape, no duplicates; 2. every source exists; 3. the assistant's answer guard:
 * no dose advice, and every number in a cited ADA passage (book numbers don't count,
 * QST-KB-BOOK-ROLE: A).
 */
export function checkCard(c: DraftCard, byId: Map<string, Passage>, seen: Set<string>): CardCheck {
  const problems: string[] = []
  if (!/^card-[a-z0-9-]+$/.test(c.id)) problems.push('bad id')
  if (seen.has(c.id)) problems.push('duplicate id')
  seen.add(c.id)
  if (c.sources.length === 0) problems.push('no sources')
  const missing = c.sources.filter((s) => !byId.has(s))
  if (missing.length) problems.push(`missing sources: ${missing.join(',')}`)
  const cited = c.sources.filter((s) => byId.has(s)).map((s) => byId.get(s)!)
  const verdict = checkAnswer(
    `${c.answer} ${c.sources.map((s) => `[kb:${s}]`).join(' ')}`,
    cited.map((p) => ({ id: p.id, body: p.body, source_label: p.sourceLabel })),
    '',
  )
  if (!verdict.ok) problems.push(`guard: ${verdict.reason}`)
  return {
    problems,
    cited,
    doseTagged: cited.filter((p) => p.tags.includes('dose_related')).map((p) => p.id),
    grade: gradeLevel(c.answer),
    words: c.answer.split(/\s+/).filter(Boolean).length,
  }
}
