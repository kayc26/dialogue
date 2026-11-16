// Turn orchestration with scripted model replies. These check *our* ordering
// guarantees, not model quality: an emergency never waits on a model, a dose
// question never reaches the answer model, a bad answer never reaches the patient,
// and a dose-flagged session waits for the monitor. Model calls are counted because
// each one costs money (ADR-0012).

import { describe, expect, it } from 'vitest'
import type { CompleteFn } from '../agent'
import type { ChatMessage } from '../types'
import { buildIndex, type KbPassage } from './retrieve'
import { runTurn, type TurnModels } from './turn'
import { buildCardIndex, CARD_FALLBACK_SCORE, CARD_MIN_SCORE, loadApprovedCards, parsePick, type CardIndex, type TopicCard } from './cards'
import { DataError, type DataClient } from '../neon/data'
import type { Profile } from './triage'

const NONE: Profile = { history_of_dka: false, pregnant: false, uses_pump: false }
const P = (id: string, section: string, body: string, tags: string[] = []): KbPassage => ({
  id, doc_title: 'Doc', source_label: 'ADA', section, body, tags,
})
const index = buildIndex([
  P('fruit', 'What fruit can I eat?', 'Berries, apples and pears tend to raise blood glucose less than melon or bananas. Keep fruit to one cup.'),
  P('hypo', 'Treating low blood glucose', 'To treat low blood glucose below 70 mg/dL, use the Rule of 15: eat 15 grams of fast-acting carbohydrate and recheck after 15 minutes.', ['urgent']),
  P('high', 'High blood sugar', 'If blood sugar stays very high, or you are vomiting or have ketones, seek medical attention.', ['urgent']),
  P('corr', 'Correction insulin', 'Follow your provider instructions for correction insulin if you have not taken insulin in the last 4 hours.', ['dose_related', 'medication']),
])

const cls = (tier: string, happening_now = true, dose_intent = false) =>
  JSON.stringify({ tier, happening_now, dose_intent, reason: 'test' })

function models(o: { classify?: string | null | Error; answers?: string[]; monitor?: string | null; pick?: string | null | Error }) {
  const calls = { classify: 0, complete: 0, monitor: 0, pick: 0 }
  const answers = [...(o.answers ?? [])]
  const m: TurnModels = {
    async classify() {
      calls.classify++
      if (o.classify instanceof Error) throw o.classify
      return o.classify ?? cls('none', false)
    },
    complete: (async () => {
      calls.complete++
      const content = answers.shift() ?? 'I do not have information on that. [kb:fruit]'
      return { message: { role: 'assistant', content } as ChatMessage }
    }) as CompleteFn,
    async monitor() {
      calls.monitor++
      return o.monitor === undefined ? JSON.stringify({ veto: false, raise_tier: 'none', reason: 'ok' }) : o.monitor
    },
    async pick() {
      calls.pick++
      if (o.pick instanceof Error) throw o.pick
      return o.pick === undefined ? 'none' : o.pick
    },
  }
  return { m, calls }
}
// The monitor is on here unless a test says otherwise: these tests guard its behavior
// for when it is unpaused (MONITOR_PAUSED, ADR-0007).
const turn = (message: string, m: TurnModels, extra: { doseSession?: boolean; profile?: Profile; monitorEnabled?: boolean } = {}) =>
  runTurn({
    message, history: [], profile: extra.profile ?? NONE, index, doseSession: extra.doseSession ?? false, models: m, timeoutMs: 50,
    monitorEnabled: extra.monitorEnabled ?? true,
  })

