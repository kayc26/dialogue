<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0008: Diabetes education bot — intake, conversation summary, and nurse handoff

- **Date**: 2026-11-14
- **Iteration**: 3
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Decided: the bot asks a few targeted follow-up questions drawn from the clinic's triage flowchart. At the end, it builds a structured summary: each field cites the turn it came from, and the transcript is attached. The patient gets a plain-language version, and the care team gets the structured one. This adds a second reader of the data, the nurse, so where the data lives becomes a real decision (QST-HANDOFF-STORAGE).

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-14), verbatim:

> where will the databse be? additionally, at the end of a conversation, the bot should provide a summary of the conversation for clinical team's review or the patient's reference. one goal of the chatbot is to collect irelvant clinical information for nurses to reply'triage down the line. Use existing triage flowchart to decide what to collect, and i'll provide more detailed information clinicians need later. Do you have any questions? also how will you fill in a fake patient's data, gluvose numbers, and insulin regime?

(The last question is in ADR-0009. "irelvant" reads as *relevant*.)

**Agency Grant**: Propose a design and ask questions. Kay will supply the clinicians' detailed information requirements later.

---

## Explicitation

**What I understand**:

1. **This widens the bot's job.** Until now it was education plus escalation. Now it also does **intake**: it collects what a nurse needs to triage and reply later. The clinic's flowchart already says what a nurse decides on. Box 1 is the RED FLAGS (same-day attending), box 2 is the HIGH-TOUCH criteria (offer a visit within a week), and anything else gets quick advice.
2. **"Where will the database be?" has had an easy answer so far: in the patient's browser.** ADR-0001 rules out a backend, and ADR-0005 keeps the profile in `localStorage`. A summary *for the care team* is the first data that someone other than the patient must read. That's the first real pressure on the no-backend decision.
3. **A summary written by a model becomes a clinical record.** If the model invents a symptom or gets a number wrong, a nurse acts on it. The design has to make each claim checkable.
4. **A summary waiting in an inbox mustn't delay care.** A patient who describes red flags must not leave thinking "the nurse will get back to me". The 911 and nurse-line escalation (ADR-0006) still happens immediately, and the summary is an addition to it, never a replacement.

**Assumptions**:

- Kay's detailed information requirements will refine *which* fields are collected. The mechanism below shouldn't need to change.
- The data is synthetic (ADR-0009). Everything in ADR-0005's real-PHI section applies twice over here: a nurse inbox of real conversations is PHI by definition.

**Confirm**: Kay. Does "for clinical team's review **or** the patient's reference" mean the patient chooses whether to send it, or both always get it? See QST-HANDOFF-CONSENT.

---

## Proposed design

### What gets collected (from the flowchart)

