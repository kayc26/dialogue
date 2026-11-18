// The plan read-back (ADR-0020). The classifier only proposes "this is a plan question";
// these fixed checks decide whether reading the plan back is safe. The failure that
// matters: "my sugar is 300, what's my dose?" answered with the plan reads as "take your
// usual dose anyway". Phrasings are the kind older adults write, not keyword probes.

import { describe, expect, it } from 'vitest'
import { planBlocker } from './plan'
import { triageRules } from './triage'
import { planReply, REGIMEN_DISCLAIMER, type Regimen } from '../patients/readback'
import { cardsToText } from './persist'
import robert from '../../../patients/fixtures/demo-robert.json'
import helen from '../../../patients/fixtures/demo-helen.json'

const NONE = { history_of_dka: false, pregnant: false, uses_pump: false }
const blocker = (m: string) => planBlocker(m, triageRules(m, NONE).glucose)
const robertRegimen = robert.regimen as unknown as Regimen

describe('which plan questions may be read back', () => {
  it.each([
    "What's my insulin today?",
    'When do I take my 70/30?',
    'How much prednisone am I on now?',
    'What does my plan say for this week?',
    'When does my prednisone go down?',
    'Am I still on the steroid?',
    'What is my dose on day 9?',
  ])('reads back: "%s"', (m) => {
    expect(blocker(m)).toBeNull()
  })

  it.each([
    ['My sugar is 300, what is my dose today?', 'reading'],
    ["It's 280, what's my insulin today?", 'reading'],
    ['I feel shaky, how much insulin do I take?', 'symptom'],
    ["I can't eat today, what's my dose?", 'symptom'],
    ['My sugar is high tonight, what does my plan say?', 'symptom'],
    ['Can I skip my insulin tonight?', 'change'],
    ['Should I take more insulin tonight?', 'change'],
    ['I forgot my morning dose, what now?', 'change'],
    ['Should I still take 16 units?', 'advice'],
    ['Is it ok to take my dinner insulin late?', 'advice'],
  ])('refuses: "%s" (%s)', (m, why) => {
    expect(blocker(m)).toBe(why)
  })
})

describe('what the plan reply says (code, not a model)', () => {
  it("Robert on day 6: today's step and the next change, in the provider's words", () => {
    const r = planReply(robertRegimen)
    expect(r.mode).toBe('special')
    expect(r.lines[0]).toBe('Today (day 6 of 14): Prednisone 30 mg each morning. Insulin aspart 70/30: 16 units before breakfast, 12 units before dinner.')
    expect(r.lines[1]).toMatch(/^From day 9: Prednisone 20 mg/)
    expect(r.footer).toMatch(/follow what they said/)
  })

  it('a patient without a special plan gets the insulin as recorded, never called a plan', () => {
    // QST-READ-WHAT: B. Helen's regimen is a summary of research dose records (ADR-0009).
    const r = planReply(helen.regimen as unknown as Regimen)
    expect(r.mode).toBe('recorded')
    expect(r.heading).toMatch(/as recorded \(not a plan from your care team\)/)
    expect(r.footer).toBe(REGIMEN_DISCLAIMER)
  })

  it('after the taper ends, says so and falls back to the record', () => {
    const ended = { ...robertRegimen, special_plan: { ...robertRegimen.special_plan!, started_days_ago: 20 } }
    const r = planReply(ended)
    expect(r.mode).toBe('recorded')
    expect(r.lines[0]).toMatch(/prednisone taper on file ended after day 14/)
  })

  it("never puts the plan's doses into the chat history the next turn's models read", () => {
    // cardsToText becomes the assistant turn in `history`, which goes to the classifier
    // and the answer model. If it carried the plan, the doses would reach a model one
    // turn later, around rule 1 (ADR-0005).
    const text = cardsToText([{ kind: 'plan', reply: planReply(robertRegimen) }])
    expect(text).not.toMatch(/\d/)
    expect(text).toMatch(/plan on file was shown/)
  })
})
