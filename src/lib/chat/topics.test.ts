// Curated topic sections (ADR-0018). The answer model reads the whole care-team FAQ and
// ADA material for the classifier's topics, plus the best few book passages from the
// matching chapters, instead of word search's top four fragments.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CompleteFn } from '../agent'
import type { ChatMessage } from '../types'
import { buildIndex, type KbPassage } from './retrieve'
import { checkTopicMap, sectionPassages, topicMapIds, validTopics, type MapPassage } from './topics'
import { runTurn, type TurnModels } from './turn'

const P = (id: string, source_label: KbPassage['source_label'], body: string, extra: Partial<KbPassage> = {}): KbPassage => ({
  id, doc_title: 'Doc', source_label, section: null, body, tags: [], ...extra,
})
// Real ids from the topic map, short stand-in text (the real text isn't in the repo).
const passages = [
  P('ada-t1-guide-031', 'ADA', 'When to seek immediate help: call 911 if you cannot keep fluids down or are confused.'),
  P('ada-t1-guide-049', 'ADA', 'Aerobic activities such as walking or biking usually lower blood glucose for hours afterward. Have a snack with carbohydrate and protein after a long activity.'),
  P('ada-t1-guide-053', 'ADA', 'Exercise safety: check your glucose; you may need to lower your insulin before exercise.', { tags: ['dose_related'] }),
  P('ada-t2-guide-046', 'ADA', 'Most adults with diabetes should aim for at least 150 minutes of activity a week.', { diabetes_type: 'type2' }),
  P('ada-t2-guide-021', 'ADA', 'To treat low blood glucose after eating or activity, eat 15 grams of fast-acting carbohydrate and recheck after 15 minutes.', { diabetes_type: 'type2', tags: ['urgent'] }),
  P('team-faqs-005', 'care_team', 'Fruit can fit into a healthy meal plan. Keep the portion to 1 cup.'),
  P('bright-spots-500', 'book', 'After a long hike I eat a handful of nuts and some cheese so I do not drop overnight.'),
  P('bright-spots-510', 'book', 'On hike days I pack trail mix and check more often.'),
  P('bright-spots-520', 'book', 'A short walk after dinner after a hike day keeps me steady.'),
  P('bright-spots-100', 'book', 'After a hike I never eat dessert, says my food chapter.'), // food chapter, not activity
]
const index = buildIndex(passages)
const hidden = (p: KbPassage) => p.tags.includes('dose_related')

// The map names passages by id and book chapters by number range. A knowledge-base
// rebuild that renumbers passages must be caught before it is loaded, not discovered
// as thinner answers on the live site (sectionPassages skips unknown ids silently).
describe('the topic map fits the knowledge base', () => {
  // The real build is git-ignored source text, so this runs where it exists (Kay's
  // machine, i.e. the gate before a commit that edits topics.ts) and is skipped in CI.
  const BUILD = new URL('../../../kb/out/passages.json', import.meta.url)
  it.skipIf(!existsSync(BUILD))('fits the current build in kb/out/passages.json', () => {
    const { passages } = JSON.parse(readFileSync(BUILD, 'utf8')) as { passages: Array<{ id: string; sourceLabel: string; section: string | null }> }
    expect(checkTopicMap(passages.map((p) => ({ id: p.id, source_label: p.sourceLabel, section: p.section })))).toEqual([])
  })

  // A stand-in build that fits: every listed id, plus a book whose chapter headings sit
  // where the ranges expect them (Food starts at 36, Mindset 273, Exercise 452, Sleep 677).
  const fitting = (): MapPassage[] => [
    ...topicMapIds().map((id) => ({ id, source_label: id.startsWith('team-faqs') ? 'care_team' : 'ADA', section: null })),
    { id: 'bright-spots-010', source_label: 'book', section: 'Start here' },
    { id: 'bright-spots-036', source_label: 'book', section: 'FOOD: BRIGHT SPOTS' },
    { id: 'bright-spots-273', source_label: 'book', section: 'MINDSET: BRIGHT SPOTS' },
    { id: 'bright-spots-452', source_label: 'book', section: 'EXERCISE: BRIGHT SPOTS' },
    { id: 'bright-spots-677', source_label: 'book', section: 'SLEEP: BRIGHT SPOTS' },
  ]

  it('a build that fits reports nothing', () => {
    expect(checkTopicMap(fitting())).toEqual([])
  })

  it('a rebuild that drops or renames a listed passage is named, with the topic that loses it', () => {
    const build = fitting().filter((p) => p.id !== 'ada-sweeteners-003')
    expect(checkTopicMap(build)).toEqual(['sweeteners: ada-sweeteners-003 is not in the knowledge base'])
  })

  it('a renumbered book is caught by its chapter headings', () => {
    // The book re-extracted with its Food chapter starting earlier: passage 30 now opens
    // Food, but the ranges still send 1-35 to basics.
    const build = [...fitting(), { id: 'bright-spots-030', source_label: 'book', section: 'FOOD: BRIGHT SPOTS' }]
    expect(checkTopicMap(build)).toEqual(['book: bright-spots-030 is headed "FOOD: BRIGHT SPOTS" but its range sends it to basics'])
  })

  it('book passages past the last chapter range are reported, since no answer could use them', () => {
    const build = [...fitting(), { id: 'bright-spots-740', source_label: 'book', section: 'SLEEP: QUESTIONS' }]
    expect(checkTopicMap(build)).toEqual(['book: bright-spots-740 falls in no chapter range, so no answer can use it'])
  })
})