| Flowchart box | Field | Where it comes from |
|---|---|---|
| RED FLAGS | Latest glucose reading and its time; ketones (checked? result); lows in the last 48 h (count, and whether the person needed help); pump problem (alarm, occlusion, site); pregnancy | Asked in the conversation, plus profile flags (ADR-0006, QST-TRIAGE-PROFILE-FLAGS: B) |
| HIGH-TOUCH | Recent hospitalization; new steroid; new pump start (within 30 days); recent medication changes; how many follow-up questions in this conversation | Asked, or counted by code (follow-ups) |
| HIGH-TOUCH (facts from the clinic's records) | Calls in the last 2 months; last visit over 6 months ago | **Synthetic profile only** (ADR-0009). In real life these would come from the clinic's records system, not from the patient |
| Every conversation | Reason for contacting; symptoms in the patient's words; questions the bot couldn't answer; escalations shown, and whether the patient tapped a call button | Code-kept event log (not written by the model) and the conversation |

The flowchart item "Non-clinic provider requesting urgent visit" doesn't apply to a patient-facing bot.

### How it's collected

- **Only follow-ups relevant to what the patient raised** (QST-INTAKE-STYLE). For example, "my sugar is high" leads to: the number, ketones checked?, sick or on a new medicine?, pump? That's three to five questions at most, one per screen, with large yes/no buttons and a "skip" on each.
- **Never during an EMERGENCY.** The 911 screen comes first and no questions are asked. After an URGENT banner, questions wait until the nurse-line option has been offered.

### The summary

- **Structured, with each item citing its source** (QST-HANDOFF-SUMMARY-WRITER). Each field holds a value plus a link to the turn it came from. Fields come from code (readings typed, escalations shown, follow-up count) or from model extraction checked against the transcript (for example, the reading must appear in the cited turn).
- **The two versions are rendered from the same record:**
  - *Care team:* a compact record. **Flowchart criteria met** comes first, with the evidence for each, then the remaining fields and the full transcript. It shows which criteria are met and the evidence, but no routing decision: the nurse decides.
  - *Patient:* plain language, large type, read aloud. It covers "What we talked about", "What to do next", and "When to call". There's no clinical jargon, and the same dose rules apply, so it gives no dose advice (ADR-0005, QST-DIAB-DOSE-GUARD: D).
- **It reports and never recommends.** Neither version suggests treatment ("consider increasing basal"). That decision belongs to clinicians, and recommending it would break the bot's no-dose-advice rule even when the reader is a nurse.
- **Ending a conversation.** There's a large "I'm done" button. If the patient goes quiet (no reply for about 10 minutes) or closes the tab, a draft summary is saved and offered next time.

---

## Questions

### QST-HANDOFF-STORAGE: Where does the data live, so a nurse can read the summary?
- Status: answered
- Why asking: Kay asked where the database will be. Today the answer is the patient's browser: `localStorage`, and IndexedDB for the knowledge base. ADR-0001 rules out any backend, and the corpus stays local (ADR-0005). The new nurse-handoff summary is the first data that someone *else* must read, so it has to get from the patient to the care team somehow. All data is synthetic.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Same device, two views**: Everything stays in the browser (IndexedDB). The app gets a **Care team inbox** view next to the patient view, and the demo presenter switches between them on one device. The patient can also print the summary or save it as a PDF. No backend, ADR-0001 stays intact, and nothing leaves the device except model calls.
- **B — Hosted database, synthetic data only**: A hosted Postgres (for example Neon or Supabase) holds the summaries, and a nurse view on another device reads them. This needs authentication and access rules, and it's the first time Harness talks to anything but OpenRouter, so ADR-0001 gets amended. It's still synthetic-only, and with real PHI it would need everything in ADR-0005's real-PHI section.
- **C — File handoff**: The summary is downloaded as PDF or JSON and passed on by hand (email, upload). No backend, but nothing ties the handoff together.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Same device, two views.** *Rationale*: A class demo needs to *show* the handoff: a patient talks, then a nurse opens the inbox and sees the flowchart criteria with their evidence. One device does that with no new infrastructure and no new place for data to leak. B adds authentication, a database schema, and a second trust boundary to answer a question nobody grading the demo asks. If B ever handled real data, it's exactly the system ADR-0005's real-PHI section describes, which is a larger project. *Confidence*: 0.6 — because it depends on how the demo is presented: on one screen, or with patient and nurse side by side. *If wrong*: if the demo needs two devices at once, or the team wants teammates to review real synthetic sessions remotely, flip to **B**. A Neon connection is already available in this environment, so setting one up would be quick.

**ANS:** (by Kay)
a

---

### QST-HANDOFF-CONSENT: Does the summary go to the care team automatically, or only when the patient chooses?
- Status: answered
- Why asking: Kay wants the end-of-conversation summary to serve the clinical team's review "or the patient's reference". Sending everything automatically is good for care but means the patient is always being watched. Sending only on request means some red-flag conversations reach no one. Missed escalations cost far more than false alarms, and the users are older adults with limited tech literacy.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Patient chooses**: Every summary ends with large "Send to my care team" and "Just keep it for me" buttons. Nothing is sent without a tap.
- **B — Always sent**: Every conversation's summary goes to the care team. The patient is told this up front.
- **C — Sent automatically when the flowchart flags it, otherwise the patient chooses**: Summaries that meet a RED FLAG or HIGH-TOUCH criterion go to the care team automatically. The patient is told this at the start ("If you tell me about something serious, I'll share it with your care team"). Everything else gets the A buttons.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**C — Sent automatically when the flowchart flags it, otherwise the patient chooses.** *Rationale*: The flowchart already defines which conversations a nurse must see, so those shouldn't depend on an older user finding a button after a frightening exchange. Routine conversations stay the patient's own. B's always-on sharing could stop users asking the questions they're embarrassed about. *Confidence*: 0.55 — because this is a consent and values question that the clinic's actual practice should answer, and I don't know it. *If wrong*: if the clinic treats every patient message as part of the record (as many portals do), flip to **B**. If the team wants the patient fully in control for the demo, flip to **A**.

**ANS:** (by Kay)
c

---

### QST-HANDOFF-SUMMARY-WRITER: How is the summary produced?
- Status: answered
- Why asking: The end-of-conversation summary goes to nurses who triage and reply based on it. A model-written summary can invent a symptom, drop a qualifier ("I *think* it was 380"), or misattribute a number, and a nurse would act on it. The bot's answers already have checks (ADR-0005), but this is a record about the patient, which is a different risk.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Structured fields, each citing its source, plus the transcript**: Every field holds a value and a link to the turn it came from. Code fills what it knows (readings typed, escalations, follow-up count). The model extracts the rest, and code checks that extracted values appear in the cited turn. There's no free-text narrative, and the full transcript is attached. The patient version is generated from the fields by a template.
- **B — Model-written narrative**: A short paragraph summary written by the model, with a structured header. It's quickest to read, and the hardest to check.
- **C — A plus a labeled narrative**: Everything in A, plus a two-to-three-sentence model narrative at the top labeled "AI-written overview — check against the fields and transcript".

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Structured fields, each citing its source, plus the transcript.** *Rationale*: A nurse needs to trust each fact or check it in one click, and A gives exactly that. Every value can be traced to its turn, and code rejects any extraction that isn't in the cited turn. B's narrative is the format most likely to slip in a plausible but invented detail. C's label helps, but a busy nurse reads the top paragraph and stops. Kay's coming list of clinician requirements slots straight into A's fields. *Confidence*: 0.7 — because nurses may find a fields-only view slower to read than prose, which only testing with them would show. *If wrong*: if clinicians reviewing sample summaries say they need the narrative to read quickly, flip to **C**.

**ANS:** (by Kay)
a

---

### QST-INTAKE-STYLE: How does the bot gather the information nurses need?
- Status: answered
- Why asking: Kay wants the bot to collect the information nurses need, using the clinic's triage flowchart (RED FLAGS, then HIGH-TOUCH criteria). The users are older adults with low vision and limited tech literacy, who may be unwell while they're talking to the bot. Every question asked has a cost.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Ask only what's relevant**: Ask follow-ups only for flowchart criteria related to what the patient raised. That's three to five at most, one per screen, with yes/no buttons and "skip". Unrelated criteria are left blank, marked "not asked".
- **B — A fixed checklist**: At the end of every conversation, ask the same short checklist covering every flowchart criterion. The record is always complete, but every user gets questioned.
- **C — Record only what's volunteered**: Ask nothing. Record only what the patient happens to say. The burden is lowest, and the records have the most gaps.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Ask only what's relevant.** *Rationale*: A nurse triaging a high reading needs the ketones, illness, and pump answers, not whether the patient was hospitalized recently in a conversation about snacks. Relevant questions get answered, while checklists get skipped or abandoned, especially by tired or unwell older users. "Not asked" is honest in a way an abandoned checklist isn't. *Confidence*: 0.7 — because Kay's coming clinician requirements may name fields nurses want *every* time. *If wrong*: if the clinicians name must-have fields for every contact, add only those as a fixed short tail to **A**. Move to **B** only if the list is short.

**ANS:** (by Kay)
a

---

### QST-CRITERIA-PUBLIC: Can the clinic's triage criteria appear in this public repo and site?
- Status: answered
- Why asking: The questions the bot asks will be generated from the clinic's internal call-triage flowchart: its RED FLAGS and HIGH-TOUCH criteria. Anything in the app's code is public: this repo is public, and the GitHub Pages bundle is readable by anyone. Until now, ADR-0006 kept the clinic's internal routing out of the public record and named no clinic.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Public is fine**: These are standard clinical criteria, with nothing sensitive in the thresholds themselves. They go in the code with no clinic name attached.
- **B — Loaded locally, like the knowledge base**: The criteria live in a config file in the team's Drive folder and are loaded at runtime on the demo device. The public code holds only the mechanism, plus placeholder criteria for tests.
- **C — Check with the clinic first**: Use B until a clinician or the clinic confirms that A is acceptable.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**C — Check with the clinic first, using B until then.** *Rationale*: The RED FLAGS look like generic clinical practice, but the HIGH-TOUCH list (call counts, visit timing, routing to visits) is one clinic's operating policy, and the flowchart is an internal document. B costs little because it's the same loading path the knowledge base already uses. *Confidence*: 0.6 — because the clinic may well say it's fine, and then this caution only cost one config file. *If wrong*: if a clinician on the team confirms the criteria are standard and not sensitive, flip to **A**.

**ANS:** (by Kay)
a

---

### QST-HANDOFF-REPLY-PATH: How does a nurse's reply reach the patient?
- Status: answered
- Why asking: Flagged summaries go to a Care team inbox on the same device (QST-HANDOFF-STORAGE: A). The bot currently has no way to deliver a reply. The patient summary has to tell older, low-tech-literacy users what happens next and when, and urgent problems must still mean calling now, not waiting for a reply. *(Promoted from an Open Follow-ups bullet in iteration 3 so it shows up as a question.)*
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Phone call**: The nurse calls the patient. The bot only says "A nurse will call you" and when. The demo ends at the inbox.
- **B — Reply inside the bot**: The nurse types a reply in the inbox view. The patient sees it, in large type and read aloud, the next time they open the bot. On one device, the demo shows the whole loop.
- **C — Both**: Red-flag summaries get a phone call, and routine ones get an in-bot reply. The patient summary says which applies.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**C — Both.** *Rationale*: Phone is what older users trust and what same-day red flags need, and the clinic's flowchart already routes those to a same-day call with an attending. In-bot replies suit routine questions and let the demo show the full loop on one device. *Confidence*: 0.6 — because it depends on how the clinic actually responds to messages, and Kay knows that. *If wrong*: if the clinic answers everything by phone, flip to **A**. If the demo should stay entirely in the app, flip to **B**.

**ANS:** (by Kay)
C

---

## Decision

On 2026-11-14, Kay answered all five questions:

- **QST-HANDOFF-STORAGE: A.** Everything stays on one device, in IndexedDB. The app gets a **Care team inbox** view next to the patient view, and patients can print or save a PDF. No backend, so ADR-0001 stands.
- **QST-HANDOFF-CONSENT: C.** A summary that meets a RED FLAG or HIGH-TOUCH criterion goes to the inbox automatically, and the patient is told this at the start. Anything else is the patient's choice: "Send to my care team" or "Just keep it for me".
- **QST-HANDOFF-SUMMARY-WRITER: A.** Structured fields, each with a value and a link to the turn it came from. Code checks extracted values against the cited turn, the transcript is attached, and there's no free narrative. The patient version is generated from the fields by a template.
- **QST-INTAKE-STYLE: A.** Only follow-ups relevant to what the patient raised: three to five at most, one per screen, with yes/no buttons and "skip". Unasked fields are marked "not asked".
- **QST-CRITERIA-PUBLIC: A** (I recommended C). The clinic's RED FLAG and HIGH-TOUCH criteria may go in the public code, with no clinic name attached. The flowchart's staff routing, scripts, and scheduling steps aren't needed by the bot and don't go in. This updates ADR-0006's iteration-5 note that the HIGH-TOUCH box stays out of the public record.

The design above stands as proposed.

---

## Trade-offs

- **More data, more responsibility.** The bot now keeps a record about the patient, not just a chat history. With synthetic data that's a design exercise. With real data it's PHI with all of ADR-0005's obligations, plus a nurse-facing access path.
- **The burden of questions vs. complete records.** Asking only what's relevant (QST-INTAKE-STYLE) leaves fields blank, but each blank is labeled "not asked", so the gaps are visible.
- **The bot looks like triage without doing triage.** Showing "flowchart criteria met" is close to routing, but the nurse still decides. The care-team view must say this explicitly.

---

## Open Follow-ups

- [ ] **Kay's clinician requirements** (coming later) refine the field list. They should replace the table above, not override this mechanism.
- [x] **Reply path**: promoted in iteration 3 to QST-HANDOFF-REPLY-PATH.
- [ ] **Turnaround wording**: the patient summary must say when to expect a reply, and that urgent problems mean calling now, not waiting.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's request for an end-of-conversation summary and intake guided by the flowchart, plus "where will the database be?"
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Collection table drawn from the flowchart, the summary design, and five questions posed.
- Outcome: Draft

### Iteration 2 (2026-11-14)
- Trigger: Kay answered A, C, A, A, A
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision section added. Four answers match the recommendations. QST-CRITERIA-PUBLIC went to A rather than C: the criteria are public, with no clinic name.
- Outcome: Draft → Accepted (the reply-path follow-up is still open)

### Iteration 3 (2026-11-14)
- Trigger: The reply-path follow-up went unanswered twice. As a bullet it was invisible to the question tooling Kay answers from.
- Contributors: Nibble (Claude Opus 5.5)
- Changes: Promoted it to QST-HANDOFF-REPLY-PATH, with options and a recommendation.
- Outcome: Accepted (one question open)

---

## Links

- Related ADRs: ADR-0001 (no backend; QST-HANDOFF-STORAGE B would amend it), ADR-0005 (profile, dose guard, real-PHI section), ADR-0006 (tiers, red flags, profile flags, clinical assumptions log), ADR-0007 (the monitor also checks the patient summary), ADR-0009 (synthetic patients)
