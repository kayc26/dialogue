<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0005: Diabetes education bot — architecture and answer path

- **Date**: 2026-11-14
- **Iteration**: 8
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Decided: constrained RAG over ADA's education library, run by Harness's agent loop. The safety gate runs before the loop, and a dose gate after it: fixed-rule checks, dose passages shown word for word, and a conversation monitor (ADR-0007). The regimen never reaches the model, nothing from ADA is published until ADA gives permission, and the bot is the one working part inside a static portal shell.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-14), verbatim excerpt:

> I'm designing a diabetes education chatbot for elderly adults, as a proof of concept for a class project using synthetic patient data (no real PHI). Requirements:
> - Answers general diabetes questions using only clinician-approved educational content. I want to compare two options: strict retrieval that returns approved text verbatim, vs. RAG with LLM generation constrained to retrieved content. Recommend one and say why.
> - Detects urgent situations (hypo/hyperglycemia symptoms, DKA signs, distress) and escalates to a nurse hotline or 911. Hard constraints: the escalation path is always reachable regardless of classifier output, the bot never gives insulin dose adjustment advice, and false negatives are far costlier than false positives.
> - Stores a per-user reference of their insulin regimen and optionally CGM data. For now this is read-back only, the bot does not reason over CGM trends to personalize clinical answers.
> - UI must work for low-vision, low-tech-literacy users: large type, optional voice input/output, minimal navigation depth.
>
> Give me a proposed architecture: components, data flow, where the safety checks sit, and the main trade-offs. Flag anything that would have to change if this ever handled real PHI. Don't write code yet.

**Agency Grant**: Propose an architecture and recommend an answer path. No code yet.

---

## Explicitation

**What I understand**:

1. **The answer path is the main design choice.** "Clinician-approved content only" can be guaranteed by structure (the user only ever sees approved text) or only probably (a model rewrites approved text and a check tries to catch drift). Which one we pick decides whether "never gives dose advice" is something the design guarantees or something we have to test for.
2. **Safety is a separate thread.** It has its own record: ADR-0006 covers triage, escalation, and the always-reachable help path.
3. **The regimen store is read-back only.** That makes it a display feature, not an input to the model.
4. **The UI constraints affect the architecture, not just the styling.** Voice means speech-to-text errors feed into triage. Low vision means streamed, flickering text is a problem. Shallow navigation means one screen.

**Assumptions**:

- This builds on Harness: browser-only, OpenRouter, `localStorage` (ADR-0001..0003). It is a demo on synthetic data for a class project, not something real patients will use. *(Iteration 6: the knowledge base sits in a BE5280 team folder, so this is a team project.)*
- "Clinician-approved" means a fixed corpus that a named person signed off on. Who that person is for a class project is still open (see Open Follow-ups).

**Confirm**: Kay. Is this a new direction that replaces the portal assistant (ADR-0004), or something separate? See QST-DIAB-VS-PORTAL.

---

## Proposed architecture

*Iteration 3: Kay's answers replace parts of this proposal (answer generation, orchestration, the portal shell). The **Decision** section below is current wherever the two disagree. This section stays as written, as the record of what was proposed.*

### Components

1. **UI shell.** A single screen with three large, always-visible controls: **Ask** (with a microphone button and a text box), **My insulin**, and **Get help now**. The help control is static markup outside the chat pipeline (ADR-0006). Answers appear all at once, never streamed token by token, and are read aloud on request.
2. **Input adapter.** It takes text, or a voice transcript from the browser's speech recognition. It shows "I heard: …" so the user can catch a mis-transcription, but triage runs on the raw transcript at once and does not wait for the user to confirm.
3. **Safety gate (ADR-0006).** A local rules layer runs first and synchronously. A model-based classifier runs in parallel, and the two are OR-combined. The gate also runs a **dose-intent detector**: any question asking how much insulin to take, or whether to change a dose, gets a fixed refusal card plus the care-team contact.
4. **Router.** Deterministic code, not the model, picks the branch, in priority order: escalation, then dose refusal, then regimen read-back, then education answer, then the "no approved answer" fallback.
5. **Approved content store** (revised in iteration 2). ADA's patient-education library, split at headings into sections and paragraphs. Each one carries an id, the ADA page title and URL, the section heading, the snapshot date, and tags: urgent topic, medication, or excluded for dose content (QST-DIAB-DOSE-BOUNDARY). Pages that aren't education (donations, advocacy, events) are left out. Where the corpus lives is QST-DIAB-CORPUS-HOSTING, because ADA's material is copyrighted and this repo is public.
6. **Search, then select** (revised in iteration 2). The library is far too big for one prompt, so an in-browser keyword index (BM25) shortlists about 10 sections. The model receives the question and the shortlist and returns `{section_id, paragraphs}` or `{none}`. Code checks that the section is on the shortlist and that the range is whole paragraphs of it, and rejects anything else (QST-WHICH-APPROACH-SHOULD-I). If the model call fails, the top three section titles appear as large "Did you mean…?" buttons. Below a search-score threshold, the bot says "I don't have information on that from ADA" and offers the nurse line.
7. **Regimen and CGM store.** Synthetic profiles in `localStorage`, seeded from a fixture and optionally loaded from a CGM CSV. A deterministic template reads them back, with a date and a fixed disclaimer: "This is what's on file as of {date}. Your care team's latest instructions come first." **The model never sees this data.**
8. **Eval suites.** The deterministic layers (rules, dose-intent patterns, router, templates) are tested in `vitest` and run in the gate. A separate scripted eval against the pinned live model measures classifier recall and selector accuracy. It is not in the gate, because each run costs API credit.

