// Combining triage layers, retrieval, and the answer guard. Passages here are
// paraphrases written for the tests (ADA text is never committed, ADR-0005).

import { describe, expect, it } from 'vitest'
import { combineTriage, parseClassifier } from './combine'
import { buildIndex, direction, type KbPassage } from './retrieve'
import { checkAnswer, citationsIn, stripCitations, trimBookNumbers } from './guard'
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

  describe("ranks the patient's own diabetes type first (ADR-0013, QST-KB-RAG-FIXES: B)", () => {
    // Shaped like the two ADA guides: the same topic in each, worded almost alike,
    // plus a topic only the type 1 guide covers.
    const typed = buildIndex([
      { ...P('t1-check', 'Checking your blood glucose', 'Check your blood glucose before meals and at bedtime, and before driving.'), diabetes_type: 'type1' },
      { ...P('t2-check', 'Checking your blood glucose', 'Check your blood glucose before meals and at bedtime, as your care team suggests.'), diabetes_type: 'type2' },
      { ...P('t1-ketones', 'Ketones', 'Check for ketones when your blood glucose is high or you feel sick.'), diabetes_type: 'type1' },
      { ...P('book-walk', 'Walking', 'A short walk after meals helps blood glucose.'), diabetes_type: 'any' },
    ])
    const q = 'when should I check my blood glucose?'
    it("a type 2 patient gets the type 2 guide's passage first, and a type 1 patient the type 1 guide's", () => {
      expect(typed.search(q, 2, { diabetesType: 'type2' })[0].passage.id).toBe('t2-check')
      expect(typed.search(q, 2, { diabetesType: 'type1' })[0].passage.id).toBe('t1-check')
    })
    it('the other type still answers what only it covers: ketones for a type 2 patient', () => {
      expect(typed.search('should I check for ketones?', 1, { diabetesType: 'type2' })[0].passage.id).toBe('t1-ketones')
    })
    it("the patient's own ADA guide moves ahead of an equally matching book passage, not just ahead of the other guide", () => {
      // Demoting the other type instead handed its first places to the book (59 → 80
      // of 133 questions for a type 2 patient); boosting the own type gave 59 → 40.
      const tie = buildIndex([
        { ...P('t2-walk', 'Activity', 'A short walk after meals helps blood glucose.'), diabetes_type: 'type2' },
        { ...P('book-walk', 'Activity', 'A short walk after meals helps blood glucose.'), source_label: 'book', diabetes_type: 'any' },
        { ...P('t1-other', 'Ketones', 'Check for ketones when sick.'), diabetes_type: 'type1' },
      ])
      expect(tie.search('walk after meals', 1, { diabetesType: 'type2' })[0].passage.id).toBe('t2-walk')
    })
    it("passages for any type, and searches with no patient type, aren't changed", () => {
      const walk = (o?: { diabetesType: 'type1' | 'type2' }) => typed.search('walk after meals', 1, o)[0].score
      expect(walk({ diabetesType: 'type2' })).toBe(walk())
    })
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

  describe('the book is never the authority on numbers (ADR-0013, QST-KB-BOOK-ROLE: A)', () => {
    // Shaped like the real sources: the book's author aims for a personal 70–140 mg/dL
    // range; the ADA guide gives the after-meal target older adults are taught.
    const mixed = [
      { id: 'ada-target', body: 'For most adults, blood glucose 1–2 hours after a meal should be under 180 mg/dL.', source_label: 'ADA' },
      { id: 'book-range', body: 'I aim to stay in the range of 70-140 mg/dl within 2-3 hours after eating.', source_label: 'book' },
    ]
    it("blocks the book's personal range even when an ADA passage is cited beside it", () => {
      const r = checkAnswer('Aim for 70 to 140 mg/dL after meals. [kb:ada-target] [kb:book-range]', mixed, 'what should my sugar be after eating?')
      expect(r).toEqual({ ok: false, reason: 'unsupported_number:70,140' })
    })
    it("passes ADA's number, with the book cited for the explanation", () => {
      const r = checkAnswer('After a meal, aim for under 180 mg/dL [kb:ada-target]. Many people find a walk after eating helps [kb:book-range].', mixed, 'after eating?')
      expect(r).toEqual({ ok: true, citations: ['ada-target', 'book-range'] })
    })
  })

  describe('trim, don\'t block, on a book number (ADR-0013, QST-KB-RAG-ROUND3: B)', () => {
    // Shaped like the third FAQ run: good ADA-backed answers lost over one sentence
    // carrying the book author's personal figure ("20 minutes", "after 2 pm").
    const mixed = [
      { id: 'ada-drinks', body: 'Water is the best choice. Unsweetened tea and coffee are fine. Limit soda, sweet tea, and juice.', source_label: 'ADA' },
      { id: 'book-coffee', body: 'I switch to decaf coffee after 2 pm so caffeine does not keep me up.', source_label: 'book' },
    ]
    it('drops only the sentence with the book number, and shows the rest when it still rests on ADA', () => {
      const a = 'Water is the best choice, and unsweetened tea or coffee is fine. [kb:ada-drinks] One writer switches to decaf after 2 pm. [kb:book-coffee] Limit soda, sweet tea, and juice. [kb:ada-drinks]'
      expect(checkAnswer(a, mixed, 'what can I drink?')).toEqual({ ok: false, reason: 'unsupported_number:2' })
      const t = trimBookNumbers(a, mixed, 'what can I drink?')
      expect(t?.dropped).toEqual(['One writer switches to decaf after 2 pm. [kb:book-coffee]'])
      expect(t?.text).toBe('Water is the best choice, and unsweetened tea or coffee is fine. [kb:ada-drinks] Limit soda, sweet tea, and juice. [kb:ada-drinks]')
      expect(t?.citations).toEqual(['ada-drinks'])
    })
    it('keeps blocking when what is left cites only the book (as decided: the rest must rest on ADA)', () => {
      // The third run's beverages draft cited only book passages, so it stays blocked.
      const a = 'Plain or sparkling water is a good choice. [kb:book-coffee] One writer switches to decaf after 2 pm. [kb:book-coffee]'
      expect(trimBookNumbers(a, mixed, 'what can I drink?')).toBeNull()
    })
    it('never trims an invented number or dose advice: those block the whole answer', () => {
      expect(trimBookNumbers('Drink 8 glasses of water a day. [kb:ada-drinks] Decaf after 2 pm helps. [kb:book-coffee]', mixed, 'drinks?')).toBeNull()
      expect(trimBookNumbers('Take 2 units with coffee. [kb:ada-drinks]', mixed, 'drinks?')).toBeNull()
    })
  })

  it('removes citation markers from what the patient reads', () => {
    expect(stripCitations('Water is the best choice [kb:drinks].')).toBe('Water is the best choice.')
  })
})

