<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0016: Greetings and small talk in a cited assistant

- **Date**: 2026-11-17
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: "hi" gets "I don't have information on that", because the guard rejects any model-written answer without a citation, and a greeting has nothing to cite. Recommendation: after triage, recognize messages that are only small talk and answer them with fixed, sponsor-approved text, with no answer model; also make the "no information" reply say what the assistant can help with.

---

## Originating Context

**Source**: Kay, on the live site, 2026-11-17: typed "hi" and got "I don't have information on that. Your care team can help." Then asked: "what are the field standard for messages like this when content should have citation", and said "yes" to writing it up as an ADR.

What the log showed (production `triage_events`, 2026-11-17 01:47:10 UTC):
- triage `none`; the classifier and the answer model both ran;
- the answer model wrote "Hi! I can help with questions about diabetes care, eating, and daily routines. What would you like to know?";
- the guard blocked it (`no_citation`); no passage fit as a fallback, so the reply was `no_info`.

**Agency Grant**: Write up the options with a recommendation; Kay decides before anything is built.

---

## Explicitation

**What I understand**:

1. **The guard checks the whole message, not each claim.** `src/lib/chat/guard.ts` requires every model-written answer to cite a passage it was shown (ADR-0005). That is the right rule for health content. A greeting carries no claim, so it can never pass.
2. **What the field does** (Nibble's summary from general knowledge, not a literature search; no formal standard covers this):
   - Conversation platforms treat greetings, thanks, goodbyes and "what can you do?" as their own intents with fixed replies (e.g. Rasa's starter `greet` intent, Microsoft QnA Maker's chit-chat sets).
   - Groundedness checkers work per claim: Google's grounding check, Azure's groundedness detection and the RAGAS faithfulness metric split an answer into claims and check each one. A sentence with no claim is neither supported nor flagged.
   - Health bots usually script everything the bot says on its own behalf, so text without a source is text a person wrote and approved. This project already works that way for the escalation and dose-refusal cards.
3. **First impressions matter for these testers.** Older adults often open with "hi" or "hello, I have a question". "I don't have information on that" as the first reply reads as broken.
4. **Safety ordering must not change.** "hi, my sugar is 400" must still escalate. So any small-talk path runs **after** triage (fixed rules and the classifier), and only when triage is `none` and the message is nothing but small talk.

**Assumptions**:

- The clinical sponsor approves fixed text, as with the cards (ADR-0013); until then, Kay's approval is enough for the test.
- Small talk is a short closed list: greeting, thanks, goodbye, "who are you / what can you do", "ok / yes / no" alone.

---

## Questions

### QST-SOCIAL-PATH: How should the assistant answer messages that are only small talk?
- Status: unanswered
- Why asking: today a greeting runs the answer model (about $0.0002), whose reply the guard then blocks, so the tester sees "I don't have information on that". The guard requires a citation on every model-written answer (ADR-0005), and a greeting has nothing to cite. Whatever is chosen runs after triage, so a greeting with a red flag still escalates.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — fixed replies by rule**: after triage comes back `none`, a short pattern list (`hi`, `hello`, `thanks`, `bye`, `who are you`, `what can you do`, and similar, with nothing else in the message) picks one of a few fixed, approved replies. No answer model is called. Mixed messages ("hi, what should I eat?") go down the normal path.
- **B — fixed replies chosen by the classifier**: the classifier, which already runs on every message, also returns a `social` label; code then shows the same fixed replies as A. Catches phrasings a pattern list misses ("good morning dear", "is anyone there?"), but a model decides what counts as small talk, and the classifier prompt and parser change.
- **C — claim-level guard**: let the answer model write the greeting, and change the guard so a sentence with no numbers and no health terms passes without a citation. Most natural replies, but "no health claim" is hard to check in code, and an error lets uncited health content through.
- **D — leave it**: greetings keep getting "I don't have information on that"; the moderated test protocol tells testers to ask a question straight away.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — fixed replies by rule.** *Rationale*: it matches how regulated bots handle conversation (scripted, approved text) and how this project already handles escalation and dose refusal (`turn.ts` cards). It costs nothing per message, needs no change to the guard (ADR-0005's "every model-written answer cites" stays absolute), and is testable offline in the gate. A missed phrasing just falls through to today's behaviour, so A's failure mode is the current state, not a new risk. B's extra coverage isn't worth putting a model in charge of skipping the guard; C weakens the one check that stands alone while the monitor is paused (`MONITOR_PAUSED`). *Confidence*: 0.8 — because the failure mode of A is the current behaviour and the pattern list is small and checkable; the field summary above is from general knowledge, not a search. *If wrong*: if moderated sessions show testers' openings are too varied for a pattern list (many greetings still reaching `no_info`), this flips to B.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-NO-INFO-TEXT: Should "I don't have information on that" say what the assistant can help with?
- Status: unanswered
- Why asking: the current reply ("I don't have information on that. Your care team can help.") is shown whenever search finds nothing or the guard blocks an answer with no fallback passage. It tells the tester what the assistant can't do but not what it can, so a tester who missed the scope doesn't know what to try next. The same text is in the answer prompt (`src/lib/chat/prompts.ts`), and code recognizes it (`turn.ts`, `NO_INFO`).
- Need: pick a letter (or override — reword freely)

Options:
- **A — keep it**: "I don't have information on that. Your care team can help."
- **B — add what it can help with**: "I don't have information on that. I can answer general questions about eating, blood sugar, and everyday diabetes care. For anything else, your care team can help."
- **C — B plus example questions**: B, followed by two or three tappable example questions (e.g. "What can I eat for breakfast?", "What is a low blood sugar?"). Each example must be one the knowledge base answers well, checked with `kb:eval-faq`.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**B — add what it can help with.** *Rationale*: it points the tester somewhere without new UI, and the scope it names comes from the knowledge base's actual coverage (ADR-0013: FAQ, ADA guides, the book). C is better for older adults who may not know what to type, but the tappable questions are new UI and each needs an eval run (costs money, ADR-0012). *Confidence*: 0.7 — because the wording is a judgement call and the sponsor may prefer narrower scope words. *If wrong*: if moderated sessions show testers still don't know what to ask after B, this flips to C.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-SOCIAL-TEXT: What should the fixed small-talk replies say?
- Status: unanswered — only matters if QST-SOCIAL-PATH is A or B
- Why asking: under A or B these replies are shown to testers word for word, like the escalation and refusal cards, so they need approved wording. Drafts below are written at a plain reading level for older adults.
- Need: approve, edit, or replace (any shape answers)

Options:
- **A — the drafts as written**:
  - *Greeting*: "Hello! I can answer general questions about diabetes, like eating, blood sugar, and everyday care. What would you like to know?"
  - *Thanks*: "You're welcome. Is there anything else you'd like to ask?"
  - *Goodbye*: "Take care. If you feel unwell, use the red Get help now button or call your care team."
  - *Who are you / what can you do*: "I'm a computer assistant, not a nurse or doctor. I can answer general questions about diabetes from material your care team approved. I can't give advice about your medicine doses. For that, please call your care team."
- **B — Kay's or the sponsor's own wording**: replace any of the above.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — the drafts as written**, with the sponsor asked to confirm them in the same email as the card review. *Rationale*: the "who are you" reply states the limits ADR-0005 and ADR-0006 set (not a clinician, no dose advice, help button), which testers otherwise learn only by hitting them. *Confidence*: 0.6 — because wording for older adults is the sponsor's expertise, not Nibble's. *If wrong*: if the sponsor rewrites them, B.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending QST-SOCIAL-PATH.

**If A (sketch, for review before building)**:
- `src/lib/chat/social.ts`: `socialIntent(message): 'greeting' | 'thanks' | 'goodbye' | 'about' | null`, matching only when the whole message is small talk (after trimming punctuation and filler words).
- `turn.ts`: after the classifier and the escalation step, if `tier === 'none'` and `socialIntent` is set, push a new `{ kind: 'social'; intent }` card and return; no answer model.
- Logged like other turns, with the intent in `triage_events.detail`.
- Tests: "hi", "Hello there!", "thanks so much" → social; "hi, what should I eat?" → normal path; "hi, my sugar is 400" → escalation, not social.

---

## Action Items

- [ ] Kay answers QST-SOCIAL-PATH, QST-NO-INFO-TEXT, QST-SOCIAL-TEXT. Owner: Kay
- [ ] Build the chosen path with its tests; gate; deploy with Kay's OK. Owner: Nibble
- [ ] Add the fixed texts to the clinical sponsor's review. Owner: Kay

---

## Iterations

### Iteration 1 (2026-11-17)
- Trigger: Kay's "hi" got "I don't have information on that" on the live site; Kay asked about field practice and said "yes" to an ADR.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Problem traced from the production log; field practice summarized; options and recommendations for three questions.
- Outcome: Draft (three questions open)

---

## Links

- Related ADRs: [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (answer path and the guard), [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md) (triage runs first), [ADR-0013](0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md) (approved fixed text, sponsor review), [ADR-0014](0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md) iteration 6 (where this was found)
- Related code: `src/lib/chat/turn.ts` (the turn, `no_info`, `NO_INFO`), `src/lib/chat/guard.ts` (`no_citation`), `src/lib/chat/prompts.ts` (the "no information" wording)
