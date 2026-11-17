<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0017: Multi-language support

- **Date**: 2026-11-17
- **Iteration**: 3
- **Status**: Partially Implemented
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Kay wants the assistant to work in more than one language. Every safety layer that doesn't use a model is English-only, so a non-English emergency today relies on the AI classifier alone. Recommendation: close that gap first with a cheap language check that always shows help; then pick the languages with the sponsor, and run the safety checks on an English translation while the patient reads and writes in their own language.

---

## Originating Context

**Source**: Kay, 2026-11-17: "also add to kanban: add multi-language support", then, after the card was filed in Backlog, "why is there no multi-language support in the kanban" and "write adr".

**Agency Grant**: Lay out the decisions with options and recommendations; Kay answers before anything is built.

---

## Explicitation

**What I understand** (checked in the code, 2026-11-17):

1. **The layers that can't fail are English-only.** They are the ones ADR-0006 relies on as the floor:
   - **Fixed triage rules** (`src/lib/chat/triage.ts`): about 30 English word patterns. "no puedo respirar" or "我的血糖是400" matches nothing except possibly the bare number.
   - **Dose-question rules** (`triage.ts`) and the **dose-advice check** in the guard (`guard.ts`): English patterns; the guard is already weak on English words (TD-7).
   - **Decline detection** (`turn.ts`, `NO_INFO`, `isOnlyDecline`) and **small talk** (`social.ts`, ADR-0016): English.
   - **"Get help now"** (`index.html`, outside the app so it never fails) and every fixed card (`ChatPanel.vue`, `social.ts`): English text; the page is `lang="en"`.
2. **The model layers are only partly multilingual.**
   - The classifier is `gpt-oss-20b`, a small model, prompted in English. It will often triage other languages, but nobody has tested how well, and "when unsure, choose the more urgent tier" is the only safety margin.
   - The answer model (`claude-haiku-5.5`) writes most languages well.
   - Number checks in the guard are language-neutral (digits); citation checks are too.
3. **The knowledge base is English**: the care-team FAQ, the ADA guides and handouts, the book. Search is BM25 over English words with English synonym expansion (`retrieve.ts`). Approved translations exist for some ADA handouts (ADA publishes Spanish material), but none are in the knowledge base.
4. **So the safety gap exists today**, not only after multi-language ships. Any tester who writes one message in another language relies on the classifier alone.
5. **Fixed text needs approved translations.** Escalation, dose refusal, small talk and no-information texts are shown word for word because a person approved them (ADR-0013, ADR-0016). A machine translation of approved text is not approved text.

**Assumptions**:

- The test population is older adults in a US clinic (911, ADA material). Which languages matter is a fact about the clinic's patients, which the sponsor knows and Nibble doesn't.
- Testers are invited (ADR-0010), so languages can be scoped to the testers actually recruited.

---

## Questions

### QST-LANG-FLOOR: What happens to a non-English message until multi-language is built?
- Status: answered
- Why asking: today a message in another language skips every English-only safety pattern (fixed triage rules, dose rules) and relies on the AI classifier (`gpt-oss-20b`, untested in other languages). If the classifier misses an emergency, the tester sees an ordinary reply or "I don't have information on that". This holds now, whatever is decided about full support.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — detect and always show help**: code checks whether a message is mostly English (letters outside the Latin alphabet, or few common English words). If not, the turn shows the nurse-line card and the 911 line, plus a short fixed note: "This test version only works in English. If this is an emergency, call 911." (in English until approved translations exist) No answer model. Costs nothing; may show help for a few English messages with foreign words in them.
- **B — rely on the classifier, and test it**: keep today's behaviour, but run a set of non-English emergency and urgent messages through the classifier (about $0.01) and record how often it catches them. Act only if it misses.
- **C — leave it**: testers are told to write in English; the consent notice says so.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — detect and always show help.** *Rationale*: it restores the property ADR-0006 depends on, a floor that doesn't rely on a model, for the case where that floor is currently missing. Over-showing help is the failure mode the triage rules already accept ("false negatives cost far more than false positives", `triage.ts`). B is worth doing too, but a test pass on a dozen messages doesn't make a 20B model a floor. C depends on every tester reading the notice. *Confidence*: 0.75 — because language detection on short messages is imperfect; a two-word English message with a brand name could trip it. *If wrong*: if a trial shows A firing on many English messages, this flips to B, with the classifier tested in the target languages.