### Data flow

```
voice/text ─▶ input adapter ─▶ SAFETY GATE ──────────────────────────────┐
                                 │ rules (local, sync) ─┐                 │
                                 │ LLM triage (async)  ─┴─ OR ─▶ tier     │
                                 │ dose-intent detector ──────▶ flag      │
                                 ▼                                        │
                              ROUTER (code) ── tier≥urgent ─▶ escalation card (+ approved urgent card)
                                 │ ─ dose flag ─▶ fixed refusal card + care-team contact
                                 │ ─ "my insulin" intent ─▶ regimen template (local data, no LLM)
                                 │ ─ else ─▶ BM25 shortlist ─▶ LLM picks section + paragraphs ─▶ ADA excerpt verbatim + link
                                 │                                   └ none ─▶ "no approved answer" + nurse line
                                 ▼
                         render (sanitized, large type) ─▶ optional TTS of the same approved text

[Get help now] — static, outside this pipeline, works with no network and no model
```

### Where the safety checks sit

- **Before the answer.** Triage and the dose-intent check run on every message, and nothing renders until the router has their result. The rules layer is instant, so the most serious cases never wait on the network.
- **In the structure, plus one corpus filter.** Answer text comes only from ADA excerpts and templates, so the model has no output channel through which to *write* dose advice. ADA's own text can still *contain* dose guidance, though, so passages about calculating or changing doses are removed before indexing (QST-DIAB-DOSE-BOUNDARY). That filter, not the model, is now the part that needs review.
- **Outside the pipeline.** The help button does not depend on any classifier result (ADR-0006).

---

## Questions

### QST-DIAB-ANSWER-PATH: How should the bot produce answers to education questions?
- Status: superseded — by QST-WHICH-APPROACH-SHOULD-I (Kay's answer replaced the curated card set with ADA's whole library, so the choice is re-asked there)
- Why asking: Kay asked for a comparison of strict verbatim retrieval with RAG constrained to retrieved content, and a recommendation. The users are older adults, the content must be clinician-approved, and the bot must never give insulin dose adjustment advice. This choice decides whether "approved text only" is guaranteed by the design or measured by tests.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Verbatim, lexical match**: No model in the answer path. Keyword or BM25 matching against card question phrasings, and the matched card is shown exactly as written. Fully deterministic and testable, but it misses paraphrases ("my sugar's low" vs "hypoglycemia"), especially with voice transcripts.
- **B — Verbatim, model-selected**: The model reads the question and the card index and returns only a card id (or "none"). The user sees the approved card exactly as written. Code validates the id. The model handles paraphrase and messy speech, but it cannot write a word the user reads.
- **C — Constrained RAG**: Retrieve the top cards, then have the model write an answer "using only" them, with an output check (for example, numbers must appear in the source, and no insulin-plus-units patterns). Fluent, and it can combine cards and tailor phrasing, but every answer is new text no clinician has seen, and grounding holds only most of the time.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Verbatim, model-selected.** *Rationale*: The requirement is that users see *clinician-approved* text. Under C, each answer is a new paraphrase, so no clinician has approved it. Paraphrase drift tends to hit exactly the safety-critical details: "15 grams" becoming "15–20 grams", or two cards merged into a claim neither card makes. A post-hoc check can catch some of this but not prove its absence. Under B, approval and the no-dose-advice rule hold by construction: the model's only output is an id, and an invalid id is rejected. B keeps the model where it helps, which is understanding paraphrased, misspelled, or mis-transcribed questions, a weak spot for A. B's costs are stilted answers, no combining of cards, and more "no approved answer" replies. All three are acceptable, even good, for this audience: the same answer every time, which can be read aloud at the same pace, is easier for low-literacy users. Coverage gaps become a list of cards to write, not a risk. *Confidence*: 0.8 — because this follows from the stated constraints rather than from measurement. I have not tested selector accuracy on elderly or voice phrasing. *If wrong*: if the selector eval shows the "none" rate is too high for the demo to work (for example, over 30% of realistic questions go unanswered even after adding cards), flip to **C** for low-risk topics only, with urgent and medication topics kept on **B**. If the class assignment is specifically to evaluate RAG, build **C** as the comparison arm and keep **B** as what ships.

**ANS:** (by Kay)
I'm feeding in entire ada's education material

**Follows up on**: adr:0005#qst-which-approach-should-i