describe('turn orchestration', () => {
  it('emergency: 911 card first and the approved passage, with no model call at all', async () => {
    const { m, calls } = models({})
    const o = await turn("my husband won't wake up and his sugar was low", m)
    expect(o.tier).toBe('emergency')
    expect(o.cards[0]).toMatchObject({ kind: 'escalation', tier: 'emergency' })
    expect(o.cards[1]).toMatchObject({ kind: 'passage', why: 'urgent', passage: { id: 'hypo' } })
    expect(calls).toEqual({ classify: 0, complete: 0, monitor: 0, pick: 0 })
  })

  it('a dose question gets the fixed refusal card; the answer model is never called', async () => {
    const { m, calls } = models({ classify: cls('none', true, true) })
    const o = await turn('How many units of insulin should I take for dinner?', m)
    expect(o.cards.map((c) => c.kind)).toEqual(['dose_refusal'])
    expect(calls.complete).toBe(0)
  })

  it('an ordinary question: classifier, then a cited, guarded answer; monitor reviews in the background', async () => {
    const { m, calls } = models({ answers: ['Berries and apples raise glucose less than bananas. Keep fruit to one cup. [kb:fruit]'] })
    const o = await turn('What fruit can I eat?', m)
    expect(o.tier).toBe('none')
    expect(o.cards).toHaveLength(1)
    expect(o.cards[0]).toMatchObject({ kind: 'answer', text: 'Berries and apples raise glucose less than bananas. Keep fruit to one cup.' })
    expect(o.monitor).toBe('background')
    expect(await o.background).toMatchObject({ veto: false })
    expect(calls).toEqual({ classify: 1, complete: 1, monitor: 1, pick: 0 })
  })

  it('a red flag puts the escalation card and the approved passage before the answer', async () => {
    const { m } = models({ classify: cls('urgent'), answers: ['If it stays very high, seek medical attention. [kb:high]'] })
    const o = await turn('my sugar is 380, what does high blood sugar mean', m)
    expect(o.tier).toBe('urgent')
    expect(o.cards[0]).toMatchObject({ kind: 'escalation', tier: 'urgent' })
    expect(o.cards[1]).toMatchObject({ kind: 'passage', why: 'urgent', passage: { id: 'high' } })
  })

  it('a model answer with dose advice never reaches the patient: the best passage is shown instead', async () => {
    const { m } = models({ answers: ['Eat some fruit and take 4 units before dinner. [kb:fruit]'] })
    const o = await turn('What fruit can I eat?', m)
    expect(o.guard).toMatch(/^dose_advice/)
    expect(o.cards.find((c) => c.kind === 'answer')).toBeUndefined()
    expect(o.cards).toContainEqual({ kind: 'passage', why: 'fallback', passage: expect.objectContaining({ id: 'fruit' }) })
  })

  it('never gives a dose-tagged passage to the model', async () => {
    let prompt = ''
    const { m } = models({})
    m.complete = (async (msgs: ChatMessage[]) => {
      prompt = msgs.map((x) => x.content).join('\n')
      return { message: { role: 'assistant', content: 'Berries are a good choice. [kb:fruit]' } as ChatMessage }
    }) as CompleteFn
    await turn('what about correction insulin and fruit', m)
    expect(prompt).not.toContain('correction insulin if you have not taken insulin')
  })

  it('in a dose-flagged session the monitor must approve first, and its veto replaces the answer', async () => {
    const { m, calls } = models({
      answers: ['Berries and apples are good choices. [kb:fruit]'],
      monitor: JSON.stringify({ veto: true, raise_tier: 'none', reason: 'dose across turns' }),
    })
    const o = await turn('What fruit can I eat?', m, { doseSession: true })
    expect(o.monitor).toBe('blocking')
    expect(o.guard).toBe('monitor_veto')
    expect(o.cards.map((c) => c.kind)).toEqual(['dose_refusal'])
    expect(calls.monitor).toBe(1)
  })

  it('a monitor that fails in a dose session still shows help inline (never silently none)', async () => {
    const { m } = models({ answers: ['Berries are good. [kb:fruit]'], monitor: null })
    const o = await turn('What fruit can I eat?', m, { doseSession: true })
    expect(o.tier).toBe('checkin')
    expect(o.cards[0]).toMatchObject({ kind: 'escalation', tier: 'checkin' })
  })

  it('a failed classifier counts as check-in, and the answer still comes', async () => {
    const { m } = models({ classify: new Error('timeout'), answers: ['Berries are good. [kb:fruit]'] })
    const o = await turn('What fruit can I eat?', m)
    expect(o.tier).toBe('checkin')
    expect(o.triage.classifierFailed).toBe(true)
    expect(o.cards.some((c) => c.kind === 'answer')).toBe(true)
  })

  it('with the monitor paused, no monitor call is made, even in a dose session, and the guard still blocks dose advice', async () => {
    const { m, calls } = models({ answers: ['Berries are good. [kb:fruit]', 'Take 4 units before dinner. [kb:fruit]'] })
    const ok = await turn('What fruit can I eat?', m, { doseSession: true, monitorEnabled: false })
    expect(ok.monitor).toBe('paused')
    expect(ok.cards.map((c) => c.kind)).toEqual(['answer'])
    const bad = await turn('What fruit can I eat?', m, { doseSession: true, monitorEnabled: false })
    expect(bad.guard).toMatch(/^dose_advice/)
    expect(calls.monitor).toBe(0)
  })

  it('nothing relevant in the knowledge base: "no information", and no answer model call', async () => {
    const { m, calls } = models({})
    const o = await turn('How do I renew my passport?', m)
    expect(o.cards.map((c) => c.kind)).toEqual(['no_info'])
    expect(calls.complete).toBe(0)
  })
})

