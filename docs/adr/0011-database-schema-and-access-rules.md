<!-- adr template version: "adr-madr 3.12.0" -->
<!-- kept in deliberate homage to MADR — Markdown Architectural Decision Records, the lineage this template family descends from. This is the simple-decisions form: use it when a decision needs recording, not discussion. The deliberation-native form is adr.md. Mint with `just adr "<title>" madr`. (Ruling: QST-MADR-FATE, 2026-08-13 — "keeping the template, acknowledging it, is good form.") -->
<!-- A question is legal here: when a simple decision still carries ONE open question, add a `### QST-<ID>: …` heading with its own `- Status:` line (under an "Open question" section if you like) — parsers and the ADR Manager read it identically in both molds (field-proven: a founding seat's MADR question was answered through the extension within the hour). Two or more questions sharing an answering slot → that is adr.md's job, and the question-tours skill's. -->

# ADR-0011: Database schema and access rules (tables and RLS on Neon)

* Status: Accepted
* Deciders: Kay, Nibble (Claude Opus 5.5)
* Date: 2026-11-14

**TL;DR**: Nine tables in `public`. Access depends on membership in `public.members`, not on being signed in. The patient's consent choice (ADR-0008) is enforced by the database itself. 20 access tests, each signing in as a real role, pass on a throwaway branch and were shown to catch a deliberately weakened rule. The same migration is applied to production.

Technical Story: Kay: "yes" to building the tables and access rules after locking down sign-in (ADR-0010, iteration 7).

## Context and Problem Statement

The site is public and talks to Neon directly from the browser (ADR-0010). So the database's own grants and row-level security (RLS) are the *only* thing between a stranger and the data. Which tables, and which rules, carry out the decisions in ADR-0005, 0008, 0009, and 0010?

## Decision Drivers

* Anyone can hold an account, so being signed in must grant nothing (ADR-0010).
* Consent C (ADR-0008): a summary the patient keeps stays private, even from the care team. A shared one reaches the sponsor's inbox along with its transcript.
* Least privilege. The project has no default grants, so each table is closed until it's opened on purpose.
* The rules have to be *tested by signing in as each role*, not assumed. `auth.user_id()` trusts only a signed token (`pg_session_jwt`), so SQL can't impersonate a user.

## Considered Options

* RLS keyed on membership, enforced in the database, and tested end to end against a branch (chosen)
* RLS keyed on "signed in" (`authenticated`), with app-side checks for roles
* App-side filtering only (no RLS)

## Decision Outcome

Chosen option: **membership-keyed RLS, enforced in the database, tested end to end**. It's the only option that holds when the attacker is someone with an account calling the Data API directly, bypassing our app.

The migration is `db/migrations/0001_schema_and_rls.sql`:

| Table | Who reads | Who writes |
|---|---|---|
| `members` | yourself; the sponsor sees everyone | no one through the API (Kay or Nibble, as admin) |
| `patients`, `glucose_readings`, `kb_chunks` | members | no one through the API (loaded as admin) |
| `sessions` | the owner; the sponsor sees *shared* sessions | the owner creates and ends them (`ended_at` only) |
| `messages`, `triage_events` | the owner; the sponsor sees *shared* sessions | the owner |
| `summaries` | the owner; the sponsor sees `shared <> 'kept'` | the owner (`fields`, `criteria_met`, `shared`) |
| `replies` | the session owner and the sponsor, on shared summaries | the sponsor only, on shared summaries |

* **Membership helpers** live in schema `app`, which isn't exposed: the Data API serves `public` only. They're `SECURITY DEFINER` with a pinned `search_path`, so policies can check membership without going in circles.
* **No un-sharing**: a trigger rejects changing a shared summary back to `'kept'`. Once a nurse may be acting on a record, it can't quietly disappear.
* **Column-level update grants**, so a tester can't rewrite `sessions.user_id` and take over a session.
* **Anonymous**: no grants on any table. Requests with no token get **401** (checked on production).

**Tests**: `db/tests/rls.test.ts`, run with `npm run test:db`, outside the offline gate because they need the network. They run against branch **`rls-dev`** (`br-curly-hall-be03h6ji`) with four throwaway users: two testers, a sponsor, and a signed-in stranger who isn't a member. Their password lives only in the session's scratchpad, never in the repo. Sign-up was turned on for that branch alone just long enough to create them, then turned off again. Result: **20/20 pass**.

**Mutation check.** The tests were proven able to fail. With `summaries_read` weakened to `using (true)`, the two consent tests failed. The run also exposed a gap: the stranger test only checked reference tables, so a stranger could read every summary with no test failing. It was widened to cover every table, failed under the weakened rule (3 failures in total), and passed after the rule was restored. See the vignette `docs/vignettes/2026-11-14-the-suite-that-passed-too-easily.md`.

**Production**: the same 63 statements were applied to `production` (`br-winter-forest-beewzuyw`). A re-read shows 9 tables, RLS on every one, 16 policies matching `rls-dev`, no `anonymous` access, and 401 without a token. No test users exist on production.

### Positive Consequences

* The consent rules from ADR-0008 hold even against direct API calls, not just inside our UI.
* Adding a tester is one `members` row. Removing them takes one delete and cuts off access everywhere.

### Negative Consequences

* Policy changes need the same loop: migration, `rls-dev`, `npm run test:db`, then production. Until there's a migration runner, statements are applied through the Neon connection with the splitter in `scripts/ephemeral/2026-11-14-split-sql.mjs`.
* `rls-dev` holds test accounts and costs compute while it's active (see the open question).

## Open question

### QST-RLS-DEV-BRANCH: Keep the `rls-dev` branch for future access tests, or delete it?
- Status: unanswered
- Why asking: The access tests (`npm run test:db`) need a Neon branch with the schema, four throwaway test accounts, and placeholder fixtures. That's `rls-dev` in project `diabetes-chatbot`. It isn't production and holds no real data, but its test accounts can sign in, and the branch uses some compute when active.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Keep it**: Leave `rls-dev` in place. Every future policy change is tested against it with `npm run test:db` before production. Its compute suspends when idle.
- **B — Delete it now, recreate when needed**: Delete the branch. The next policy change recreates it from production (schema included) and re-creates the test accounts, which takes about 10 minutes of setup.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Keep it.** *Rationale*: The very next steps (loading the knowledge base, the app's own writes) will touch these tables and should be checked against the same suite. Recreating the branch and accounts each time costs more than leaving an idle branch, which suspends. The test accounts exist only on that branch, and its sign-up is off. *Confidence*: 0.75 — because it depends on Neon plan limits I haven't checked for this account. *If wrong*: if idle branches count against a free-plan limit Kay cares about, flip to **B**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Links

* Implements [ADR-0010](0010-diabetes-education-bot-how-test-users-reach-it.md) (Neon, Data API, sign-in, membership rule)
* Enforces [ADR-0008](0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md) consent C and reply path C
* Stores data defined in [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (knowledge base) and [ADR-0009](0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md) (demo patients, readings)