describe('Regression tests', () => {
  // Shaped like the real KB collision: the ADA guide's hypoglycemia passage carries a
  // stale "After eating" section heading, so it shares "blood", "glucose", "after"
  // and "eating" with a question about lowering sugar after meals.
  const real = buildIndex([
    P('t2-021', 'After eating', 'Treating a low: when low blood glucose (hypoglycemia) drops under 70 mg/dL, have fast-acting carbohydrate, check your blood glucose again after 15 minutes, then have a snack before eating your next meal.', ['urgent']),
    P('t2-022', 'After eating', 'What is high blood glucose (hyperglycemia)? High blood glucose after meals can come from eating more carbohydrate than usual, missed medicine, illness or stress.', ['urgent']),
    P('plate', 'How to portion your plate', 'Fill half the plate with non-starchy vegetables to keep blood glucose steadier after a meal.'),
    P('faq-high', 'Why is my blood sugar high?', 'Common causes include eating more carbohydrates than usual, missed medications, illness, stress, or poor sleep.'),
  ])

  it('"how to lower my blood sugar after a meal" does not rank the treat-a-low passage first (Kay, 2026-11-14)', () => {
    // Bug: "lower" shares no word with "high", and the everyday-word expansion added
    // "glucose" at full weight, so the hypoglycemia passage ranked first and was shown.
    // Fixed: retrieval reads the direction from the verb (lower → high glucose) and
    // halves the score of passages about the opposite problem.
    const top = real.search('how to lower my blood sugar after a meal')[0].passage.id
    expect(top).not.toBe('t2-021')
    expect(real.search('what do I do if my sugar is low')[0].passage.id).toBe('t2-021') // lows still find it
  })

  it('reads the direction of a glucose question from its verb', () => {
    expect(direction('how to lower my blood sugar')).toBe('high')
    expect(direction('how do I bring my sugar down')).toBe('high')
    expect(direction('my sugar is low, how do I raise it')).toBe('low')
    expect(direction('what fruit can I eat')).toBeNull()
    expect(direction('what is the difference between a low and a high')).toBeNull()
  })

  it('accepts the citation shapes models actually write', () => {
    // A grouped citation "[kb:a, kb:b]" used to parse as no citation at all, and the
    // whole answer was blocked as no_citation.
    expect(citationsIn('Berries are fine [kb:fruit, kb:plate].')).toEqual(['fruit', 'plate'])
    expect(citationsIn('Berries are fine [kb: fruit; plate].')).toEqual(['fruit', 'plate'])
    expect(citationsIn('Berries are fine (kb:fruit).')).toEqual(['fruit'])
    expect(stripCitations('Berries are fine [kb:fruit, kb:plate].')).toBe('Berries are fine.')
  })
})