describe('Regression tests', () => {
  it('"how to lower my blood sugar after a meal" never shows the treat-a-low passage in place of a "no information" reply (Kay, 2026-11-14)', async () => {
    // Bug: Kay asked how to LOWER their blood sugar and was shown how to treat a LOW.
    // The model followed ANSWER_SYSTEM and replied "I don't have information on
    // that…", which (as instructed) cites nothing; the guard blocked it as
    // no_citation, and the fallback then showed the top-ranked passage verbatim —
    // the Rule of 15 for hypoglycemia, the opposite problem.
    // Fixed: a no-citation "no information" reply becomes the no_info card, and the
    // blocked draft is kept for the care-team log so blocks can be diagnosed.
    const { m } = models({ answers: ["I don't have information on that. Your care team can help."] })
    const o = await turn('how to lower my blood sugar after a meal', m)
    expect(o.guard).toBe('no_citation')
    expect(o.cards.map((c) => c.kind)).toEqual(['no_info'])
    expect(o.blockedDraft).toContain("I don't have information")
  })

  it('a failed classifier on "What fruit can I eat?" shows the check-in card without the treat-a-low passage (Kay, 2026-11-14)', async () => {
    // Bug: the classifier failed (logged as classifier_unavailable), so the turn
    // became a check-in; with no glucose number, the urgent passage was searched as
    // "<message> low blood glucose treat", which attached the Rule of 15 for lows to
    // a question about fruit. Fixed: the urgent passage needs a direction (a reading,
    // or words like low/high); otherwise the check-in card stands alone.
    const { m } = models({ classify: new Error('timeout'), answers: ['Berries are good. [kb:fruit]'] })
    const o = await turn('What fruit can I eat?', m)
    expect(o.tier).toBe('checkin')
    expect(o.cards[0]).toMatchObject({ kind: 'escalation', tier: 'checkin' })
    expect(o.cards.some((c) => c.kind === 'passage' && c.passage.id === 'hypo')).toBe(false)
    // an urgent red flag that names a low still gets the low passage
    const low = await turn('I keep going low and feel shaky', models({ classify: cls('urgent') }).m)
    expect(low.cards).toContainEqual({ kind: 'passage', why: 'urgent', passage: expect.objectContaining({ id: 'hypo' }) })
  })

  it('one question gets one reply: a help notice at most, then a single body (Kay, 2026-11-14)', async () => {
    // Bug: "why is my blood sugar high" showed four blocks — a check-in card, an
    // "urgent" passage, a dose passage, and a fallback passage — for one question.
    // Fixed: a check-in adds no passage; a dose-tagged best match is shown only in place
    // of an answer; a blocked answer is replaced by exactly one passage.
    // Shaped like the real case: the best match is a dose-tagged "after eating" passage.
    const afterMeals = buildIndex([
      P('meal-dose', 'After eating', 'If blood sugar is high after eating, follow your provider plan for correction insulin after eating.', ['dose_related', 'medication', 'urgent']),
      P('high', 'High blood sugar', 'If blood sugar stays very high, or you are vomiting or have ketones, seek medical attention.', ['urgent']),
      // unrelated passages, so word rarity behaves as it does in a real corpus
      P('fruit', 'What fruit can I eat?', 'Berries, apples and pears are good choices. Keep fruit to one cup.'),
      P('plate', 'Plan your plate', 'Fill half the plate with non-starchy vegetables.'),
      P('drinks', 'Beverages', 'Water is the best choice. Limit soda and juice.'),
      P('walk', 'Activity', 'A short walk most days helps your heart and mood.'),
    ])
    const ask = (answer: string) =>
      runTurn({
        message: 'why is my blood sugar high after eating', history: [], profile: NONE, index: afterMeals, doseSession: false,
        models: models({ classify: cls('checkin'), answers: [answer] }).m, timeoutMs: 50, monitorEnabled: false,
      })

    // the answer gets through: the help notice and the answer, nothing else
    const answered = await ask('If it stays very high, seek medical attention. [kb:high]')
    expect(answered.cards.map((c) => c.kind)).toEqual(['escalation', 'answer'])

    // the answer is blocked: exactly one passage, the dose passage shown word for word
    const blocked = await ask('')
    expect(blocked.cards.map((c) => c.kind)).toEqual(['escalation', 'passage'])
    expect(blocked.cards[1]).toMatchObject({ why: 'dose', passage: { id: 'meal-dose' } })
  })

  it('an empty model reply is its own guard reason, not "no citation"', async () => {
    // All three of Kay's answers on 2026-11-14 were logged as no_citation with no
    // draft kept, so an empty reply and an uncited one looked the same.
    const { m } = models({ answers: [''] })
    const o = await turn('What fruit can I eat?', m)
    expect(o.guard).toBe('empty_answer')
    expect(o.cards).toContainEqual({ kind: 'passage', why: 'fallback', passage: expect.objectContaining({ id: 'fruit' }) })
  })
})

