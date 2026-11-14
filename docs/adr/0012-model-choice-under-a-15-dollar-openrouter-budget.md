<!-- adr template version: "adr-madr 3.12.0" -->
<!-- kept in deliberate homage to MADR — Markdown Architectural Decision Records, the lineage this template family descends from. This is the simple-decisions form: use it when a decision needs recording, not discussion. The deliberation-native form is adr.md. Mint with `just adr "<title>" madr`. (Ruling: QST-MADR-FATE, 2026-08-13 — "keeping the template, acknowledging it, is good form.") -->
<!-- A question is legal here: when a simple decision still carries ONE open question, add a `### QST-<ID>: …` heading with its own `- Status:` line (under an "Open question" section if you like) — parsers and the ADR Manager read it identically in both molds (field-proven: a founding seat's MADR question was answered through the extension within the hour). Two or more questions sharing an answering slot → that is adr.md's job, and the question-tours skill's. -->

# ADR-0012: Model choice under a $15 OpenRouter budget

* Status: Accepted
* Deciders: Kay, Nibble (Claude Opus 5.5)
* Date: 2026-11-14

**TL;DR**: Kay has $15 of OpenRouter credit in total, so every model call uses a cheap model. Decided (Kay, QST-MODEL-PICKS: A): Claude Haiku 5.5 writes answers, and gpt-oss-20b runs triage and the conversation monitor. That's roughly $0.0007 per turn, or about 20,000 turns for $15. Spending guards cap each key, each call, and each loop, and no live eval runs without Kay's OK.

Technical Story: Kay (2026-11-14): "when you do any openrouter call, can you choose a cheap model for now, i only have $15 token in total".

## Context and Problem Statement

The bot makes up to three kinds of model calls per turn:
- the **answer** (constrained RAG inside the agent loop, ADR-0005);
- the **triage classifier** (ADR-0006);
- the **conversation monitor**, which runs before display only in sessions flagged for dose or medication topics (ADR-0007: veto only, a small model, ideally from a different family).

Which models keep this well inside $15 without weakening the safety design?

## Decision Drivers

* $15 total credit, shared by development, the eval runs, and every tester.
* The monitor must be a different model family from the answering model (ADR-0007) and small (QST-MONITOR-MODEL: C).
* Tool calling is required for the agent loop (ADR-0005, orchestration B).
* Interactive use, so "batch" variants (cheaper, but delayed) don't fit.

## Considered Options

Prices are OpenRouter's public model list, fetched 2026-11-14, in **$ per 1M tokens, input / output**. All are tool-capable:

| Model | In / out | Note |
|---|---|---|
| `meta-llama/llama-3.1-8b-instruct` | 0.020 / 0.040 | cheapest; weakest at following instructions |
| `mistralai/mistral-nemo` | 0.029 / 0.030 | very cheap |
| `openai/gpt-oss-20b` | 0.030 / 0.130 | small, strong for its price |
| `qwen/qwen3.7-flash` | 0.030 / 0.130 | 1M context |
| `deepseek/deepseek-v4.1-flash` | 0.051 / 0.203 | |
| `anthropic/claude-haiku-5.5` | 0.100 / 0.500 | best instruction-following in the cheap tier |

## Decision Outcome

Proposed (Kay confirms in QST-MODEL-PICKS):

| Role | Model | Why |
|---|---|---|
| Answer writer | `anthropic/claude-haiku-5.5` | This call carries the safety weight: plain language, staying on the cited passages, no dose advice, tool use in the loop. It's the most reliable model in the cheap tier. |
| Triage classifier | `openai/gpt-oss-20b` | A short JSON classification. Fast and cheap. The fixed rules layer runs alongside it regardless (ADR-0006). |
| Conversation monitor | `openai/gpt-oss-20b` | Small, as decided (ADR-0007), and from a **different family** than the answer writer. |
| Development and smoke tests | `openai/gpt-oss-20b` everywhere | Builds and debugging spend almost nothing. Switch the answer writer to Haiku for evals and the demo. |

**Estimated cost**: at about 5k input and 400 output tokens per turn across all calls, a turn costs roughly **$0.0007**. That's about 20,000 turns for $15. Development on gpt-oss-20b costs about $0.0002 per turn. Normal use isn't the risk. Runaway use is.

**Spending guards** (to implement with the bot):

1. **A per-key credit limit on OpenRouter**, set by Kay for each tester key (for example $3), so no single key can drain the account.
2. **A token cap on every call** (`max_tokens`): about 500 for answers and about 100 for the classifier and the monitor.
3. **The 8-round loop cap** stays (ADR-0003). A misbehaving model stops at 8 calls.
4. **No live eval runs without Kay's OK.** The offline gate never calls OpenRouter (all tests there are offline). Each live run (the must-catch set, dose-bait set, and multi-turn set) prints an estimated cost first and needs explicit approval.
5. **Avoid `:free` variants.** They're rate-limited, and some providers log prompts. That matters for a health app even with synthetic data.
6. **Pin the model and provider** (ADR-0006), and re-run the triage evals after any model change.

### Positive Consequences

* $15 covers development, a few eval runs, and the tester sessions with a wide margin.
* The answer model and the monitor come from different families, as ADR-0007 requires.

### Negative Consequences

* Haiku is less capable than larger models at reasoning across several turns. That's acceptable because the monitor and fixed-rule checks don't depend on the answer model being smart.
* Prices change, so re-check them before any large eval run.

## Open question

### QST-MODEL-PICKS: Use these models for now?
- Status: answered
- Why asking: Kay has $15 of OpenRouter credit in total and asked for cheap models. The bot makes three kinds of calls: answers (Haiku 5.5 proposed, $0.10/$0.50 per 1M tokens), triage classification, and the conversation monitor (both gpt-oss-20b, $0.03/$0.13). Estimated cost is about $0.0007 per turn, or roughly 20,000 turns for $15.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Haiku for answers, gpt-oss-20b for triage and monitor**: As proposed. Development runs everything on gpt-oss-20b, and evals and the demo use Haiku for answers.
- **B — gpt-oss-20b for everything**: About three times cheaper per turn, but the monitor would be the same model family as the answer writer, which ADR-0007 asked to avoid, and answer quality is lower.
- **C — Cheapest everywhere (llama-3.1-8b or mistral-nemo)**: The lowest cost, but weak instruction-following. That's a real risk for the "stay on cited passages, no dose advice" answer path.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Haiku for answers, gpt-oss-20b for triage and monitor.** *Rationale*: At about $0.0007 per turn, the budget isn't what limits this project. Unattended loops and big eval runs are, and the guards handle those. So the money is better spent on the one call that carries the safety weight. B saves cents and breaks the separate-model-family rule in ADR-0007. C puts the answer path on models that drift most from instructions. *Confidence*: 0.75 — because the per-turn token estimate is mine and unmeasured. The first smoke test will measure it. *If wrong*: if measured cost per turn comes in more than about 5× my estimate, flip to **B** for development and keep **A** only for the demo.

**ANS:** (by Kay)
a

---

## Links

* Budget for the calls in [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (answers), [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md) (triage), and [ADR-0007](0007-diabetes-education-bot-a-second-model-that-monitors-the-conversation.md) (monitor)
* Key handling: [ADR-0001](0001-api-key-handling-how-the-openrouter-key-gets-in-and-where-it-lives.md); round cap: [ADR-0003](0003-v1-scope-what-makes-it-a-harness-and-not-just-a-chat-box.md)
