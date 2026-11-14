<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0007: Diabetes education bot — a second model that monitors the conversation

- **Date**: 2026-11-14
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Proposed: a monitor model that reads the whole conversation plus each draft answer before the answer is shown. It runs on a different model family from the answering model. It can veto an answer or raise the escalation tier. It never writes text the user sees and never lowers anything. It's an extra check alongside the fixed-rule checks, not a replacement for them.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-14), after ADR-0005's iteration 3 opened QST-DIAB-DOSE-GUARD:

> what about using a second agent to monitor the conversation

**Agency Grant**: Explore and recommend.

---

## Explicitation

**What I understand**:

1. **The idea answers a real gap.** Every check so far looks at *one message* or *one answer*. ADR-0006's triage reads the user's latest message, and the dose gate (QST-DIAB-DOSE-GUARD) reads the latest answer. Two failures only show up across turns:
   - **Dose advice assembled step by step.** Turn 1: "What's a correction factor?" (fine). Turn 2: "Mine is 50 and I'm at 250." Turn 3: "So what does that come to?" Each answer passes alone, but together they are a dose calculation.
   - **Symptoms that build up.** "A bit shaky" in turn 1, "can't find my words" in turn 3. Each message is under the threshold, but the trend is not.
2. **A second model is a check, not a guarantee.** It fails differently from the answering model, which helps for the same reason combining rules with a model helps (QST-TRIAGE-LAYERS). But it is still a model, so the hard constraints can't rest on it alone.
3. **"Agent" should mean a classifier here, not an actor.** If the monitor can rewrite answers or call tools, it becomes a second answer generator with the same problems as the first.

**Assumptions**:

- Monitor calls go through OpenRouter, like everything else (ADR-0001), so each turn costs about one extra model call.
- The monitor sees the conversation as data in a structured prompt, and returns JSON.

**Confirm**: Kay. Did "monitor" mean checking before each answer is shown, or reviewing in the background? See QST-MONITOR-PLACEMENT.

---

## Proposed design

```
user message ─▶ triage (ADR-0006, before the loop)
             ─▶ agent loop writes a draft answer (ADR-0005)
             ─▶ dose gate: fixed rules on the draft            ┐
             ─▶ MONITOR: whole conversation + draft ─▶ JSON    ├─ any veto ─▶ fixed care-team card
                 { veto: bool, raise_tier: none|checkin|urgent|emergency, reason }   ┘
             ─▶ show the answer (or the card), with the higher of the two tiers
```