// ADR-0013 (QST-KB-CARD-USE: A): a matched approved card is shown as written; the model
// only picks among a shortlist, and code checks its pick. Shaped like the real drafts.
describe('approved topic cards', () => {
  const card = (id: string, topic: string, asks: string[], body: string, source_ids: string[], status: TopicCard['status'] = 'approved'): TopicCard =>
    ({ id, topic, asks, body, source_ids, status })
  const fruitCard = card('card-fruit', 'Fruit and diabetes', ['What fruit can I eat?', 'Is fruit okay with diabetes?', 'Can I eat bananas?'],
    'Fruit can be part of your meals. Berries, apples and pears raise blood glucose less than melon or bananas. Keep fruit to one cup at a time.', ['fruit'])
  const lowCard = card('card-low-treat', 'How to treat a low blood sugar', ['What do I do if my sugar is low?', 'What is the rule of 15?'],
    'If your blood glucose is below 70 mg/dL, eat 15 grams of fast-acting carbohydrate and check again after 15 minutes.', ['hypo'])
  const draftCard = card('card-fruit-juice', 'Fruit juice', ['Can I drink fruit juice?', 'What fruit can I eat?'], 'DRAFT TEXT not yet approved.', ['fruit'], 'draft')
  const passages = [
    P('fruit', 'What fruit can I eat?', 'Berries, apples and pears tend to raise blood glucose less than melon or bananas. Keep fruit to one cup.'),
    P('hypo', 'Treating low blood glucose', 'To treat low blood glucose below 70 mg/dL, use the Rule of 15.', ['urgent']),
  ]
  // The turn's decisions depend on scores calibrated on the real knowledge base (cards.ts),
  // which a 4-passage fixture can't reproduce, so the turn tests below search a card
  // index whose scores are set on purpose; the real index has its own tests further down.
  const scored = (hits: { card: TopicCard; score: number }[]): CardIndex => ({
    size: hits.length,
    search: (_q, k = 3) => hits.slice(0, k).map((h) => ({ ...h, sources: passages.filter((p) => h.card.source_ids.includes(p.id)) })),
  })
  const strongFruit = scored([{ card: fruitCard, score: CARD_FALLBACK_SCORE + 2 }, { card: lowCard, score: 3 }])
  const ask = (message: string, m: TurnModels, cards: CardIndex = strongFruit) =>
    runTurn({ message, history: [], profile: NONE, index, cards, doseSession: false, models: m, timeoutMs: 50, monitorEnabled: false, cardsEnabled: true })

  it('a picked card is shown word for word, with its sources, and the answer model is never called', async () => {
    const { m, calls } = models({ pick: 'card-fruit' })
    const o = await ask('What fruit can I eat?', m)
    expect(o.cards).toEqual([{ kind: 'topic_card', card: fruitCard, sources: [expect.objectContaining({ id: 'fruit' })] }])
    expect(o.card).toMatchObject({ id: 'card-fruit', how: 'picked', shortlist: ['card-fruit', 'card-low-treat'] })
    expect(calls).toMatchObject({ classify: 1, pick: 1, complete: 0 })
  })

  it('a draft card is never shown or even offered, though it matches the question', async () => {
    // RLS serves members approved cards only; this is the second lock, for a wrong
    // query or a loosened policy.
    const real = buildCardIndex([fruitCard, lowCard, draftCard], passages)
    expect(real.size).toBe(2)
    expect(real.search('Can I drink fruit juice? What fruit can I eat?', 5).map((h) => h.card.id)).not.toContain('card-fruit-juice')
    // and a picker that names it anyway gets the raw-passage path, not the draft
    const { m } = models({ pick: 'card-fruit-juice', answers: ['Berries are a good choice. [kb:fruit]'] })
    const o = await ask('Can I drink fruit juice?', m, real)
    expect(o.cards.some((c) => c.kind === 'topic_card')).toBe(false)
    expect(JSON.stringify(o.cards)).not.toContain('DRAFT TEXT')
  })

  it('a pick that names a card not on the shortlist is treated as none: the raw-passage answer runs', async () => {
    const { m, calls } = models({ pick: 'card-snacks', answers: ['Berries are a good choice. [kb:fruit]'] }) // an approved id, but not offered
    const o = await ask('What fruit can I eat?', m)
    expect(o.card).toMatchObject({ id: null, how: 'none' })
    expect(o.cards.map((c) => c.kind)).toEqual(['answer'])
    expect(calls.complete).toBe(1)
  })

  it('"none" from the picker means the raw-passage path, as before cards', async () => {
    const { m } = models({ pick: 'none', answers: ['Berries are a good choice. [kb:fruit]'] })
    const o = await ask('What fruit can I eat?', m)
    expect(o.card).toMatchObject({ how: 'none' })
    expect(o.cards.map((c) => c.kind)).toEqual(['answer'])
  })

  it('when the pick call fails, the top card is shown only if its score clears CARD_FALLBACK_SCORE', async () => {
    const confident = await ask('What fruit can I eat?', models({ pick: new Error('timeout') }).m)
    expect(confident.card).toMatchObject({ id: 'card-fruit', how: 'fallback' })
    expect(confident.cards.map((c) => c.kind)).toEqual(['topic_card'])

    // just under the bar: the wrong-card first places seen in calibration reached 12.8
    const unsureIndex = scored([{ card: fruitCard, score: CARD_FALLBACK_SCORE - 0.5 }])
    const unsure = await ask('What fruit can I eat?', models({ pick: new Error('timeout'), answers: ['Bananas raise blood glucose more than berries. [kb:fruit]'] }).m, unsureIndex)
    expect(unsure.card).toMatchObject({ id: null, how: 'failed' })
    expect(unsure.cards.map((c) => c.kind)).toEqual(['answer'])
  })

  it('no card is close enough: no pick call is made (it would only cost money)', async () => {
    const { m, calls } = models({})
    const o = await ask('How do I renew my passport?', m, scored([{ card: fruitCard, score: CARD_MIN_SCORE - 0.1 }]))
    expect(o.card).toMatchObject({ how: 'no_match', shortlist: [] })
    expect(calls.pick).toBe(0)
  })

  it('emergencies and dose questions never reach the cards', async () => {
    const e = models({ pick: 'card-low-treat' })
    const emergency = await ask("my husband won't wake up and his sugar was low", e.m)
    expect(emergency.card).toBeNull()
    expect(e.calls.pick).toBe(0)

    const d = models({ classify: cls('none', true, true), pick: 'card-low-treat' })
    const dose = await ask('How much insulin should I take when my sugar is low?', d.m)
    expect(dose.cards.map((c) => c.kind)).toEqual(['dose_refusal'])
    expect(d.calls.pick).toBe(0)
  })

  it('with no approved cards, turns run exactly as before cards (no pick call)', async () => {
    const { m, calls } = models({ answers: ['Berries are a good choice. [kb:fruit]'] })
    const o = await runTurn({
      message: 'What fruit can I eat?', history: [], profile: NONE, index, cards: buildCardIndex([draftCard]), doseSession: false, models: m, timeoutMs: 50, monitorEnabled: false, cardsEnabled: true,
    })
    expect(o.card).toBeNull()
    expect(calls.pick).toBe(0)
    expect(o.cards.map((c) => c.kind)).toEqual(['answer'])
  })

  it('reads the picker reply the ways models write it, and trusts only shortlisted ids', () => {
    const list = ['card-fruit', 'card-snacks']
    expect(parsePick('card-fruit', list)).toEqual({ id: 'card-fruit' })
    expect(parsePick(' "card-fruit". ', list)).toEqual({ id: 'card-fruit' })
    expect(parsePick('The best match is card-snacks.', list)).toEqual({ id: 'card-snacks' })
    expect(parsePick('None', list)).toEqual({ none: true })
    expect(parsePick('card-fruit or card-snacks', list)).toEqual({ none: true }) // ambiguous
    expect(parsePick('card-low-treat', list)).toEqual({ none: true }) // not offered
    expect(parsePick('card-fruit-juice', list)).toEqual({ none: true }) // a longer id is not card-fruit
    expect(parsePick(null, list)).toBeNull() // failure, not "none"
  })

  it('loading cards never takes the patient view down: a missing table or a failed read gives no cards', async () => {
    // The site deploys on every push, before the database migration that creates
    // kb_cards; the Data API then answers 404 for the table.
    const missing: DataClient = { get: () => Promise.reject(new DataError(404, 'Data API 404')) }
    expect(await loadApprovedCards(missing)).toEqual([])
    const served: DataClient = { get: <T,>() => Promise.resolve([lowCard, draftCard] as T) }
    expect((await loadApprovedCards(served)).map((c) => c.id)).toEqual(['card-low-treat'])
  })

  it('while cards are paused (CARDS_PAUSED, the RAG-only trial), approved cards are never searched or picked', async () => {
    const { m, calls } = models({ pick: 'card-fruit', answers: ['Berries are a good choice. [kb:fruit]'] })
    const o = await runTurn({ message: 'What fruit can I eat?', history: [], profile: NONE, index, cards: strongFruit, doseSession: false, models: m, timeoutMs: 50, monitorEnabled: false })
    expect(o.card).toBeNull()
    expect(calls.pick).toBe(0)
    expect(o.cards.map((c) => c.kind)).toEqual(['answer'])
  })

  describe('Regression tests', () => {
    it("a card's score doesn't depend on how many cards are approved (found 2026-11-16)", () => {
      // Bug: card search took word rarity from the approved cards alone. With 2 cards
      // instead of 30, "What fruit can I eat?" scored under CARD_MIN_SCORE, so no pick
      // call was made and the card never showed, though it was approved and matched.
      // The sponsor may approve cards in batches, so this would have hidden cards
      // exactly while few were live. Fixed: rarity comes from the cards plus the whole
      // knowledge base (buildIndex's `background`), as in calibration.
      const kb = [
        ...passages,
        P('plate', 'Plan your plate', 'Fill half the plate with non-starchy vegetables.'),
        P('drinks', 'Beverages', 'Water is the best choice. Limit soda and juice.'),
        P('walk', 'Activity', 'A short walk most days helps your heart and mood.'),
        P('feet', 'Foot care', 'Check your feet every day for cuts and blisters.'),
      ]
      const q = 'What fruit can I eat?'
      const alone = buildCardIndex([fruitCard], kb).search(q)[0].score
      const among = buildCardIndex([fruitCard, lowCard], kb).search(q)[0].score
      expect(alone / among).toBeGreaterThan(0.85)
      expect(alone / among).toBeLessThan(1.15)
    })
  })
})