### QST-WHICH-APPROACH-SHOULD-I: which approach should i choose
- Status: answered
- Why asking: opened as a follow-up at answer time — the question above was answered, but this specific part was left open rather than silently dropped. Context: the knowledge base is the American Diabetes Association's entire patient-education library, not a short list of cards written for this bot. That changes three things. It is too big to fit in one prompt, so a search step must shortlist passages first. Its pages are long and written for a general audience, not for older readers with low literacy. And some of it explains how insulin doses are calculated or changed. The hard constraints still hold: users see only approved text, and the bot never gives insulin dose adjustment advice.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Verbatim section**: In-browser keyword search shortlists about 10 sections of ADA pages. The model picks one section id, and the whole section is shown and read aloud as written, with its ADA title and link. These are exactly ADA's words, but an answer can run several paragraphs.
- **B — Verbatim excerpt**: Same shortlist. The model picks the paragraph(s) within a section that answer the question. Code checks that the excerpt is made of whole, unaltered paragraphs from that section and rejects it otherwise. The user sees ADA's own words, shorter, with "Read the full section" below. The risk is that a paragraph taken out of its section loses a warning that was in the next paragraph.
- **C — Constrained RAG**: Same shortlist. The model writes a short, plain-language answer from the retrieved sections, with citations and output checks. This is the shortest and easiest to read, but it is new text, not ADA's, and labelling it "from ADA" attributes to ADA words it never wrote.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Verbatim excerpt.** *Rationale*: B keeps the guarantee from my earlier pick: the user sees only approved text, and the model only outputs ids and paragraph ranges that code checks. It also fixes the problem the ADA library introduces, which is length. Whole sections (A) are too long to read in large type or to listen to. The pull toward C is stronger now, because ADA pages aren't written for this audience. But simplifying is exactly where meaning drifts, and with ADA named as the source, a paraphrase becomes misattribution. B's out-of-context risk is reduced two ways: excerpts are whole paragraphs only, and sections tagged as medication or urgent are always shown in full. *Walk-back, stated explicitly*: my earlier pick (model-selected card) assumed a small curated corpus. That assumption no longer holds, so the unit changes from card to paragraph. The preference for verbatim over generated text has not changed. *Confidence*: 0.75 — because I haven't tested this on real ADA passages, and paragraph-sized excerpts may turn out to be the wrong size. *If wrong*: if excerpts often read as incomplete or misleading in a review of about 30 sample questions, flip to **A**. If test users can't follow ADA's wording even in short excerpts, the fix is content (a plain-language card set a clinician signs off), not **C**.

**ANS:** (by Kay)
option c

---

### QST-DIAB-ORCHESTRATION: Does the bot reuse Harness's agent loop, or run a fixed pipeline?
- Status: answered
- Why asking: Harness v1 (ADR-0003) is an agent loop in which the model decides which tools to call, capped at 8 rounds. Here the hard constraints require triage on every message, no dose advice, and help always reachable. An agent loop puts the model in charge of control flow, so the model could skip a safety step.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Fixed pipeline**: Code always runs the safety gate, then the router, then a selector or template, in that order. The model is called only as a bounded classifier or selector that returns JSON, and the JSON is validated. Harness's OpenRouter client, sanitized rendering, and storage are reused. The agent loop is not.
- **B — Agent loop with tools**: The model receives `triage`, `search_cards`, and `read_regimen` tools and decides which to call. Code then checks that `triage` ran before any answer is rendered. This reuses more of Harness and is easier to extend, but the safety ordering becomes a policy the code enforces after the fact.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Fixed pipeline.** *Rationale*: All three hard constraints are statements about every message, which matches code-enforced ordering, not model judgment. A also lets the deterministic layers be tested in `vitest` under the existing gate (ADR-0002). The agent loop's strength, open-ended tool use, is exactly what this bot must not do. *Confidence*: 0.85 — because the constraints make this argument directly. The only uncertainty is whether the class wants agent behavior to be visible. *If wrong*: if the project is graded on agentic behavior, flip to **B** and keep the safety gate *outside* the loop, so it runs before the loop starts and not as a tool.

**ANS:** (by Kay)
b

---

### QST-DIAB-VS-PORTAL: How does this bot relate to the portal-assistant direction in ADR-0004?
- Status: answered
- Why asking: ADR-0004 (still a draft, its question unanswered) asked whether "a chatbot on the patient portal" should be a mockup, a portal-style Harness over a demo inbox, or a real integration. This diabetes education bot is a different product: education plus triage, not message search. The answer decides whether ADR-0004 is superseded, merged, or left alone.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Replaces it**: The diabetes bot is the project. Mark ADR-0004's question superseded by this ADR. The portal mockup stays in the repo as history.
- **B — Shell plus content**: The portal layout from ADR-0004 is the container, and the diabetes bot is the assistant inside it. Note that the portal's dense navigation conflicts with this ADR's single-screen accessibility goal.
- **C — Separate projects**: Two tracks. The diabetes bot gets its own app or route, and ADR-0004 stays open on its own.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Replaces it.** *Rationale*: The new prompt is far more specific (users, constraints, data) than ADR-0004's, which reads like an early sketch of the same class project. B runs into the "minimal navigation depth" requirement, because a message center is several levels deep. *Confidence*: 0.5 — because I'm inferring the relationship. Only Kay knows what the assignment is. *If wrong*: if the assignment is specifically about patient-portal integration, flip to **B**, with the accessibility work applied to the portal too.

**ANS:** (by Kay)
b

---

### QST-DIAB-CORPUS-HOSTING: Where does the ADA corpus live, given this repo is public?
- Status: answered
- Why asking: Kay's knowledge base is ADA's entire patient-education library. That material is copyrighted. This repo (`kayc26/harness`) is public and deploys to public GitHub Pages, so committing the corpus, or bundling it into the site, would republish ADA's library publicly. ADA's website terms of use may also restrict collecting the site's content automatically. I haven't checked them yet.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Local-only corpus**: The corpus files sit in a gitignored folder. The page imports them at runtime into the browser's IndexedDB (`localStorage`'s ~5 MB limit is too small) and builds the search index there. No ADA text is in the repo or the public site. The demo runs on Kay's own machine or device.
- **B — Private deployment**: The corpus and app are served privately: run locally with `vite preview`, or from a password-protected host. GitHub Pages for a public repo on a free account can't be made private.
- **C — Permission first**: Ask ADA for permission to use the material in a class project, then publish within whatever they allow.
- **D — Link-out**: Store only titles, URLs, and the search index. The bot replies "ADA covers this here: [link]", and the user reads it on ADA's site. Nothing is republished, but the accessible UI ends at the link.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Local-only corpus**, with **C** started in parallel if Kay wants a public demo. *Rationale*: A keeps the full design (verbatim excerpts, large type, read-aloud) and puts no copyrighted text in a public place. It costs one import step, which Kay does once on the demo device. *Confidence*: 0.6 — because I haven't read ADA's terms of use, and the course may have its own guidance. Route this to course staff too. *If wrong*: if ADA's terms forbid automated collection outright, A doesn't solve that. Flip to **C**, or **D** while waiting.

