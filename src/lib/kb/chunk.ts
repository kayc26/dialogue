// Split extracted knowledge-base text into short passages (ADR-0005 iteration 6).
//
// Input is `pdftotext` output (designed InDesign/Illustrator layouts) or Markdown
// (the team FAQ). The one dangerous failure is an infographic whose boxes come out in
// the wrong order: the type 1 guide's Rule of 15 graphic extracts with its steps
// scrambled among "circle-1..6" labels. A scrambled emergency procedure must never be
// served, so such passages are marked `needsReview` and the loader leaves them out
// until a person fixes them.

import { tagPassage, type KbTag } from './tags.ts'

/** Authority rank (ADR-0013, QST-KB-BOOK-ROLE: A): 'ADA' is the authority on numbers;
 *  'book' explains and gives examples, is never shown word for word, and never stands
 *  alone behind a number; 'care_team' is the clinic's own FAQ (held out for now). */
export type SourceLabel = 'ADA' | 'care_team' | 'book'

export interface SourceDoc {
  id: string // stable slug, e.g. "ada-t2-guide"
  title: string
  sourceLabel: SourceLabel
  text: string
}

export interface Passage {
  id: string
  docTitle: string
  sourceLabel: SourceLabel
  section: string | null
  body: string
  tags: KbTag[]
  needsReview: boolean
  reviewReason: string | null
}

const INVISIBLE = /[​-‏‪-‮⁦-⁩ֶ﻿]/g
const FOOTER = /^(?:\d{1,3}\s*\|\s*American Diabetes Association®?|American Diabetes Association®?\s*\|\s*\d{1,3})$/i
const PAGE_NUMBER = /^\d{1,3}$/
const BULLET = /^(?:[•▪›‣◦·\-–]|\d+[.)])\s*/
const INFOGRAPHIC_LABEL = /\bcircle-\d+\b/i

/** A page's running header, as the book extracts: a lone "|" line, then the chapter
 *  name in capitals ("TYING IT ALL TOGETHER"). Kept, it would read as a new section
 *  heading on every page: the stale-heading failure of TD-5. */
const RUNNING_HEADER = /^[A-Z][A-Z0-9 &’',:-]{1,60}$/
const PIPE = /^\|$/

/** Remove layout noise that carries no meaning: invisible marks, footers, page numbers,
 *  and running page headers. */
export function cleanLines(text: string): string[] {
  const lines = text
    .replace(/\f/g, '\n')
    .replace(/\t/g, ' ')
    .replace(INVISIBLE, '')
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .filter((l) => !FOOTER.test(l) && !PAGE_NUMBER.test(l))
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!PIPE.test(lines[i])) {
      out.push(lines[i])
      continue
    }
    // Drop the pipe and the header line after it (skipping blank lines between).
    let j = i + 1
    while (j < lines.length && lines[j] === '') j++
    if (j < lines.length && RUNNING_HEADER.test(lines[j])) i = j
  }
  return out
}

interface Para {
  lines: string[]
  text: string
}

/** Group lines into paragraphs; join soft-wrapped lines, keep bullets on their own line. */
export function toParagraphs(lines: string[]): Para[] {
  const paras: Para[] = []
  let cur: string[] = []
  const flush = () => {
    if (cur.length === 0) return
    const out: string[] = []
    for (const line of cur) {
      const prev = out[out.length - 1]
      if (prev !== undefined && !BULLET.test(line) && !/[:]$/.test(prev) && !line.startsWith('#')) {
        out[out.length - 1] = `${prev} ${line}`
      } else {
        out.push(line)
      }
    }
    paras.push({ lines: cur, text: out.join('\n') })
    cur = []
  }
  for (const line of lines) {
    if (line === '') flush()
    else cur.push(line)
  }
  flush()
  return paras
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

export function isHeading(p: Para): boolean {
  if (p.lines.length !== 1) return false
  const t = p.lines[0]
  if (t.startsWith('#')) return true
  if (BULLET.test(t) || t.length > 90 || words(t) > 14) return false
  if (!/^[A-Z“"]/.test(t)) return false
  return !/[.,;:]$/.test(t) // a question mark is fine: FAQ-style headings
}

/** Infographic detection: labels like "circle-3", or many short scattered lines. */
export function infographicReason(lines: string[]): string | null {
  if (lines.some((l) => INFOGRAPHIC_LABEL.test(l))) return 'infographic labels (circle-N) in extracted text'
  if (lines.length >= 6) {
    const short = lines.filter((l) => words(l) <= 3 && !BULLET.test(l)).length
    if (short / lines.length > 0.6) return 'mostly 1–3 word lines: likely a graphic extracted out of order'
  }
  return null
}

/**
 * Table cells extract as stand-alone scraps ("80–130 mg/dL before meals",
 * "= Triglycerides"). Without their row/column labels they mislead (a target range
 * that no longer says "target"), so they're skipped like infographics.
 */
export const MIN_PASSAGE_WORDS = 8
export function fragmentReason(text: string): string | null {
  return words(text) < MIN_PASSAGE_WORDS ? `layout fragment (under ${MIN_PASSAGE_WORDS} words), likely a table cell` : null
}

export function chunkDoc(doc: SourceDoc, maxWords = 180): Passage[] {
  const paras = toParagraphs(cleanLines(doc.text))
  const out: Passage[] = []
  let section: string | null = null
  let body: string[] = []
  let raw: string[] = []

  const flush = () => {
    if (body.length === 0) return
    const text = body.join('\n\n')
    const reason = infographicReason(raw) ?? fragmentReason(text)
    out.push({
      id: `${doc.id}-${String(out.length + 1).padStart(3, '0')}`,
      docTitle: doc.title,
      sourceLabel: doc.sourceLabel,
      section,
      body: text,
      tags: tagPassage(`${section ?? ''}\n${text}`),
      needsReview: reason !== null,
      reviewReason: reason,
    })
    body = []
    raw = []
  }

  for (const p of paras) {
    if (isHeading(p)) {
      flush()
      section = p.lines[0].replace(/^#+\s*/, '')
      continue
    }
    // A scrap paragraph (a table cell) would otherwise merge into the next prose
    // paragraph and still mislead, so it becomes its own skipped passage.
    if (words(p.text) < MIN_PASSAGE_WORDS - 1 && !/:$/.test(p.text) && !BULLET.test(p.lines[0])) {
      out.push({
        id: `${doc.id}-${String(out.length + 1).padStart(3, '0')}`,
        docTitle: doc.title, sourceLabel: doc.sourceLabel, section, body: p.text,
        tags: tagPassage(p.text), needsReview: true,
        reviewReason: 'layout fragment: a short scrap between paragraphs, likely a table cell',
      })
      continue
    }
    if (body.length > 0 && words(body.join(' ')) + words(p.text) > maxWords) flush()
    body.push(p.text)
    raw.push(...p.lines)
  }
  flush()
  return out
}
