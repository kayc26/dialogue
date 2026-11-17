<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0018: Retrieval: whole curated topic sections chosen by the classifier

- **Date**: 2026-11-17
- **Iteration**: 5
- **Status**: Implemented
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Kay's other prototype (`kayc26/diabetes_chatbot`) answers better mainly because of what it gives the model: whole, hand-curated topic sections picked by a model that understands the question, where DIAlogue gives four word-matched fragments. Recommendation: adopt its retrieval (curated sections, chosen by the classifier DIAlogue already runs) and keep DIAlogue's safety layers.

---

## Originating Context

**Source**: Kay, 2026-11-17: "can you review https://github.com/kayc26/diabetes_chatbot - why the answer there is so much better". Preceded by the live hike answer (ADR-0013 iteration 24), which answered how to treat a low instead of what to eat after exercise.

**Agency Grant**: Review and explain; any change to DIAlogue is Kay's decision.

---

## Explicitation

**What the other bot does** (read from its `main.py`, `kb_curated/README.md`, `DECISIONS.md`, at commit `d689106`):

1. **Hand-curated topic folders.** The same ADA material (the type 1 guide split by page range, Plan Your Plate, portions, nutrition FAQs, sugar substitutes, exercise, liver health) and the team FAQ, sorted into 10 folders: `low_blood_sugar`, `high_blood_sugar`, `food`, `activity`, `daily_life`, and so on. Plus `always/` (when to get help), sent every time. About 82,000 characters in all. **No book.**
2. **A model picks the topic.** One short call sorts the latest message (with the last few messages, so follow-ups route) into one or two folders.
3. **Whole sections go to the answer model**: every document in the chosen folders, typically 5,000–15,000 characters, so the model reads the material as written, not in pieces.
4. **Prompt rules** close to DIAlogue's, plus: "Answer the specific question asked, directly, in the first sentence", "ask one short question first" when context is missing, prefer the team FAQ.
5. **What it doesn't have**: no fixed triage rules or escalation alerts (one prompt rule), no answer check (no citation, number or dose-advice checks), no dose refusal, no monitor; citations are document names at the end. Terminal only.

**What DIAlogue does** (`src/lib/chat/retrieve.ts`, `turn.ts`): BM25 word search over 472 passages (median about 600–870 characters; 340 of them from the book), the top 4 above a score threshold, with everyday-word expansion and type 1/type 2 ranking.

**Evidence** (`scripts/ephemeral/2026-11-17-search-compare.ts`, no model calls), what DIAlogue's search hands the answer model:

| Question | DIAlogue's top passages | The other bot's folder |
|---|---|---|
| what can i eat after a hike | treating a low; time-in-range targets; the plate method. The ADA exercise section is in the knowledge base but never reaches the top 4: "hike" isn't in it, and the type 2 ranking pushes the type 1 guide down. | `activity` (the whole exercise section and the exercise one-pager) |
| Why is my blood sugar high? | complications; eating patterns; how to get screened; sugar substitutes. None says why. | `high_blood_sugar` (causes, ketones, what to do) |
| I am still hungry between meals | the team FAQ answer first (good), then a book tip, time-in-range, portions | `food` (team FAQ plus plate and portions) |
| Can I drink coffee? | the team FAQ, the plate's drinks line, two book passages | `food` |

**What I understand**:

1. **The gap is retrieval, not the model.** When word search finds the right passage (hunger, coffee: the team FAQ), DIAlogue's answers are fine. When the question's words aren't in the text ("hike", "why … high"), it hands the model nearby fragments, and the model answers the nearby question. A model choosing a topic understands "hike" means exercise.
2. **Fragments read worse than sections.** A passage cut at about 700 characters loses its heading and its context (TD-5, TD-6); a whole section keeps both.
3. **The book adds noise.** 72% of DIAlogue's passages are the book's; it often fills the remaining slots with tips that crowd out ADA material.
4. **DIAlogue's checks cost some fluency, on purpose.** Trimming book numbers, blocking uncited answers and falling back to passages makes some answers choppier. The other bot has none of these, so its answers read better partly because nothing stops them.
5. **Cost.** Whole sections mean several thousand more input tokens per answer. Not yet measured with DIAlogue's models.

**Assumptions**:

- The checks stay. Sections don't change the guard: citations can name a section id, and numbers are checked against the cited section's text.
- The classifier already runs on every message, so choosing a topic can be added to its reply rather than adding a call.

**Not about answers, but noticed**: `kayc26/diabetes_chatbot` is **public** and commits the extracted ADA text (`kb/`, `kb_curated/`) and the team FAQ. DIAlogue keeps source text out of git on purpose (README: "The source text is copyrighted and is never committed").