**ANS:** (by Kay)
c

---

### QST-DIAB-DOSE-BOUNDARY: Where does insulin education end and dose advice begin, for filtering the ADA corpus?
- Status: answered
- Why asking: The hard constraint is that the bot never gives insulin dose adjustment advice. With curated cards, that held by construction. ADA's library includes insulin material, such as what correction factors and insulin-to-carb ratios are, how doses are worked out, and sick-day guidance. Shown verbatim, some of those passages *are* dose advice, in ADA's words. So passages must be tagged before indexing, and someone has to decide where the line falls. For either option, tagging works the same way: a keyword sweep (units, dose, ratio, correction, sliding scale…) plus model tagging, then a person reads every flagged passage. Excluded passages are listed in a file so the boundary can be reviewed.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Strict**: Exclude every passage that explains how to calculate, choose, or change an insulin dose, including correction-factor and carb-ratio arithmetic and sick-day dosing. Questions on those topics get the fixed "your care team can help with doses" card.
- **B — Narrow**: Exclude only passages that tell the reader to change their own dose. Keep passages that explain concepts (what a correction factor is), even if they include worked examples.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Strict.** *Rationale*: A worked example ("if your correction factor is 50 and you're at 250, take 2 units") is a dose calculation however it's framed. For older readers on a large-type screen, the line between explanation and instruction won't hold. The cost is that some legitimate questions get the care-team card, and that is the trade the constraints already accept. *Confidence*: 0.8 — because the hard constraint is explicit. What's uncertain is how much of ADA's insulin content A removes. *If wrong*: if a clinician reviewer judges the explanatory passages safe, and A removes most of the insulin topic, flip to **B**, with that reviewer signing off on the passages kept.

**ANS:** (by Kay)
b

---

