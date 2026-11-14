<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0009: Diabetes education bot — synthetic patients, glucose data, and insulin regimens

- **Date**: 2026-11-14
- **Iteration**: 3
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Six demo patients, one per flowchart path (decided). Their glucose readings come from public de-identified datasets (Kay's choice): ShanghaiT2DM is the leading candidate, with licenses still to verify. Real windows only, with stories adjusted to fit them; regimens come from the same subject where records exist. Timestamps are re-anchored to load time.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-14), the last part of the message quoted in ADR-0008:

> also how will you fill in a fake patient's data, gluvose numbers, and insulin regime?

**Agency Grant**: Propose.

---

## Explicitation

**What I understand**:

1. **The synthetic patients are the test cases.** Every rule decided so far needs a patient that exercises it: URGENT above 350, more than 2 lows in 48 hours, pump failure, pregnancy, the profile flags, and the HIGH-TOUCH criteria (ADR-0006, ADR-0008). Patients designed around those scenarios double as the demo script and the eval set.
2. **Glucose data has to be *controllable*, not just realistic.** A trace that happens to contain a few lows is useless for testing "exactly 3 lows in the last 48 hours". The events must be put there deliberately.
3. **"Now" matters.** Static timestamps age, so a reading from last month never counts as "in the last 48 hours". Timestamps stored relative to the time the data is loaded keep the scenarios working at demo time.

**Assumptions**:

- Regimen doses are synthetic and only ever read back (ADR-0005). The model never sees them.
- The fixtures contain no real patient data, so they can be committed to the public repo.

**Confirm**: Kay. Is the six-patient set below the right coverage? See QST-SYNTH-PERSONAS.

---

## Proposed design

*Iteration 2: Kay chose public datasets over the generator. Where they disagree, the **Decision** section is current. The generator below stays as the record of the proposal, and as the fallback if public data can't cover a scenario.*

### Patient record (one JSON fixture per patient)

- **Identity**: a fictional name, an age, and a visible **SYNTHETIC** badge everywhere the name appears.
- **Diabetes**: type, and CGM or fingerstick.
- **Regimen**, read back only: each insulin by generic and brand name, basal or bolus, the dose as a number of units or a carb-ratio description, and timing. Pump patients get basal rates as well. Written by hand within typical ranges.
- **Profile flags** (ADR-0006, QST-TRIAGE-PROFILE-FLAGS: B): `history_of_dka`, `pregnant`, `uses_pump`.
- **Clinic history** (stands in for the clinic's records; feeds the HIGH-TOUCH fields in ADR-0008): calls in the last 60 days, days since last visit, days since hospitalization, days since steroid start, days since pump start.
- **Glucose**: generator parameters plus the scripted events (below).

### Glucose generator

A TypeScript script in `scripts/synth/`, a project tool rather than an ephemeral one because the fixtures depend on it. It's seeded, so the same seed always gives the same trace.

- Readings every 5 minutes for CGM patients over 14 days, or about 4 fingersticks a day.
- What goes into each reading:
  - the patient's baseline;
  - a daily rhythm, including an early-morning rise;
  - meal rises that fade over 2–3 hours;
  - a crude correction effect for mealtime insulin;
  - noise.
- **Scripted events** are placed on top at set times, for example "a low with a nadir of 48 mg/dL, 20 hours ago", "above 350 for 6 hours ending 2 hours ago", or "a steady rise after a pump occlusion". Each event is what a scenario depends on.
- Timestamps are stored as minutes before load time and turned into real times when the patient is loaded.
- **Tests** (in the gate): the same seed gives the same trace, and each scripted scenario holds after generation (for example, patient 4 has exactly 3 readings under 70 in the last 48 hours, one of them under 54). These matter because triage behavior and the eval depend on them.

### Loading

In demo mode, a **Choose a demo patient** picker writes the fixture into browser storage (ADR-0008, QST-HANDOFF-STORAGE). *(Amended by ADR-0010, decision E: demo patients live in Neon, readable by signed-in testers, and the picker loads one into the session.)* A **Reset** button restores it. No patient is loaded by default.

---

## Questions

### QST-SYNTH-GLUCOSE: How are synthetic glucose readings produced?
- Status: answered
- Why asking: The diabetes education bot needs fake glucose data for each synthetic patient. The data is used for read-back, for the demo, and as test cases for the triage rules: above 350 mg/dL is urgent, below 54 is a severe low, and more than 2 lows in 48 hours is a red flag (ADR-0006). The data must look plausible *and* contain exact scenarios on demand.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Hand-written readings**: For each patient, someone types out a few dozen readings that tell the scenario's story. Exact control and no tooling, but no continuous CGM trace, and tedious to change.
- **B — Seeded generator plus scripted events**: A script produces 14 days of plausible readings (a daily rhythm, meal rises, noise) and inserts exact events at chosen times. Timestamps are relative to load time. Reproducible, testable, and easy to change.
- **C — Physiological simulator**: An open-source implementation of the UVA/Padova type 1 simulator (for example, `simglucose` in Python) generates traces from meals and insulin. Most realistic, but it models type 1 only, scripting an exact event means tuning inputs until it happens, and it adds a Python toolchain.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Seeded generator plus scripted events.** *Rationale*: The data exists to exercise specific rules, and B is the only option where "exactly 3 lows in 48 hours, one under 54" is a line of configuration rather than a search. It can be tested in the existing gate (`vitest`). Realism only has to be good enough to read back convincingly, which is a lower bar than C targets. C also can't produce the type 2 patients, who are most of this audience. *Confidence*: 0.75 — because plausible-looking traces from a simple model may still look wrong to a clinician. *If wrong*: if a clinician reviewing sample traces says they look unrealistic in ways that matter for the demo, use **C** for the type 1 patients and keep **B** for the rest.

**ANS:** (by Kay)
publicly availble datasrouces

---

### QST-SYNTH-PERSONAS: Which synthetic patients do we build?
- Status: answered
- Why asking: Each synthetic patient of the diabetes education bot should exercise a path through the clinic's flowchart: a RED FLAG (same-day), a HIGH-TOUCH criterion (offer a visit), or neither (quick advice). Together they should cover each triage rule once. The users are older adults, but some red flags (pregnancy) need a patient outside that group.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Six patients, one per path**:
  1. *Quick-advice path*: type 2, 72, basal insulin at bedtime, steady readings, last visit 3 months ago.
  2. *Red flag above 350, plus HIGH-TOUCH new steroid*: type 2, 68, basal plus mealtime insulin, prednisone started 5 days ago, readings 250–390.
  3. *Pump failure, DKA history, new pump*: type 1, 66, pump started 18 days ago, `history_of_dka`, a scripted occlusion with a steady rise.
  4. *Repeated and severe lows*: type 2, 81, lives alone, 3 lows in 48 hours with one at 48 mg/dL.
  5. *Pregnancy red flag*: type 1, 34, `pregnant`. Outside the target age group, included to test the rule.
  6. *HIGH-TOUCH from history only*: type 2, 75, last visit 8 months ago, 5 calls in 2 months, otherwise steady.
- **B — Three core patients**: Patients 1, 2, and 4 only: quick advice, a high red flag, and lows. A smaller fixture set, but no tests of pump failure, pregnancy, or the profile flags.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Six patients, one per path.** *Rationale*: Every one of these rules was decided in ADR-0006 and ADR-0008, and a rule no patient exercises is a rule nobody has checked. Six JSON fixtures are cheap. *Confidence*: 0.8 — because Kay's coming clinician requirements may add fields, though they shouldn't remove patients. *If wrong*: if the team wants a focused demo, use **B** for the live demo and keep all six in the eval set.

**ANS:** (by Kay)
a

---

## Decision

On 2026-11-14, Kay answered:

- **QST-SYNTH-GLUCOSE: "publicly available data sources"**, an override that replaces the generator (B) with real, de-identified public datasets.
- **QST-SYNTH-PERSONAS: A.** Six patients, one per flowchart path.

### What public data changes

- **The readings are no longer synthetic.** They're real people's de-identified data. The badge changes from **SYNTHETIC** to **Demo patient**, with a note: "Glucose readings come from a public research dataset (cited). Name, age, and history are fictional."
- **Licenses decide where the data lives.** If a dataset allows redistribution (for example CC BY 4.0), the selected windows can be committed with attribution. If not, the dataset stays in a gitignored folder, like the knowledge base, and the gate tests use small committed fixtures. Every license gets checked on the dataset's own page before anything is downloaded.
- **Scenarios have to be found, not written** (QST-SYNTH-SCENARIOS). A real trace has "exactly 3 lows in 48 hours with one under 54" only if someone lived it.
- **A real person's trace gets a fictional patient's details.** The persona's age, history, and flags are invented, but the trace came from someone else. That's acceptable when it's labeled, but it isn't consistent unless the regimen also comes from the same subject (QST-SYNTH-REGIMEN-SOURCE).
- **Timestamps still shift to load time.** Each trace's real dates are discarded, and the window is re-anchored to end at load time, so "the last 48 hours" works in a demo.

### Candidate datasets (licenses to verify on each dataset's page before use)

| Dataset | What's in it | License as reported | Fit |
|---|---|---|---|
| **ShanghaiT1DM / ShanghaiT2DM** (Zhao et al., *Scientific Data* 2023; figshare collection doi:10.6084/m9.figshare.c.6310860) | CGM, fingersticks, **blood ketones**, diet, **insulin doses**. 12 type 1 and 100 type 2 patients | CC BY 4.0, per a secondary source (the MetaboNet preprint) | **Best fit**: the only candidate found with type 2 patients, insulin doses, and ketones. Patient ages and glucose units haven't been checked yet (it may use mmol/L, which converts at ×18) |
| **HUPA-UCM** (Hidalgo et al., *Data in Brief* 2024; Mendeley doi:10.17632/3hbcscwz44.1) | CGM (FreeStyle Libre 2), insulin doses, carbs, steps, heart rate, sleep. 25 type 1 patients | CC BY 4.0 per the MetaboNet preprint. The article itself is CC BY-NC-ND, which may not apply to the data | Type 1 patients only (patients 3 and 5) |
| **OpenAPS Data Commons** | A very large set of automated-insulin-delivery data, mostly type 1 | Access terms not confirmed | Probably requires an application. Use only if the others don't cover a scenario |

**A gap**: no open dataset was found of **older adults with type 2 diabetes on insulin**, who are this bot's main audience. ShanghaiT2DM is the closest, and its age range has to be checked. If no subject fits, the persona's age stays fictional, and that is noted.

---

### QST-SYNTH-SCENARIOS: How does each demo patient get its scenario out of real data?
- Status: answered
- Why asking: Kay chose public datasets for glucose readings. Each of the six demo patients exercises one triage rule (ADR-0006), for example: more than 2 lows in 48 hours with one under 54; above 350 for hours; pump failure with a steady rise; or steady readings. Real traces contain these only if a subject actually had them, and some, like a pump occlusion or rising ketones, may not be in any open dataset.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Search, and fill gaps with labeled overlays**: A script searches the datasets for a window matching each scenario (for example, any 48 hours with 3 or more readings under 70, one under 54). If no window matches, take the closest real window and overlay the missing event, and the patient's data card says so ("event added for the demo").
- **B — Real windows only**: Only scenarios found in real data are used. Patients whose scenario isn't found are dropped or changed to match what exists.
- **C — Real background, every event added**: Use real traces only for normal day-to-day variation, and insert every scenario event deliberately.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Search, and fill gaps with labeled overlays.** *Rationale*: A keeps as much real data as the scenarios allow. That's why Kay chose public data, and it still guarantees every triage rule has a patient that exercises it, which Kay asked for when choosing six patients (QST-SYNTH-PERSONAS: A). B risks losing exactly the rare, dangerous scenarios the bot most needs to handle. C goes back to generating data, which is what Kay just moved away from. The label keeps it honest. *Confidence*: 0.7 — because how many scenarios real data actually contains is unknown until the search runs. *If wrong*: if the search finds every scenario in real data, A becomes **B** in practice, with no overlays. If it finds almost none, revisit the generator (the original option B of QST-SYNTH-GLUCOSE) for those patients.

**ANS:** (by Kay)
b

---

### QST-SYNTH-REGIMEN-SOURCE: Where does each demo patient's insulin regimen come from?
- Status: answered
- Why asking: Each demo patient has an insulin regimen that the bot reads back (never shown to the model; ADR-0005). The patients' glucose readings now come from public datasets (ShanghaiT2DM and HUPA-UCM record insulin doses). A hand-written regimen paired with someone else's real trace may not match it. For example, the trace might show the pattern of a mealtime dose the regimen doesn't include.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Hand-written**: The regimens are written to fit each patient's story, as originally proposed. Easy to control, but they may not fit the real trace.
- **B — From the same subject**: Take the regimen from the insulin records of the dataset subject whose trace is used: insulin types, typical doses, and timing, summarized into a read-back regimen. Consistent with the trace, but limited to what the dataset recorded, and Chinese datasets may use insulin brands that are less common in the US.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — From the same subject**, falling back to **A** when the subject's records are incomplete. *Rationale*: A regimen that matches its trace is what makes the read-back believable to a clinician, and it costs little once the data is loaded. Brand names can be mapped to US equivalents of the same insulin type (the generic name stays the same). *Confidence*: 0.65 — because I haven't seen how complete the datasets' dose records are. *If wrong*: if the dose records turn out to be sparse or hard to interpret, flip to **A** for all patients.

**ANS:** (by Kay)
b if exists

---

## Answers recorded in iteration 3

- **QST-SYNTH-SCENARIOS: B.** Real windows only, with no added events. A patient whose scenario isn't found in real data has its story changed to match a window that exists, or is dropped.
- **QST-SYNTH-REGIMEN-SOURCE: B where it exists.** The regimen comes from the same dataset subject's insulin records, or is hand-written when those records are missing.

**A correction to my own recommendation, stated explicitly.** My rationale for SCENARIOS A said every triage rule needs a patient *whose data contains* the scenario. That overstated it. Under QST-TRIAGE-CGM: A (read-back only), triage reads **what the patient types and the profile flags, never the CGM trace**. A pump-failure, pregnancy, or >350 rule is tested by the conversation, not by the readings. So B costs much less than I claimed. The trace only has to be *consistent* with the story the demo patient tells: if the demo patient types "I'm at 380", the read-back must not show 110. Concretely:

- Patients whose story depends on what the read-back shows (2: highs, 4: repeated lows) need a matching real window, and the search looks for those first.
- Patients whose red flag is a fact or something the patient says (3: pump failure and DKA history, 5: pregnancy) can use any plausible window from a matching subject (type 1, insulin pump if available).
- If no window fits a patient's story, the story changes. The rule still gets tested through the conversation.

---

## Trade-offs

- **Plausible, not physiological.** The generator draws traces that look right, not ones that model insulin action. That's fine for read-back and triage tests, and not suitable for anything that would reason over trends (out of scope; ADR-0006, QST-TRIAGE-CGM: A).
- **Doses in a public repo.** The fixtures contain plausible insulin doses for fictional people. They're synthetic and labeled as such, but a reader could still mistake them for guidance, so the fixture files carry a header comment saying they're not clinical guidance.

---

## Open Follow-ups

- [ ] **A clinician should check the regimens and traces for plausibility.** If something reads as wrong, it undermines the demo. Add this to the review list from ADR-0006's clinical assumptions log.
- [ ] **Relative timestamps weaken the reason for QST-TRIAGE-CGM: A.** That question was answered read-back-only partly because a static synthetic reading would pose as current. With timestamps relative to load time, the latest reading *is* current within the demo. Kay may want to revisit it (ADR-0006). It isn't reopened here.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay asked how the fake patient data, glucose numbers, and insulin regimens will be filled in.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Proposed the patient record, glucose generator, and loading. Two questions posed.
- Outcome: Draft

### Iteration 2 (2026-11-14)
- Trigger: Kay answered QST-SYNTH-GLUCOSE with "publicly available data sources" and QST-SYNTH-PERSONAS: A.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision added. Real de-identified data replaces generated readings, and the label changes. Candidate datasets are listed, with licenses still to verify. The missing dataset for older adults with type 2 diabetes is noted. Two follow-ups opened: QST-SYNTH-SCENARIOS and QST-SYNTH-REGIMEN-SOURCE.
- Outcome: Draft (two questions open)

### Iteration 3 (2026-11-14)
- Trigger: Kay answered QST-SYNTH-SCENARIOS: B and QST-SYNTH-REGIMEN-SOURCE: "b if exists"
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Both answers recorded. My SCENARIOS rationale is corrected explicitly: triage reads what the patient says and the profile flags, never the trace, so real-windows-only is safe. The trace only needs to match the patient's story.
- Outcome: Draft → Accepted

---

## Links

- Related ADRs: ADR-0005 (regimen read-back; the model never sees profile data), ADR-0006 (rules these patients exercise; QST-TRIAGE-CGM), ADR-0008 (the HIGH-TOUCH fields fed by clinic history; storage)