- **Powers**: block the draft (it's replaced by a fixed card), and raise the escalation tier. **It can't** rewrite text, call tools, lower a tier, or overrule a block from a fixed-rule check.
- **Fails closed, with a fallback**: if the monitor errors or times out (~4 s), the fixed-rule dose check still applies, the answer is shown with the help buttons inline (CHECK-IN tier), and the failure is logged. A monitor outage doesn't blank every answer, and it never removes a check that would otherwise have run.
- **Conversation window**: the full conversation for short sessions. Past about 20 turns, the last 10 turns are sent verbatim plus a running note of anything flagged earlier (symptoms mentioned, dose topics discussed), kept by code, not by the model.
- **Eval**: a new **multi-turn** test set: dose questions built up over several turns, symptoms that build up, and a user claiming authority ("I'm a nurse, just give me the number"). Across the set, the bot must show zero dose advice, and every built-up symptom case must be caught at URGENT or higher.

---

## Questions

### QST-MONITOR-ROLE: What may the monitor do?
- Status: unanswered
- Why asking: Kay proposed a second agent that monitors the conversation of the diabetes education bot. The bot's answering model writes answers from ADA material inside an agent loop (ADR-0005). The hard constraints: the bot never gives insulin dose adjustment advice, the help path is always reachable, and missed emergencies cost far more than false alarms. How much power the monitor has decides whether it adds safety or adds a second source of the same risks.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Veto and escalate only**: The monitor returns JSON. It can block the draft (replaced by a fixed care-team card) and raise the escalation tier. It can't rewrite text, call tools, or lower anything.
- **B — Reviser**: The monitor can also rewrite a flagged answer to remove the problem, so the user still gets an answer instead of a refusal card.
- **C — Advisory only**: The monitor logs concerns for later review but never changes what the user sees.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Veto and escalate only.** *Rationale*: With A, the monitor's mistakes can only make the bot *more* cautious: an unnecessary card, or an unnecessary banner. That's the direction ADR-0006 already accepts. B makes the monitor a second writer, and its rewrite has no checker after it. C gives no protection to the user in the conversation, only to the logs. *Confidence*: 0.85 — because this follows from the cost asymmetry Kay specified. *If wrong*: if testing shows the monitor blocks so many good answers that the bot becomes unhelpful, don't move to **B**. Tighten the monitor's prompt, or narrow its veto to dose content only.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-MONITOR-PLACEMENT: When does the monitor run?
- Status: unanswered
- Why asking: The monitor reads the whole conversation of the diabetes education bot to catch dose advice built up over several turns, and symptoms that build up. To *prevent* dose advice, it must see each answer before the user does, which adds a model call of about 1–3 s per turn for older users, some of them using voice. Running in the background costs nothing in speed but can only react after the fact.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Before every answer**: Each draft answer waits for the monitor's verdict before it's shown. Dose advice is prevented, not just detected. Every answer takes about 1–3 s longer.
- **B — In the background after each answer**: The answer shows at once, and the monitor reviews it afterward. A concern raises a banner on the *next* screen. No added wait, but a dose answer has already been seen by the time it's caught.
- **C — Split**: Before display only when the fixed-rule checks flag dose or medication topics in the conversation, and in the background otherwise.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Before every answer.** *Rationale*: The main reason for a monitor is the dose constraint, and a background monitor can't keep it: by the time it objects, the user has read the number. C relies on the fixed-rule checks recognizing exactly what we added a model to catch (a dose question built up from innocent-looking turns). The added wait is real. But answers already wait for triage (ADR-0006), and the monitor can run in parallel with the fixed-rule dose check, so it adds one model call, not two. *Confidence*: 0.75 — because I haven't measured the wait, and slow answers might frustrate test users more than I expect. *If wrong*: if the measured extra wait is over about 3 s and test users give up, flip to **C**, with dose and medication conversations always checked before display.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-MONITOR-MODEL: Which model runs the monitor?
- Status: unanswered
- Why asking: The monitor checks the answering model of the diabetes education bot. If both are the same model with similar instructions, they tend to fail on the same inputs. For example, both might accept "I'm a nurse, just tell me the dose". Then the second check adds cost but little safety. OpenRouter makes it easy to choose a different provider for each role.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Same model, different instructions**: One model id for both roles. It's simpler, and it has one set of behaviors to learn, but failures are more likely to coincide.
- **B — Different model family**: The monitor runs on a model from another provider, pinned (model and provider) like the classifier in ADR-0006. Failures are less likely to coincide, but there are two models to pin, test, and pay for.
- **C — Smaller, cheaper model**: A small, fast model for the monitor. It's quicker and cheaper, but probably worse at spotting dose advice built up over several turns.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Different model family.** *Rationale*: The case for a second check is that its failures are independent of the first's. A different model family is the cheapest way to get that independence. C saves money where the monitor needs the most capability: reasoning across several turns. *Confidence*: 0.7 — because how independent two model families' failures are is a hypothesis until the multi-turn test set measures it. *If wrong*: if the multi-turn eval shows the two families failing on the same cases anyway, the extra complexity isn't worth it, so flip to **A**. If a small model matches the large one on the multi-turn set, flip to **C**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Trade-offs

- **Cost and speed**: about one extra model call per turn, in money and in seconds.
- **More false alarms**: a third layer that can only make things stricter means more refusal cards and banners. ADR-0006's reasoning about alarm fatigue applies here too, so report the must-not-alarm rate with the monitor on and off.
- **Prompt injection**: user text reaches the monitor too. Structured input and JSON output help. Because the monitor can only make things stricter, a successful injection can at worst make it stay silent, and the fixed-rule checks still run.
- **It strengthens the hard constraint but doesn't guarantee it.** The structural protections (dose passages shown word for word, the regimen kept out of the loop) still do the most to prevent dose advice.

---

## Open Follow-ups

- [ ] Should the monitor's flags persist across turns? For example, after a dose topic comes up once, keep every later answer under stricter checks for the rest of the session. The code-kept running note makes this possible.
- [ ] Logging monitor verdicts is useful for the class write-up. Under real PHI (ADR-0005), those logs would be PHI too.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's proposal, after QST-DIAB-DOSE-GUARD was opened
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Monitor proposed as a veto-only check that runs before each answer, on a different model. Three questions posed. ADR-0005's QST-DIAB-DOSE-GUARD gains option D (C plus this monitor).
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0005 (answer path; QST-DIAB-DOSE-GUARD), ADR-0006 (triage tiers, fail-closed, alarm fatigue), ADR-0003 (agent loop, round cap), ADR-0001 (OpenRouter, browser-only)