// ADR-0013 (QST-KB-BOOK-ROLE: A): the book informs written answers but is never shown
// word for word (first-person voice; copyright allows brief quotes only).
describe('the book is never shown word for word', () => {
  const B = (id: string, section: string, body: string, tags: string[] = []): KbPassage => ({ ...P(id, section, body, tags), source_label: 'book', doc_title: 'Bright Spots & Landmines' })
  const withBook = buildIndex([
    B('book-walk', 'Walking after meals', 'I walk for 15 minutes after dinner and my blood sugar after meals is much steadier. Walking after meals is one of my favorite habits.'),
    B('book-low', 'Low blood sugar', 'When my blood sugar is low I treat it with glucose tabs, then check again.', ['urgent']),
    P('ada-walk', 'Physical activity', 'Regular physical activity such as walking helps manage blood glucose after meals.'),
    P('ada-low', 'Treating low blood glucose', 'To treat low blood glucose below 70 mg/dL, use the Rule of 15.', ['urgent']),
    P('plate', 'Plan your plate', 'Fill half the plate with non-starchy vegetables.'),
    P('drinks', 'Beverages', 'Water is the best choice. Limit soda and juice.'),
  ])
  const go = (message: string, m: TurnModels) =>
    runTurn({ message, history: [], profile: NONE, index: withBook, doseSession: false, models: m, timeoutMs: 50, monitorEnabled: false })

  it("a blocked answer falls back to an ADA passage, not the book's, even when the book ranks first", async () => {
    expect(withBook.search('walking after meals blood sugar')[0].passage.id).toBe('book-walk') // precondition
    const o = await go('Does walking after meals help my blood sugar?', models({ answers: ['Walk for 15 minutes after dinner. [kb:book-walk]'] }).m)
    expect(o.guard).toBe('unsupported_number:15') // the book's number doesn't count
    expect(o.cards).toEqual([{ kind: 'passage', why: 'fallback', passage: expect.objectContaining({ id: 'ada-walk' }) }])
  })

  it('the urgent "what to do" passage is always ADA', async () => {
    const o = await go('my sugar is 45 and I feel shaky', models({ classify: cls('urgent'), answers: ['Use the Rule of 15. [kb:ada-low]'] }).m)
    const shown = o.cards.filter((c) => c.kind === 'passage')
    expect(shown).toEqual([{ kind: 'passage', why: 'urgent', passage: expect.objectContaining({ id: 'ada-low' }) }])
  })
})