---

## Questions

### QST-RETRIEVAL-SHAPE: How should DIAlogue find the material it answers from?
- Status: answered
- Why asking: DIAlogue's word search hands the answer model four short fragments, and when the question's words aren't in the text it returns nearby material (the hike question got low treatment). Kay's other prototype answers better by sending whole hand-curated topic sections chosen by a model. See the table in the Explicitation.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — curated sections, chosen by the classifier**: build topic sections from the FAQ and the ADA material, like the other bot's folders, by hand and reviewable. The safety classifier, which already runs, also returns one or two topics. The answer model gets those whole sections plus "when to get help". All checks stay: triage rules, dose refusal, the guard (citing section ids; numbers checked against the cited section), the monitor. The book becomes optional (QST-RETRIEVAL-BOOK).
- **B — keep word search, fix its inputs**: bigger, section-sized passages; more everyday-word expansions ("hike" → exercise); drop or demote the book. Cheapest change; still misses any question phrased in words the lists don't anticipate.
- **C — meaning-based search (embeddings)**: search by meaning instead of words. Finds "hike" → exercise without lists, but needs an embedding model call per question and per passage, and the results are harder to review than folders.
- **D — both A and word search**: A as the main path; word search as a fallback when the classifier picks no topic.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — curated sections, chosen by the classifier.** *Rationale*: the comparison above shows the failures come from what reaches the model, and A is the approach already shown to work on the same sources in Kay's other prototype. It costs no extra call (the classifier is already there), the sections are small enough to review by hand (the other bot's are 82,000 characters), and every DIAlogue check still applies to what the model writes. B patches symptoms one word list at a time; C adds a dependency for a corpus small enough to curate. *Confidence*: 0.7 — because the gain in the other bot is partly from having no checks, which A keeps; and the extra input cost per answer isn't measured yet. *If wrong*: if a side-by-side run on the same questions shows A's answers no better once the guard applies, or the cost is too high for the $1 cap, this flips to B.

**ANS:** (by Kay)
a

---

### QST-RETRIEVAL-BOOK: What happens to the book?
- Status: answered
- Why asking: *Bright Spots & Landmines* is 340 of DIAlogue's 472 passages. It adds practical tips, but it is one person's experience, its numbers already don't count for the guard (ADR-0013), and it often crowds ADA material out of the four slots. The other bot doesn't use it.
- Need: pick a letter (or override)

Options:
- **A — drop it**: answers come from the team FAQ and ADA only.
- **B — its own topic**: a "practical tips" section the classifier can pick when the question asks for tips or experience.
- **C — keep it in every section**: mixed into each topic, as now.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**B — its own topic.** *Rationale*: keeps the tips Kay chose to include (ADR-0013) without letting them crowd out ADA material on clinical questions. *Confidence*: 0.6 — because curating 340 book passages into a section is real work, and A is simpler if the tips aren't missed. *If wrong*: if the side-by-side run shows answers don't lose anything without it, this flips to A.

**ANS:** (by Kay)
c

---

## Decision

### Chosen (Kay, 2026-11-17)

- **QST-RETRIEVAL-SHAPE: A** — curated topic sections, chosen by the classifier; every DIAlogue check stays.
- **QST-RETRIEVAL-BOOK: C** (Nibble recommended B) — the book stays mixed into each topic, as now.

**Sizes, measured after the answers** (`kb/out/passages.json`): the book is 222,000 characters; the ADA material and the team FAQ together about 94,000. Its chapters map onto topics (Food, Exercise, Mindset, Sleep), so the book's food chapter alone would be several times the ADA food material. How much of it goes into each answer is open (see Iteration 2).

Plan: build the sections (reviewable files, outside git like the rest of the source text), extend the classifier's reply with a topic, swap retrieval in `turn.ts`, keep the guard and monitor, and run the same questions side by side (old vs new) before deploying. Cost measured in that run.

---

## Action Items

- [x] Kay answers QST-RETRIEVAL-SHAPE (A) and QST-RETRIEVAL-BOOK (C). Owner: Kay
- [ ] Kay decides whether `kayc26/diabetes_chatbot` should stay public with the ADA text and team FAQ in it. Owner: Kay

---

## Iterations

### Iteration 1 (2026-11-17)
- Trigger: Kay asked why the other prototype's answers are better.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Read the other bot; compared what each hands its answer model for four questions; two questions with recommendations.
- Outcome: Draft (two questions open)

### Iteration 2 (2026-11-17)
- Trigger: Kay answered A and C.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision filled in. Measured the sources: the book is 222,000 characters against about 94,000 for ADA and the FAQ, so sending whole book chapters with each topic would multiply the text per answer. Nibble asked Kay how much of the book goes into each answer.
- Outcome: Draft → Accepted

