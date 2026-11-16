// Knowledge-base splitting and tagging. Example sentences are paraphrases written for
// these tests; no ADA text is committed (it is copyrighted; ADR-0005).

import { describe, expect, it } from 'vitest'
import { tagPassage } from './tags.ts'
import { chunkDoc, cleanLines, infographicReason } from './chunk.ts'

describe('dose tagging (the corpus filter the dose guard relies on)', () => {
  // QST-DIAB-DOSE-GUARD: D shows dose_related passages verbatim only. A missed tag
  // puts dose arithmetic into the answer model's context, so these must all tag.
  it.each([
    'If your correction factor is 50 and you are at 250, take 2 units.',
    'Take correction insulin if you have not taken insulin in the last 4 hours.',
    'When you are sick you may need to adjust the dose of your diabetes medicines.',
    'Your insulin-to-carb ratio tells you how much rapid-acting insulin to take for a meal.',
    'Some clinics use a sliding scale for mealtime insulin.',
    'Adjust food or medication when you are active.',
    'A pump delivers a basal rate all day and a bolus at meals.',
  ])('tags as dose_related: %s', (text) => {
    expect(tagPassage(text)).toContain('dose_related')
  })

  it('does not tag insulin timing as a dose (ADR-0005: timing is medication, not dose)', () => {
    const tags = tagPassage('Many rapid-acting insulins are taken 10 to 15 minutes before eating.')
    expect(tags).toContain('medication')
    expect(tags).not.toContain('dose_related')
  })

  it('leaves ordinary nutrition advice untagged', () => {
    expect(tagPassage('Fill half your plate with non-starchy vegetables like broccoli.')).toEqual([])
  })

  it('tags hypoglycemia treatment as urgent', () => {
    expect(tagPassage('To treat low blood glucose, use the Rule of 15.')).toContain('urgent')
  })
})

describe('splitting extracted PDF text', () => {
  it('drops page footers and bare page numbers', () => {
    const lines = cleanLines('Some text\n8 | American Diabetes Association®\nAmerican Diabetes Association® | 9\n12\nMore text')
    expect(lines).toEqual(['Some text', 'More text'])
  })

  it("drops the book's running page header, so it can't become every page's section heading (TD-5's failure)", () => {
    // Shaped like Bright Spots & Landmines as pdftotext extracts it: page number, a
    // lone "|", then the chapter name in capitals, between two halves of one sentence.
    // (The first half-sentence itself still reads as a heading: TD-6, page-break headings.)
    const text = 'Writing about it has taught me a lot, and I still have hard days with my blood sugar.\n\n214\n\n|\n\nTYING IT ALL TOGETHER\n\nThe default attitude is usually negative, anxious, and self-blaming.'
    const doc = chunkDoc({ id: 'book', title: 'Book', sourceLabel: 'book', text })
    expect(doc.map((p) => p.section)).not.toContain('TYING IT ALL TOGETHER')
    expect(doc.map((p) => p.body).join(' ')).not.toMatch(/TYING IT ALL TOGETHER|\|/)
    expect(doc).toHaveLength(1) // one passage: the header no longer splits it
  })

  it('attaches each passage to the heading above it and joins wrapped lines', () => {
    const doc = chunkDoc({
      id: 'demo',
      title: 'Demo',
      sourceLabel: 'ADA',
      text: 'What is a snack?\n\nA snack is a small amount of food\nbetween meals.\n\nHow big should it be?\n\nAbout 15 grams of carbs.',
    })
    expect(doc.map((p) => [p.section, p.body])).toEqual([
      ['What is a snack?', 'A snack is a small amount of food between meals.'],
      ['How big should it be?', 'About 15 grams of carbs.'],
    ])
  })

  it('keeps bullets on their own lines', () => {
    const [p] = chunkDoc({ id: 'd', title: 'D', sourceLabel: 'ADA', text: 'Try these:\n• Apples\n• Pears\nfrom the store' })
    expect(p.body).toBe('Try these:\n• Apples\n• Pears from the store')
  })

  it('caps passage length so excerpts stay short enough to read aloud', () => {
    const para = Array.from({ length: 60 }, () => 'word').join(' ')
    const text = Array.from({ length: 6 }, () => para).join('\n\n')
    const passages = chunkDoc({ id: 'd', title: 'D', sourceLabel: 'ADA', text }, 180)
    expect(passages.length).toBeGreaterThan(1)
    for (const p of passages) expect(p.body.split(/\s+/).length).toBeLessThanOrEqual(180)
  })
})

describe('Regression tests', () => {
  it('holds back an infographic whose steps extract out of order (scrambled Rule of 15)', () => {
    // Bug class found 2026-11-14: the type 1 guide's Rule of 15 graphic extracted as
    // "Wait 15 minutes" / "circle-2" / "Repeat as needed until" in the wrong order.
    // Served as text, that is a scrambled emergency procedure. It must be flagged and
    // left out of the loaded corpus until a person fixes it.
    const scrambled = ['Repeat as needed until', 'your glucose is', 'above 70', 'circle-6', 'circle-1', 'Wait 15 minutes', 'circle-2']
    expect(infographicReason(scrambled)).not.toBeNull()
    const [p] = chunkDoc({ id: 'd', title: 'D', sourceLabel: 'ADA', text: scrambled.join('\n') })
    expect(p.needsReview).toBe(true)
  })

  it('skips table-cell scraps that lose their meaning out of the table', () => {
    // Found 2026-11-14 in the type 2 guide's targets table: "80–130 mg/dL before
    // meals" extracted as its own passage, a target range that no longer says
    // "target". Served alone, it reads as a statement about the patient.
    const passages = chunkDoc({
      id: 'd', title: 'D', sourceLabel: 'ADA',
      text: 'My Targets\n\n80–130 mg/dL before meals\n\nLow blood glucose is when your glucose drops below 70 and you may feel shaky or sweaty.',
    })
    expect(passages.find((p) => p.body.startsWith('80–130'))?.needsReview).toBe(true)
    expect(passages.find((p) => p.body.startsWith('Low blood'))?.needsReview).toBe(false)
  })

  it('does not flag an ordinary bulleted list as an infographic', () => {
    const list = ['Common symptoms:', '• Shakiness', '• Sweating', '• Hunger', '• Dizziness', '• Confusion']
    expect(infographicReason(list)).toBeNull()
  })
})