describe('the classifier\'s topic list is checked before use', () => {
  it('keeps real topics in order, drops unknown ones and duplicates, at most two', () => {
    expect(validTopics(['activity', 'nonsense', 'activity', 'food', 'support'])).toEqual(['activity', 'food'])
    expect(validTopics('activity')).toEqual([]) // not a list
    expect(validTopics(undefined)).toEqual([])
  })
})

describe('what the answer model reads for a topic', () => {
  it('the whole section, "when to get help", and the best book passages from that chapter only', () => {
    const got = sectionPassages(['activity'], 'what can i eat after a hike', passages, index, { hidden, diabetesType: 'type2', bookLimit: 2, bookMinScore: 0.1 }).map((p) => p.id)
    expect(got[0]).toBe('ada-t1-guide-031') // always included
    expect(got).toContain('ada-t1-guide-049')
    expect(got).toContain('ada-t2-guide-046')
    expect(got).not.toContain('ada-t1-guide-053') // dose-tagged: never given to the model (ADR-0005)
    expect(got).not.toContain('bright-spots-100') // the book's food chapter, not activity
    expect(got.filter((id) => id.startsWith('bright-spots'))).toHaveLength(2) // "best few passages"
    expect(got.indexOf('ada-t2-guide-046')).toBeLessThan(got.indexOf('ada-t1-guide-049')) // own diabetes type first
  })

  it('nothing to route to (no topic, or none of its passages loaded) means word search takes over', () => {
    expect(sectionPassages([], 'hike', passages, index, { hidden })).toEqual([])
    expect(sectionPassages(['sweeteners'], 'stevia', passages, index, { hidden })).toEqual([])
  })
})

const cls = (topics: string[]) => JSON.stringify({ tier: 'none', happening_now: false, dose_intent: false, topics, reason: 'test' })
function models(classify: string | null, answer: string) {
  const prompts: string[] = []
  const m: TurnModels = {
    classify: async () => classify,
    complete: (async (messages: ChatMessage[]) => {
      prompts.push(messages.map((x) => x.content ?? '').join('\n'))
      return { message: { role: 'assistant', content: answer } as ChatMessage }
    }) as CompleteFn,
    monitor: async () => JSON.stringify({ veto: false, raise_tier: 'none', reason: 'ok' }),
    pick: async () => 'none',
  }
  return { m, prompts }
}
const turn = (message: string, m: TurnModels, withPassages = true) =>
  runTurn({
    message, history: [], profile: { history_of_dka: false, pregnant: false, uses_pump: false }, index, doseSession: false,
    models: m, timeoutMs: 50, monitorEnabled: false, diabetesType: 'type2', ...(withPassages ? { passages } : {}),
  })

describe('the turn reads topic sections when the classifier names a topic', () => {
  it('falls back to word search when the classifier names no topic', async () => {
    const { m } = models(cls([]), 'Fruit can fit into a healthy meal plan. [kb:team-faqs-005]')
    const o = await turn('What fruit can I eat?', m)
    expect(o.retrieval).toBe('search')
  })

  it('a blocked answer falls back to the most relevant passage in the section, not its first', async () => {
    // The draft cites nothing, so the guard blocks it (no_citation).
    const { m } = models(cls(['activity']), 'Have a snack after hiking.')
    const o = await turn('what can i eat after a hike', m)
    expect(o.guard).toBe('no_citation')
    expect(o.cards[0]).toMatchObject({ kind: 'passage', why: 'fallback', passage: { id: 'ada-t1-guide-049' } })
  })
})

describe('a clarifying question from the answer model (ADR-0018 iteration 5)', () => {
  it('is shown as a question, not blocked for having no citation', async () => {
    const { m } = models(cls(['activity']), 'Are you asking about right after the hike, or later that day?')
    const o = await turn('what can i eat after a hike', m)
    expect(o.cards).toEqual([{ kind: 'clarify', text: 'Are you asking about right after the hike, or later that day?' }])
    expect(o.guard).toBeNull()
  })
})

describe('Regression tests', () => {
  it('"what can i eat after a hike" reads the exercise section, not how to treat a low (Kay, live site, 2026-11-17)', async () => {
    // Bug: word search matched "eat" and "after" and handed the model how to treat a
    // low and time-in-range targets; the ADA exercise section never made the top 4
    // ("hike" isn't in it). The answer explained the 15-15 rule. Fixed (ADR-0018): the
    // classifier's topic ("activity") picks the whole exercise section.
    const { m, prompts } = models(cls(['activity']), 'Have a snack with carbohydrate and protein after a long activity. [kb:ada-t1-guide-049]')
    const o = await turn('what can i eat after a hike', m)
    expect(o.retrieval).toBe('topics')
    expect(prompts[0]).toContain('[kb:ada-t1-guide-049]')
    expect(prompts[0]).not.toContain('[kb:ada-t2-guide-021]') // treating a low
    expect(o.cards[0]).toMatchObject({ kind: 'answer' })

    // The same question without topic routing: what the live site did.
    const before = models(cls([]), 'x')
    await turn('what can i eat after a hike', before.m)
    expect(before.prompts[0]).toContain('[kb:ada-t2-guide-021]')
  })
})
