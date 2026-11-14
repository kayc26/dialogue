// Combining triage layers, retrieval, and the answer guard. Passages here are
// paraphrases written for the tests (ADA text is never committed, ADR-0005).

import { describe, expect, it } from 'vitest'
import { combineTriage, parseClassifier } from './combine'
import { buildIndex, type KbPassage } from './retrieve'
import { checkAnswer, stripCitations } from './guard'
import { triageRules, type Profile } from './triage'

const NONE: Profile = { history_of_dka: false, pregnant: false, uses_pump: false }

describe('combining rules and classifier (ADR-0006)', () => {
  const cls = (tier: string, happening_now: boolean, dose_intent = false) =>
    parseClassifier(JSON.stringify({ tier, happening_now, dose_intent, reason: 'x' }))

  it('softens a rules red flag by one step for a question about symptoms', () => {
    const rules = triageRules('what should I do if my sugar is 380', NONE)
    expect(rules.tier).toBe('urgent')
    const c = combineTriage(rules, cls('none', false))
    expect(c.tier).toBe('checkin') // help still shown inline, never "none"
    expect(c.softened).toBe(true)
  })

  it('never softens an emergency', () => {
    const rules = triageRules("my husband won't wake up", NONE)
    expect(combineTriage(rules, cls('none', false)).tier).toBe('emergency')
  })

  it('lets the classifier raise what the rules missed (indirect wording)', () => {
    const rules = triageRules("I'm just not right today, everything is spinning", NONE)
    expect(combineTriage(rules, cls('urgent', true)).tier).toBe('urgent')
  })

  it('treats a failed or garbled classifier as at least check-in', () => {
    const rules = triageRules('What fruit can I eat?', NONE)
    expect(rules.tier).toBe('none')
    expect(combineTriage(rules, null).tier).toBe('checkin')
    expect(parseClassifier('sorry, I cannot help')).toBeNull()
    expect(parseClassifier('{"tier":"maybe","happening_now":true}')).toBeNull()
  })

  it('keeps dose intent if either layer sees it', () => {
    const rules = triageRules('my numbers are up, what amount is right for tonight', NONE)
    expect(combineTriage(rules, cls('none', true, true)).doseIntent).toBe(true)
  })
})

const P = (id: string, section: string, body: string, tags: string[] = []): KbPassage => ({
  id, doc_title: 'Doc', source_label: 'ADA', section, body, tags,
})
const corpus = [
  P('fruit', 'What fruit can I eat?', 'Berries, apples and pears tend to raise blood glucose less than melon or bananas. Keep fruit to one cup.'),
  P('hypo', 'Treating hypoglycemia', 'To treat hypoglycemia below 70 mg/dL, use the Rule of 15: eat 15 grams of fast-acting carbohydrate and recheck after 15 minutes.', ['urgent']),
  P('plate', 'Plan your plate', 'Fill half the plate with non-starchy vegetables, a quarter with protein, a quarter with quality carbohydrate.'),
  P('drinks', 'Beverages', 'Water is the best choice. Unsweetened tea and black coffee are fine. Limit soda and juice.'),
]
const index = buildIndex(corpus)

describe('retrieval', () => {
  it('finds the passage that answers the question', () => {
    expect(index.search('What fruit can I eat?')[0].passage.id).toBe('fruit')
  })

  it('understands everyday words: "my sugar is low" finds the hypoglycemia passage', () => {
    expect(index.search('what do I do when my sugar is low')[0].passage.id).toBe('hypo')
  })

  it('maps "drink" to the beverages passage', () => {
    expect(index.search('what can I drink')[0].passage.id).toBe('drinks')
  })

  it('returns nothing for a question the corpus does not cover', () => {
    expect(index.search('how do I renew my passport')).toEqual([])
  })
})

describe('answer guard (QST-DIAB-DOSE-GUARD: D, output gate)', () => {
  const shown = corpus.map((p) => ({ id: p.id, body: p.body }))

  it('passes a grounded, cited answer', () => {
    const r = checkAnswer('Berries and apples raise glucose less than bananas. Keep fruit to one cup. [kb:fruit]', shown, 'what fruit?')
    expect(r).toEqual({ ok: true, citations: ['fruit'] })
  })

  it.each([
    'Take 4 units of rapid-acting insulin before the meal. [kb:fruit]',
    'You could increase your basal insulin a little. [kb:fruit]',
    'Skip your insulin if you are not eating. [kb:fruit]',
    'Use 1 unit for every 50 mg/dL above target. [kb:hypo]',
  ])('blocks dose advice: %s', (a) => {
    const r = checkAnswer(a, shown, 'what should I do')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/^dose_advice/)
  })

  it('blocks a drifted number (15 grams becoming 20 grams)', () => {
    const r = checkAnswer('Eat 20 grams of fast-acting carbohydrate and recheck after 15 minutes. [kb:hypo]', shown, 'low')
    expect(r).toEqual({ ok: false, reason: 'unsupported_number:20' })
  })

  it("allows a number the user gave (echoing their reading)", () => {
    const r = checkAnswer('You said your glucose is 65, which is below 70. Use the Rule of 15. [kb:hypo]', shown, 'my sugar is 65')
    expect(r.ok).toBe(true)
  })

  it('blocks an answer with no citation, or citing a passage it was not shown', () => {
    expect(checkAnswer('Water is the best choice.', shown, 'drinks')).toEqual({ ok: false, reason: 'no_citation' })
    expect(checkAnswer('Water is best. [kb:secret]', shown, 'drinks')).toEqual({ ok: false, reason: 'unknown_citation:secret' })
  })

  it('removes citation markers from what the patient reads', () => {
    expect(stripCitations('Water is the best choice [kb:drinks].')).toBe('Water is the best choice.')
  })
})