**ANS:** (by Kay)
a

---

### QST-LANG-WHICH: Which languages, and who decides?
- Status: answered
- Why asking: every language needs approved translations of the fixed texts, emergency patterns checked by someone who speaks it, and test questions. The cost scales with the number of languages, so the choice should follow the clinic's actual patients and the testers who will be recruited.
- Need: pick a letter, or name the languages

Options:
- **A — ask the sponsor**: add to the clinical sponsor email: "Which languages do the clinic's patients with diabetes most often speak, other than English?" Build for the top one first.
- **B — Spanish first**: the most common non-English language in US clinics, and ADA already publishes Spanish patient material, so approved sources exist.
- **C — Kay names them now**: e.g. Spanish and Chinese, based on who Kay expects to recruit.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — ask the sponsor**, with B as the default if the sponsor has no preference. *Rationale*: the sponsor knows the clinic's population and is already being emailed (KANBAN Waiting); the answer also says whether approved translated sources exist. *Confidence*: 0.7 — because Kay may already know which testers will be recruited, which would make C quicker and just as right. *If wrong*: if Kay's recruited testers need a specific language, this flips to C.

**ANS:** (by Kay)
c

---

### QST-LANG-MODE: How does a non-English conversation work?
- Status: answered
- Why asking: the patient should read and write in their language, but the safety checks (triage rules, dose rules, guard, decline detection) and the knowledge base are English. Where translation happens decides which checks still work. See the Explicitation for which layers are English-only.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — translate at the edges**: each message is machine-translated to English first. Triage rules, dose rules, search, the answer and the guard all run in English, as today; the classifier sees both the original and the translation. The checked English answer is translated back, and code confirms every number survived. Fixed texts use approved translations. If translation fails, the turn shows the help card (fail-safe). Cost: two extra small model calls per turn; the fixed rules now wait for a model call, so a failed translation must count as "show help".
- **B — answer in the patient's language**: the answer model reads the English passages and replies directly in the patient's language. The guard's number and citation checks still work (digits, ids); the dose-advice check and decline detection need patterns in each language. Triage rules get emergency patterns translated and checked by a speaker. Cheaper per turn; every English-only check has to be rebuilt per language.
- **C — translated knowledge base**: approved translated sources (e.g. ADA's Spanish handouts) loaded as their own passages; the whole pipeline, rules included, runs natively per language. Most faithful; needs approved sources in each language and per-language search.
- **D — English only, for this test**: no multi-language support; only QST-LANG-FLOOR's safety floor.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — translate at the edges**, after QST-LANG-FLOOR is in place. *Rationale*: it keeps every existing check working unchanged, including the ones already known to be weak in English (TD-7), instead of rebuilding them per language as B requires. The new risk is the translation step itself; A contains it by checking numbers and failing to the help card. C is the long-term ideal but depends on translated, approved sources that don't exist yet in the knowledge base. *Confidence*: 0.55 — because a mistranslated symptom on the way in could lower triage for a message the classifier also misreads; this is a safety design that a clinician should look at, and it should be routed to the sponsor along with QST-LANG-WHICH. *If wrong*: if testing shows translation errors changing triage on real test messages, this flips to C for the chosen language; if the languages chosen have approved sources (ADA Spanish), C becomes cheap enough to prefer.

**ANS:** (by Kay)
a

---

## Decision

### Chosen (Kay, 2026-11-17)

- **QST-LANG-FLOOR: A.** Code detects a message that isn't English and always shows help (nurse line and 911) with a fixed "English only" note; no answer model. Built first, because the gap exists today.
- **QST-LANG-WHICH: C.** Kay named four: **Spanish, Chinese (Simplified), Chinese (Traditional), Korean.**
- **QST-LANG-MODE: A.** Translate at the edges: the checks run on an English translation; the checked answer is translated back, numbers verified; a failed translation shows help.

**Until QST-LANG-MODE is built**, the floor applies to every non-English message, including the four chosen languages.

In every case:
- Every fixed text needs a translation approved by a person who speaks the language (sponsor or delegate), recorded like card approvals.
- "Get help now" (`index.html`) must be translated in the static HTML, so it still works if the app fails.
- Tests in the gate: non-English emergencies from QST-LANG-FLOOR's examples must reach help.

---

## Action Items

- [x] Kay answers QST-LANG-FLOOR, QST-LANG-WHICH, QST-LANG-MODE. Owner: Kay
- [x] Build the floor (QST-LANG-FLOOR: A), iteration 3. Owner: Nibble
- [x] Deploy the floor (push) with Kay's OK, then try a non-English message on the live site: "你好" → `language: zh`, one model call, English-only alert (2026-11-17). Owner: Kay, Nibble
- [ ] Find a reviewer for each language's fixed texts (Spanish, Chinese in both scripts, Korean): fixed texts are shown word for word, so a person who reads the language approves them. Owner: Kay
- [ ] Ask the clinical sponsor to review the translate-at-the-edges design (QST-LANG-MODE confidence 0.55). Owner: Kay
- [ ] Build QST-LANG-MODE: A once reviewers exist. Owner: Nibble

---

## Iterations

### Iteration 1 (2026-11-17)
- Trigger: Kay asked for multi-language support (KANBAN Backlog), then "write adr".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Checked which layers are English-only; found the safety gap exists today. Three questions with recommendations.
- Outcome: Draft (three questions open)

### Iteration 2 (2026-11-17)
- Trigger: Kay answered A, C, A, and named Spanish, Chinese (Simplified), Chinese (Traditional), Korean.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision filled in. Two scripts of Chinese means five sets of fixed text in all (English plus four), each needing a reader to approve it.
- Outcome: Draft → Accepted (no questions open)

### Iteration 3 (2026-11-17)
- Trigger: build of QST-LANG-FLOOR: A.
- Contributors: Nibble (Claude Opus 5.5)
- Changes:
  - `src/lib/chat/language.ts`: `detectLanguage` by script (Hangul → `ko`, Han → `zh`, Kana and other scripts → `other`) and, for Latin text, Spanish vs English word lists plus ¿ ¡ and accents; other Latin diacritics with no English words → `other`. Leans towards "not English".
  - `turn.ts` step 2b: after the classifier (whose 911 or nurse-line card still comes first), a non-English message gets the `language` card ("This test only works in English", Call 911, Call the nurse line) and the turn stops: no dose rules, search, answer model or small talk. The English urgent passage is skipped for non-English readers.
  - The rules-only path (allowance used, models down) shows the same card.
  - Logged as `triage_events.detail.language`.
  - Tests: 13 new (286 total); the three floor tests were checked to fail with the check removed.
  - Known misses: a Latin-script language with no accents and no English words (e.g. plain Tagalog) reads as English; Chinese replies can't yet be told apart by script (not needed until translation).
- Outcome: Accepted → Partially Implemented (floor built, not deployed; translation not started)

---

## Links

- Related ADRs: [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (answer path, guard), [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md) (fixed rules as the floor), [ADR-0010](0010-diabetes-education-bot-how-test-users-reach-it.md) (invited testers), [ADR-0012](0012-model-choice-under-a-15-dollar-openrouter-budget.md) (budget for extra calls), [ADR-0013](0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md) (approved text, sources), [ADR-0016](0016-greetings-and-small-talk-in-a-cited-assistant.md) (fixed small-talk text)
- Related code: `src/lib/chat/triage.ts`, `guard.ts`, `turn.ts` (`NO_INFO`, `isOnlyDecline`), `social.ts`, `retrieve.ts`, `prompts.ts` (`CLASSIFIER_SYSTEM`), `index.html` (Get help now)
- Debt: TD-7 (dose advice in words)