### QST-DIAB-DOSE-GUARD: With generated answers, what enforces "never gives insulin dose adjustment advice"?
- Status: answered
- Why asking: The hard constraint is that the bot never gives insulin dose adjustment advice. Three answers in this ADR now combine. The model writes the answers (constrained RAG, QST-WHICH-APPROACH-SHOULD-I: C). It runs its own loop of tool calls (QST-DIAB-ORCHESTRATION: B). And the corpus keeps ADA passages that explain dose arithmetic with worked examples (narrow boundary, QST-DIAB-DOSE-BOUNDARY: B). Nothing in the structure now stops the model from applying a worked example to a user's numbers ("you're at 250, so take 2 more units"), so something has to check every answer.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Output gate**: Every final answer passes a deterministic check (insulin words near a number with units, "take N units", ratio or correction arithmetic) and a classifier call. Any hit, error, or timeout replaces the whole answer with the fixed "your care team can help with doses" card. The gate runs after the loop ends, outside it, and its deterministic part is tested in the gate (`vitest`).
- **B — Prompt and classifier**: The system prompt forbids dose advice, and a classifier reviews each answer. No deterministic check.
- **C — Output gate plus verbatim-only dose passages**: Everything in A, and in addition passages tagged as dose-related are never given to the model to rewrite. When one is the best match, it is shown word for word with a "Talk to your care team before changing any dose" header. Kay's narrow boundary still decides which passages stay in the corpus.
- **D — C plus a conversation monitor** *(added in iteration 4, from Kay's proposal)*: Everything in C, plus a second model that reads the whole conversation and each draft answer before display. It can veto the draft or raise the escalation tier, but never write user-facing text. It catches dose advice built up across several turns, which per-answer checks can't see. Its design is in ADR-0007.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**D — C plus a conversation monitor.** *Revised in iteration 4, stated explicitly*: I first recommended C, and Kay's monitor proposal exposed a gap C doesn't cover. A user can assemble a dose calculation over several turns ("what's a correction factor?" → "mine is 50, I'm at 250" → "so what's that come to?") while every single answer passes the per-answer checks. D adds the one check that sees the whole conversation. Everything below is the original case for C, which D includes. *Confidence for D*: 0.75 — lower than C's, because the monitor adds a second model to pin and test, and its benefit is unmeasured until ADR-0007's multi-turn test set runs. *If wrong for D*: if the multi-turn set shows the monitor catching nothing that C misses, drop back to **C**.

*Original rationale for C*: A catches the obvious failures with a check we can test. C also removes the input that makes the dangerous output likely: a model that never has worked dose arithmetic in its context is unlikely to produce it. B depends on the model behaving, and a hard constraint can't rest on that. C keeps the explanatory passages that Kay's narrow boundary chose to keep, but shows them in ADA's words, not the model's. *Confidence*: 0.8 — because the risk is concrete and C costs little. What I haven't tested is how often the deterministic check fires on ordinary answers about carbs and glucose numbers. *If wrong*: if the check blocks many ordinary answers (carb counting in grams, for example), narrow its patterns to insulin units and keep **C**. If Kay wants the model to explain those passages in plain language, flip to **A**.

**ANS:** (by Kay)
d

---

### QST-DIAB-PORTAL-SHELL: Is the portal a static shell around a working diabetes assistant?
- Status: answered
- Why asking: ADR-0004's QST-PORTAL-TARGET was answered A: the portal stays a static mockup with no behavior. This ADR's QST-DIAB-VS-PORTAL was answered B: the portal layout is the container, and the diabetes bot is the assistant inside it. Both answers hold if the portal around the bot is static and only the bot works. Separately, a portal's Message Center is several levels deep, while the bot's spec asks for minimal navigation depth and large type.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Static shell, working assistant**: The portal layout is static decoration. The diabetes assistant is the only part that works, and it opens in a large-type, single-screen view with the help button always visible.
- **B — Two separate deliverables**: The portal mockup stays ADR-0004's design deliverable, and the diabetes bot ships as its own single-screen app.
- **C — Working portal**: Build the portal's navigation too (conversation list, Message Center), with the bot inside it. This reverses ADR-0004's answer.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Static shell, working assistant.** *Rationale*: A reconciles both answers as given. It keeps the accessibility spec intact, because the assistant view takes the whole screen, so the portal's depth never stands between the user and the bot. *Confidence*: 0.6 — because I'm reconciling two answers, and only Kay knows which one was meant to lead. *If wrong*: if the assignment grades the portal integration itself, flip to **C**. If the two were always meant as separate deliverables, flip to **B**.

**ANS:** (by Kay)
a

---

### QST-DIAB-FAQ-SOURCE: Can the team-written FAQ doc be used as approved content?
- Status: answered
- Why asking: The knowledge base Kay shared (iteration 6) has eight ADA PDFs and one **team-written** Google Doc, "FAQs", with 13 questions and answers in about 650 words. ADA's review doesn't cover the doc. The project requires clinician-approved content. Some of the doc's answers matter for safety: what to do above 250 mg/dL, when to seek care (vomiting, stomach pain, trouble breathing, confusion, positive ketones), when to take mealtime insulin, and correction insulin "if you have not taken insulin in the last 4 hours". It's also the most useful source for this audience: short, plain-language answers to the questions people actually ask.
- Need: pick a letter (or override — an answer in any shape is complete), and say who wrote it

Options:
- **A — Already approved**: A clinician on the team, or one reviewing for it (for example, an RDN or CDCES), wrote or reviewed it. Use it as-is, labeled "From your care team" rather than "ADA".
- **B — Use after review**: Keep it in the corpus marked *pending*. A named clinician reviews it before the demo, and until then the bot labels these answers as unreviewed.
- **C — Exclude**: Leave it out and use only the ADA material.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Use after review**, or **A** if a clinician already wrote or reviewed it. *Rationale*: The content fills the nutrition questions the ADA one-pagers cover only visually, in wording that suits this audience, so leaving it out (C) loses the best-fitting material. But its high-sugar answer gives insulin guidance (correction insulin and the 4-hour rule). Under the narrow dose boundary that passage gets tagged dose-related either way, so it's shown word for word and never rewritten (QST-DIAB-DOSE-GUARD: D). *Confidence*: 0.6 — because the answer depends on facts only Kay knows: who wrote it and who has seen it. *If wrong*: if the author is a clinician, flip to **A**. If no one can review it before the demo, flip to **C**.

**ANS:** (by Kay)
a

---

## Decision

Kay answered on 2026-11-14 (iteration 3). Five answers differ from my recommendations. The design below follows the answers.

| Question | Answer | My recommendation was |
|---|---|---|
| QST-WHICH-APPROACH-SHOULD-I | **C — Constrained RAG** | B |
| QST-DIAB-ORCHESTRATION | **B — Agent loop with tools** | A |
| QST-DIAB-VS-PORTAL | **B — Portal is the shell, the bot is the content** | A |
| QST-DIAB-CORPUS-HOSTING | **C — Ask ADA's permission first** | A (+C) |
| QST-DIAB-DOSE-BOUNDARY | **B — Narrow** | A |
| QST-DIAB-DOSE-GUARD *(iteration 5)* | **D — Output gate, verbatim-only dose passages, conversation monitor** | D |
| QST-DIAB-PORTAL-SHELL *(iteration 5)* | **A — Static shell, working assistant** | A |

### What changes in the architecture

- **Answers are generated.** The model writes short, plain-language answers from shortlisted ADA sections (in-browser BM25, as before) and cites the sections it used. Output checks: every number in the answer must appear in a cited section, every citation must point to a shortlisted section, and the dose gate applies (QST-DIAB-DOSE-GUARD).
- **Agent loop, with safety outside it.** This follows the "If wrong" clause of my orchestration recommendation. The safety gate (ADR-0006) runs on the user's message *before* the loop starts, and the dose gate runs on the final answer *after* the loop ends. Neither is a tool the model could choose to skip. The tools inside the loop are `search_ada` (shortlist) and `read_section`. The 8-round cap (ADR-0003) stays.
- **The regimen stays out of the loop.** Kay's original spec says the bot doesn't use the user's data to personalize answers. The read-back stays a fixed-template branch that runs before the loop, and there is no `read_regimen` tool. With dose-explaining passages now in the corpus, a model holding both a worked dose example and the user's own regimen is the most direct route to personalized dose advice. *(Iteration 7: the profile also holds three yes/no fields, `history_of_dka`, `pregnant`, and `uses_pump`. Only ADR-0006's rules code reads them, and only to raise urgency. The model never sees them.)*
- **Labeling.** Answers are generated, so they're labeled "Based on ADA material", with links to the sections used, never "ADA says".
- **Corpus.** Nothing from ADA is committed or deployed until ADA replies. Development uses local files in a gitignored folder. (My reading of C: local development isn't publishing.)
- **Portal.** The portal layout stays static, and the diabetes assistant is the one working part inside it. Confirmed (QST-DIAB-PORTAL-SHELL: A). The assistant opens in a large-type, single-screen view.

### Trade-offs accepted

- **"Clinician-approved content only" now applies to the sources, not to the text the user reads.** ADA's review covers the source passages. Every answer is new text.
- **The no-dose-advice constraint has moved from structure to checks.** Before, the model couldn't write user-facing text. Now three answers compound: the model writes the text (C), it decides its own steps (orchestration B), and it reads passages explaining dose arithmetic (boundary B). This was answered in QST-DIAB-DOSE-GUARD with **D**, which has three parts. First, a fixed-rule check runs on every final answer, outside the loop. Second, dose-tagged passages are shown word for word and never given to the model to rewrite. Third, a conversation monitor runs (ADR-0007). It checks answers before display in any session where a dose topic has come up, and in the background otherwise.
- **The dose-bait set becomes a release criterion.** These are synthetic questions that try to get dose advice. Across the set, the bot must give zero dose advice. This is in addition to ADR-0006's must-catch set.

---

## Knowledge base (iteration 6)

On 2026-11-14 Kay shared the actual corpus: the team's shared Google Drive folder (`Team1-Diabetes Shared Folder/knowledgebase`), described as "materials we can use". It is **not** ADA's entire library, as iteration 2 assumed. It's a curated set of nine documents:

| Document | Source | Words | Notes |
|---|---|---|---|
| Your Rights and Care Standards: A Guide for People with Type 1 Diabetes (32 pp) | ADA, ©2026 | ~9,200 | Rule of 15, glucagon, ketones and DKA. Some "adjust" wording to tag |
| Your Rights and Care Standards: A Guide for People with Type 2 Diabetes (20 pp) | ADA | ~4,100 | Rule of 15. Sick-day advice says "you may need to adjust the dose", so tag as dose-related |
| Plan Your Diabetes Plate | ADA | ~830 | |
| Healthy Eating for Liver Health | ADA | ~640 | Text extraction is scrambled by the circular plate graphic, so it needs cleaning by hand |
| Understanding Sugar Substitutes | ADA (by filename; not confirmed in the text) | ~550 | |
| Portion Size vs. Serving Size | ADA (by branding; not confirmed in the text) | ~570 | |
| Food & Nutrition FAQs | ADA (by branding; not confirmed in the text) | ~500 | |
| Exercise and Nutrition (InSIGHT, patient version) | ADA | ~190 | |
| FAQs (Google Doc) | **Team-written, clinician-approved** (QST-DIAB-FAQ-SOURCE: A) | ~650 | 13 Q&As. Answers drawn from it are labeled "From your care team", not "ADA". The correction-insulin passage is tagged dose-related and shown word for word |
| Clinic call-triage workflow (docx, added in iteration 7) | Clinic-internal | — | **Not answer content.** Its RED FLAGS box defines ADR-0006's URGENT tier. The rest (staff routing, scripts, scheduling) is internal operations: kept out of the corpus the bot answers from, and out of this public repo |

**What this changes:**

- **Size.** At about 17,000 words (~23k tokens), the whole corpus fits in one prompt. The decided design (BM25 shortlist, then the agent loop) still applies, because it costs far less per turn and makes citations precise. Putting the whole corpus in the prompt is now a fallback for testing, not a necessity.
- **Hosting.** The corpus stays in the team's Drive folder and is loaded on the demo device. It is never copied into this public repo or bundled into the public site. I read "materials we can use" as cleared for use in the team's project. Whether that covers *public redistribution* isn't confirmed, so the iteration-3 rule still holds: no corpus text in git or on Pages. *(Amended by ADR-0010, decision E: the chunks are loaded once from the Drive into Neon by a team script, and readable only by signed-in testers. They're still never in git or on Pages.)*
- **Urgent content is available.** The Rule of 15 (both guides), glucagon (the type 1 guide), and the FAQ's high-sugar answer and warning signs become the verbatim cards ADR-0006 shows on escalation. The FAQ uses 250 mg/dL where ADR-0006's rules used 300 (ADR-0006, QST-TRIAGE-HIGH-THRESHOLD).
- **Dose tagging is now concrete.** Known dose-related passages: the type 2 guide's sick-day advice ("you may need to adjust the dose"), the FAQ's correction-insulin and 4-hour rule, and "adjust" passages in the type 1 guide. Each is shown word for word and never rewritten (QST-DIAB-DOSE-GUARD: D). The FAQ's mealtime-insulin *timing* answer is tagged medication-related but isn't a dose.
- **Coverage is narrow.** The corpus is mostly nutrition plus the two rights-and-standards guides. Questions outside it get the "I don't have information on that" fallback with the nurse line. Log those misses as content requests to the team. Don't fill the gap with the model's general knowledge.
- **Extraction needs a hand check.** The PDFs are designed layouts (InDesign/Illustrator), so the reading order `pdftotext` gives for the one-pagers is unreliable. With nine documents, checking every chunk by hand is feasible and worth doing.

### Build and load (iteration 8)

`npm run kb:build -- --kb-dir "<team Drive knowledgebase folder>"`, then `npm run kb:load -- --yes`. The code lives in `src/lib/kb/` (tested in the gate) and `kb/`. The manifest (`kb/manifest.json`) lists file names only. All extracted text goes to git-ignored `kb/out/`.

- **Splitting**: passages of at most 180 words, each under its heading. **Headings are search hints only.** On designed layouts the detected heading is sometimes a box label (for example "Wait 15 minutes"), so citations show the **document title** and never the section.
- **Skipped, never repaired** (Kay: "you can skip infographic"). Two kinds of passage are dropped:
  - *Infographics extracted out of order.* The type 1 guide's Rule of 15 graphic comes out with its steps scrambled among "circle-N" labels. The type 2 guide's Rule of 15 is clean text and is kept, so the urgent content survives.
  - *Table-cell scraps under 7 to 8 words.* "80–130 mg/dL before meals" without its "target" label reads as a statement about the patient.

  As a result, the **Exercise and Nutrition** one-pager (almost all infographic) keeps just one passage: the resistance exercise and older-adults advice, 119 words. *(Corrected after the load: an earlier draft said it contributed nothing.)* The type 2 guide's targets table is lost. If the team wants that table, it can go into the FAQ doc as plain text.
- **The team FAQ** was exported from the Google Doc into git-ignored `kb/local-sources/FAQs.md`, without the author's internal note ("I didn't think it'd be appropriate to include specific brands…"), which is addressed to the team, not patients.
- **Tags** use deliberately broad patterns: `dose_related` (22 passages), `urgent` (28), and `medication`. Every `dose_related` passage is listed in `kb/out/review.md` for a person to check.
- **Build of 2026-11-14**: 136 passages kept and 58 skipped.
- **Loaded into production on 2026-11-14** (Kay asked for it, and Nibble ran `npm run kb:load -- --yes` against host `ep-raspy-surf-…-pooler`): 136 rows from 9 documents. Type 1 guide 72 (15 dose-related), type 2 guide 27 (6), care-team FAQs 13 (1), plate 7, portions 4, sugar substitutes 4, nutrition FAQs 4, liver 4, exercise 1. Without sign-in, `kb_chunks` returns **401**. Member-only read access is the same policy the `rls-dev` suite tests (policy fingerprints match, ADR-0011). Production has no members yet, so a signed-in read there waits for the first real accounts.

**RAG, not long context (Kay asked, iteration 8).** At about 23k tokens the whole corpus would fit in one prompt, but RAG stays, for three reasons:
1. QST-DIAB-DOSE-GUARD: D says dose-related passages are **never given to the model**. Long context would put all 22 in front of it every turn.
2. Cost: about 4k vs. 23k input tokens per turn, which matters under the $15 budget (ADR-0012).
3. Citations point to the few passages actually used.

---

## Trade-offs (proposed design)

- **Verbatim vs fluent.** Answers sound canned and cannot combine cards. We accept this in exchange for guaranteed approved content, and we reduce the cost by writing short Q&A cards rather than long documents.
- **Triage before answering adds latency.** Every answer waits for the model-based classifier, about 1–2 s. The rules layer covers the most serious cases instantly. A slow but correct answer suits this audience better than a fast one that skipped triage.
- **Browser-only keeps things simple, and limits them.** It's free to host and holds no server-side data, but it has no audit log, cannot actually notify a nurse, and keeps no history across devices. That's fine for a demo and wrong for production (see the real-PHI section).
- **Model variability.** OpenRouter may route the same model id to different providers. Pin the model *and* provider for the classifier and selector, and re-run the recall eval whenever either changes.
- **Voice availability.** Browser speech recognition support varies (Chrome and Safari have it, Firefox does not). In Chrome, audio is processed by Google's servers. Text-to-speech (`speechSynthesis`) is broadly available. Voice stays optional, and the text box is always there.

---

## If this ever handled real PHI — what must change

1. **A backend.** You can't hold PHI in a static page with a personal API key. You'd need a server, user accounts, authentication suited to older users (MFA versus usability is a real tension), audit logging, encryption at rest, and role-based access.
2. **A BAA with every processor.** Any LLM provider that handles PHI needs a business associate agreement (BAA) and zero data retention. That means a provider under a BAA directly; OpenRouter routing through a personal key is not covered. The **speech-to-text** provider needs one too: Chrome's built-in recognition sends audio to Google, so it would have to change to a BAA-covered or on-device engine.
3. **`localStorage` goes.** Many of these users share a device, sometimes with a spouse who also has diabetes. PHI moves to the server, and the device keeps only a session token.
4. **Data provenance.** The regimen would come from the EHR (for example, FHIR `MedicationRequest` via SMART on FHIR) and CGM data from vendor APIs, each needing approvals. A stale read-back of a regimen becomes a clinical risk, so the template needs a source and a last-verified date.
5. **Content governance.** Cards would need clinician sign-off per version, a review schedule, and a log of which corpus version produced each answer.
6. **Logs become PHI.** Conversation logs need retention rules, access control, and a breach process. Test logs with synthetic data must never mix with real ones.
7. **Regulatory review.** Education plus escalation is lower-risk. Anything that turns CGM or regimen data into patient-specific recommendations moves toward FDA software-as-a-medical-device territory. Even the CGM-triggered escalation in ADR-0006 (QST-TRIAGE-CGM) should be reviewed.
8. **Real escalation operations.** That means a contracted nurse line with known hours, a defined after-hours path, and a duty-of-care decision about what happens when the bot detects an emergency and the user doesn't act.

**Even now, with synthetic data**: testers may type their *own* health details, and those go to OpenRouter. Show the "don't enter real health information" notice from ADR-0004's follow-ups on screen.

---

## Open Follow-ups

- [x] **Who approves the content?** Resolved in iteration 2: ADA's material is professionally reviewed, so "clinician-approved" means ADA as published. Two caveats remain. It was approved for a general audience, not checked for older readers with low literacy. And it's copyrighted (QST-DIAB-CORPUS-HOSTING).
- [x] **Ask ADA for permission** (QST-DIAB-CORPUS-HOSTING: C). Owner: Kay. In iteration 6, Kay supplied the team's knowledge base as "materials we can use". The open part is whether that covers public redistribution. Until that's confirmed, no corpus text goes into git or onto the site.
- [ ] **Keep the corpus out of the repo.** It's loaded from the team's Drive folder on the demo device. If a local copy is ever needed in the working tree, gitignore its folder first. Owner: Nibble, at the start of implementation.
- [ ] **Corpus snapshot date.** ADA revises its material, so record when the corpus was collected, and show "From ADA, retrieved {date}" with each excerpt.
- [ ] **Regimen read-back is close to dose advice.** "What's my insulin?" is read-back. "What should I take tonight?" answered with a read-back *acts as* dose advice if the record is stale. The router must send "should I take…" questions to the dose-refusal branch even when a regimen is on file.
- [ ] **User testing with older adults** may need an IRB exempt determination, even with synthetic data. Check with the course staff before recruiting anyone.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's architecture request (excerpt above)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Architecture proposed. Three questions posed with recommendations. Safety split into ADR-0006.
- Outcome: Draft

### Iteration 2 (2026-11-14)
- Trigger: Kay's answer to QST-DIAB-ANSWER-PATH: the knowledge base is ADA's entire education material. Kay also opened the follow-up QST-WHICH-APPROACH-SHOULD-I.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: The content store moves from curated cards to the ADA library, split into sections and paragraphs. A search shortlist now comes before selection. The recommendation moves from card to verbatim excerpt (walk-back stated in the follow-up). QST-DIAB-ANSWER-PATH is marked superseded. Two new questions: corpus hosting (copyright and a public repo) and the dose boundary (ADA's text itself contains dose guidance).
- Outcome: Draft

### Iteration 3 (2026-11-14)
- Trigger: Kay answered the five open questions in this ADR: C, B, B, C, B.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision section added. The answer path is now constrained RAG inside the agent loop, with the safety and dose gates outside the loop. The regimen is kept out of the loop. ADA permission comes first. The narrow dose boundary applies. Two follow-ups opened: QST-DIAB-DOSE-GUARD (the three answers together move the no-dose constraint from structure to checks) and QST-DIAB-PORTAL-SHELL (reconciling this ADR's portal answer with ADR-0004's).
- Outcome: Draft (two questions open)

### Iteration 4 (2026-11-14)
- Trigger: Kay proposed a second agent to monitor the conversation
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: QST-DIAB-DOSE-GUARD gains option D (C plus a conversation monitor). The recommendation moves from C to D, with the change stated in the block. The monitor's design is in ADR-0007.
- Outcome: Draft

### Iteration 5 (2026-11-14)
- Trigger: Kay answered QST-DIAB-DOSE-GUARD: D and QST-DIAB-PORTAL-SHELL: A
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Both answers recorded in the Decision table. The portal reading is confirmed. The dose constraint now rests on the output gate, dose passages shown word for word, and the monitor from ADR-0007.
- Outcome: Draft → Accepted (every question answered; QST-DIAB-ANSWER-PATH superseded)

### Iteration 6 (2026-11-14)
- Trigger: Kay shared the team's knowledge base folder as "materials we can use".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Knowledge base section added, with an inventory of eight ADA PDFs and one team-written FAQ doc (~17k words). Corrected iteration 2's assumption that the corpus was ADA's entire library. Hosting stays local, with no corpus text in git or on Pages. Urgent cards and dose tagging are now tied to specific passages. QST-DIAB-FAQ-SOURCE opened about the team-written doc. ADR-0006 got its threshold question from the same review.
- Outcome: Accepted (one question open)

### Iteration 7 (2026-11-14)
- Trigger: Kay added the clinic's call-triage workflow to the knowledge base folder.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Added to the inventory as a triage source only, not answer content. Its RED FLAGS box now defines URGENT (ADR-0006, iteration 5). Kay also answered QST-DIAB-FAQ-SOURCE: A: the FAQ doc is already clinician-approved, is used as-is, and is labeled "From your care team".
- Outcome: Accepted (no questions open)

### Iteration 8 (2026-11-14)
- Trigger: Knowledge-base loader built. Kay: "you can skip infographic", "are you using rag or long context", "what do you mean internal note about brands".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Build and load section added: splitting, skipped infographics and table scraps, headings as hints only, FAQ export without the author's note, tag counts. RAG over long context reaffirmed, with reasons.
- Outcome: Accepted

---

## Links

- Related ADRs: ADR-0001 (key in the browser; why real PHI can't fit), ADR-0002 (gate and stack), ADR-0003 (agent loop this design deliberately doesn't use on the answer path), ADR-0004 (portal assistant; see QST-DIAB-VS-PORTAL), ADR-0006 (triage and escalation)
