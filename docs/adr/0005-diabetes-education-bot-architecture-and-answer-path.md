<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0005: Diabetes education bot — architecture and answer path

- **Date**: 2026-11-14
- **Iteration**: 2
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Proposed: a fixed pipeline in which the model only classifies and selects. It never writes what the user reads. Answers are verbatim excerpts of ADA's education material, with dose-calculation passages removed before indexing and the corpus kept out of this public repo. The regimen is read back from a template and never reaches the model. Safety (ADR-0006) runs before every answer.

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

- This builds on Harness: browser-only, OpenRouter, `localStorage` (ADR-0001..0003). It is a demo on synthetic data for CIS7000, not something real patients will use.
- "Clinician-approved" means a fixed corpus that a named person signed off on. Who that person is for a class project is still open (see Open Follow-ups).

**Confirm**: Kay. Is this a new direction that replaces the portal assistant (ADR-0004), or something separate? See QST-DIAB-VS-PORTAL.

---

## Proposed architecture

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
- Status: unanswered
- Why asking: Harness v1 (ADR-0003) is an agent loop in which the model decides which tools to call, capped at 8 rounds. Here the hard constraints require triage on every message, no dose advice, and help always reachable. An agent loop puts the model in charge of control flow, so the model could skip a safety step.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Fixed pipeline**: Code always runs the safety gate, then the router, then a selector or template, in that order. The model is called only as a bounded classifier or selector that returns JSON, and the JSON is validated. Harness's OpenRouter client, sanitized rendering, and storage are reused. The agent loop is not.
- **B — Agent loop with tools**: The model receives `triage`, `search_cards`, and `read_regimen` tools and decides which to call. Code then checks that `triage` ran before any answer is rendered. This reuses more of Harness and is easier to extend, but the safety ordering becomes a policy the code enforces after the fact.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Fixed pipeline.** *Rationale*: All three hard constraints are statements about every message, which matches code-enforced ordering, not model judgment. A also lets the deterministic layers be tested in `vitest` under the existing gate (ADR-0002). The agent loop's strength, open-ended tool use, is exactly what this bot must not do. *Confidence*: 0.85 — because the constraints make this argument directly. The only uncertainty is whether the class wants agent behavior to be visible. *If wrong*: if the project is graded on agentic behavior, flip to **B** and keep the safety gate *outside* the loop, so it runs before the loop starts and not as a tool.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-DIAB-VS-PORTAL: How does this bot relate to the portal-assistant direction in ADR-0004?
- Status: unanswered
- Why asking: ADR-0004 (still a draft, its question unanswered) asked whether "a chatbot on the patient portal" should be a mockup, a portal-style Harness over a demo inbox, or a real integration. This diabetes education bot is a different product: education plus triage, not message search. The answer decides whether ADR-0004 is superseded, merged, or left alone.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Replaces it**: The diabetes bot is the project. Mark ADR-0004's question superseded by this ADR. The portal mockup stays in the repo as history.
- **B — Shell plus content**: The portal layout from ADR-0004 is the container, and the diabetes bot is the assistant inside it. Note that the portal's dense navigation conflicts with this ADR's single-screen accessibility goal.
- **C — Separate projects**: Two tracks. The diabetes bot gets its own app or route, and ADR-0004 stays open on its own.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Replaces it.** *Rationale*: The new prompt is far more specific (users, constraints, data) than ADR-0004's, which reads like an early sketch of the same class project. B runs into the "minimal navigation depth" requirement, because a message center is several levels deep. *Confidence*: 0.5 — because I'm inferring the relationship. Only Kay knows what the assignment is. *If wrong*: if the assignment is specifically about patient-portal integration, flip to **B**, with the accessibility work applied to the portal too.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-DIAB-CORPUS-HOSTING: Where does the ADA corpus live, given this repo is public?
- Status: unanswered
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
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-DIAB-DOSE-BOUNDARY: Where does insulin education end and dose advice begin, for filtering the ADA corpus?
- Status: unanswered
- Why asking: The hard constraint is that the bot never gives insulin dose adjustment advice. With curated cards, that held by construction. ADA's library includes insulin material, such as what correction factors and insulin-to-carb ratios are, how doses are worked out, and sick-day guidance. Shown verbatim, some of those passages *are* dose advice, in ADA's words. So passages must be tagged before indexing, and someone has to decide where the line falls. For either option, tagging works the same way: a keyword sweep (units, dose, ratio, correction, sliding scale…) plus model tagging, then a person reads every flagged passage. Excluded passages are listed in a file so the boundary can be reviewed.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Strict**: Exclude every passage that explains how to calculate, choose, or change an insulin dose, including correction-factor and carb-ratio arithmetic and sick-day dosing. Questions on those topics get the fixed "your care team can help with doses" card.
- **B — Narrow**: Exclude only passages that tell the reader to change their own dose. Keep passages that explain concepts (what a correction factor is), even if they include worked examples.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Strict.** *Rationale*: A worked example ("if your correction factor is 50 and you're at 250, take 2 units") is a dose calculation however it's framed. For older readers on a large-type screen, the line between explanation and instruction won't hold. The cost is that some legitimate questions get the care-team card, and that is the trade the constraints already accept. *Confidence*: 0.8 — because the hard constraint is explicit. What's uncertain is how much of ADA's insulin content A removes. *If wrong*: if a clinician reviewer judges the explanatory passages safe, and A removes most of the insulin topic, flip to **B**, with that reviewer signing off on the passages kept.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

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

---

## Links

- Related ADRs: ADR-0001 (key in the browser; why real PHI can't fit), ADR-0002 (gate and stack), ADR-0003 (agent loop this design deliberately doesn't use on the answer path), ADR-0004 (portal assistant; see QST-DIAB-VS-PORTAL), ADR-0006 (triage and escalation)
