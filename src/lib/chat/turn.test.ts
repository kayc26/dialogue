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

function models(o: { classify?: string | null | Error; answers?: string[]; monitor?: string | null }) {
  const calls = { classify: 0, complete: 0, monitor: 0 }
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
    expect(calls).toEqual({ classify: 0, complete: 0, monitor: 0 })
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
    expect(calls).toEqual({ classify: 1, complete: 1, monitor: 1 })
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
    // a check-in that does name a low still gets the low passage
    const low = await turn('I feel low and shaky', models({ classify: cls('checkin') }).m)
    expect(low.cards).toContainEqual({ kind: 'passage', why: 'urgent', passage: expect.objectContaining({ id: 'hypo' }) })
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
