<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0009: Diabetes education bot — synthetic patients, glucose data, and insulin regimens

- **Date**: 2026-11-14
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Proposed: six hand-written synthetic patients, each built to exercise one path through the clinic's flowchart, with plausible insulin regimens and profile history. Their glucose data comes from a seeded generator script with scripted events, using timestamps relative to load time so "the last 48 hours" means something in a demo. All of it is committed as clearly marked synthetic fixtures and loaded from a demo patient picker.

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

In demo mode, a **Choose a demo patient** picker writes the fixture into browser storage (ADR-0008, QST-HANDOFF-STORAGE). A **Reset** button restores it. No patient is loaded by default.

---

## Questions

### QST-SYNTH-GLUCOSE: How are synthetic glucose readings produced?
- Status: unanswered
- Why asking: The diabetes education bot needs fake glucose data for each synthetic patient. The data is used for read-back, for the demo, and as test cases for the triage rules: above 350 mg/dL is urgent, below 54 is a severe low, and more than 2 lows in 48 hours is a red flag (ADR-0006). The data must look plausible *and* contain exact scenarios on demand.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Hand-written readings**: For each patient, someone types out a few dozen readings that tell the scenario's story. Exact control and no tooling, but no continuous CGM trace, and tedious to change.
- **B — Seeded generator plus scripted events**: A script produces 14 days of plausible readings (a daily rhythm, meal rises, noise) and inserts exact events at chosen times. Timestamps are relative to load time. Reproducible, testable, and easy to change.
- **C — Physiological simulator**: An open-source implementation of the UVA/Padova type 1 simulator (for example, `simglucose` in Python) generates traces from meals and insulin. Most realistic, but it models type 1 only, scripting an exact event means tuning inputs until it happens, and it adds a Python toolchain.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Seeded generator plus scripted events.** *Rationale*: The data exists to exercise specific rules, and B is the only option where "exactly 3 lows in 48 hours, one under 54" is a line of configuration rather than a search. It can be tested in the existing gate (`vitest`). Realism only has to be good enough to read back convincingly, which is a lower bar than C targets. C also can't produce the type 2 patients, who are most of this audience. *Confidence*: 0.75 — because plausible-looking traces from a simple model may still look wrong to a clinician. *If wrong*: if a clinician reviewing sample traces says they look unrealistic in ways that matter for the demo, use **C** for the type 1 patients and keep **B** for the rest.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-SYNTH-PERSONAS: Which synthetic patients do we build?
- Status: unanswered
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
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

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

---

## Links

- Related ADRs: ADR-0005 (regimen read-back; the model never sees profile data), ADR-0006 (rules these patients exercise; QST-TRIAGE-CGM), ADR-0008 (the HIGH-TOUCH fields fed by clinic history; storage)