### Iteration 3 (2026-11-17)
- Trigger: Kay chose "best few passages" for the book, then "no, push and I'll test myself" instead of the side-by-side run.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - `src/lib/chat/topics.ts`: 10 topics plus "always" (when to seek help); FAQ and ADA passages assigned by hand by id; the book's chapters by id range (start → basics, food, mindset → support, exercise → activity, sleep → daily_life).
  - The classifier's reply gains `topics` (up to two, checked against the list); still one call.
  - The answer model reads those sections whole (care-team FAQ, then ADA with the patient's own type first) plus the 4 best book passages from the matching chapters (score ≥ 2). No topic, no loaded passages, or a failed classifier: word search's top 4, as before.
  - Unchanged: dose passages hidden, the guard, the monitor. A blocked answer falls back to the most relevant routed passage. The answer prompt adds the other bot's rule: answer the question directly in the first sentence.
  - Logged: `triage_events.detail.topics` and `retrieval` (`topics` or `search`).
  - Section sizes (`scripts/ephemeral/2026-11-17-topic-map-check.ts`): ~1,700 characters (high blood sugar) to ~19,000 (food). High blood sugar is thin because most of its ADA passages are dose-tagged and hidden.
  - Tests: 6 new (292 total); the hike regression test fails without the routing.
  - Side-by-side run skipped at Kay's request; Kay tests on the live site. Cost per answer to be read from `llm_spend`.
- Outcome: Accepted → Implemented

### Iteration 4 (2026-11-17)
- Trigger: Kay liked the live result, then asked what else to learn from the prototype; "sounds good" to four borrowings.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - **Routing test** (from the prototype's `test_questions.txt` and `run_tests.py`): `kb/routing-questions.txt` (38 questions written for this file, expected topics; "a / b" accepts either) and `npm run kb:eval-routing` (classifier only, about $0.001 per run; report in `kb/out/eval-routing.md`).
  - **Classifier**: unwell without a reading → both low_blood_sugar and high_blood_sugar (from the prototype); choose two topics when a question touches two (eating after exercise: activity and food).
  - **Answer instructions** (from the prototype): no examples or foods from the model's own knowledge, and don't list items under a general group the passages don't list (the guard checks numbers, not foods); the person's own care-team plan comes first.
  - **Topic map**: glucagon passages (t1-025, t1-060) also in medicines_devices; support's description spelled out (doctor visits, information found online).
  - Results: run 1, 31/38 ($0.0011); after the fixes, 34/38 ($0.0013). The hike question now routes to activity. Still failing: swimming → monitoring (defensible); glucagon → basics (it went to medicines_devices in run 1: the small classifier varies between runs); "I'm fainting" → low only (an emergency, so the 911 alert comes first anyway); doctor's appointment → daily_life. Tuning stopped there to avoid fitting the prompt to one test set.
  - Not borrowed yet: asking one clarifying question when context is missing. The guard would block a question with no citation, and ADR-0008 plans structured follow-ups; needs its own decision.
- Outcome: Implemented

### Iteration 5 (2026-11-17)
- Trigger: Kay: "clarifying questions are fine if not sure", then "yes" after comparing citations with the prototype (which names whole documents at the end and checks nothing).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - **A narrow exception to ADR-0005's "every model-written answer cites"**: `clarifyingQuestion` in `guard.ts` lets an uncited reply through only if it is one sentence ending in "?", at most 30 words, with no dose advice and no number the patient didn't write. Anything else uncited is still blocked.
  - The answer instructions allow one short question when a missing detail would really change the answer; never about doses.
  - Shown as a plain question (`clarify`); the stored reply keeps the question, so the next turn's model sees it.
  - Not the same as ADR-0008's structured follow-up questions (on hold for the sponsor), which collect fields for the nurse summary.
  - Tests: 4 new (296 total).
- Outcome: Implemented

---

## Links

- Related ADRs: [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (answer path), [ADR-0007](0007-diabetes-education-bot-a-second-model-that-monitors-the-conversation.md) (monitor), [ADR-0013](0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md) (knowledge base, the book's role; iteration 24, the hike answer), [ADR-0014](0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md) ($1 cap)
- Related code: `src/lib/chat/retrieve.ts`, `turn.ts` (steps 4–6), `prompts.ts` (`CLASSIFIER_SYSTEM`, `ANSWER_SYSTEM`)
- External: `kayc26/diabetes_chatbot` at `d689106` (`main.py`, `kb_curated/`)
- Debt: TD-5, TD-6 (chunking)
