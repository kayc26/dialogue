<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0002: Play model — daily puzzle, unlimited, or both

- **Date**: 2026-11-12
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Decide whether Bytle is one shared puzzle a day, unlimited random games, or both, because that sets how the answer is picked, what the browser stores, and how fast the word list runs out.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12), founding session. Same prompt as ADR-0001: a Wordle-style game with CS-word answers, Vue, free GitHub Pages hosting.

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **Kay's prompt doesn't say how often you play.** The genre's best-known form is one shared word per day, but that's a design choice, not part of the mechanic.
2. **GitHub Pages is static hosting, so there is no server.** Any "daily" word must be computed in the browser from the date: the day number indexes a fixed, pre-shuffled answer list. Any saved progress lives in the player's own browser (`localStorage`).
3. **The mode changes how fast the list runs out.** At one word a day, 150 answers last about five months, which makes this decision a requirement on ADR-0001's list.

**Assumptions**:

- **The answers are not secret.** They ship inside the JavaScript bundle, and anyone with devtools can read them; static hosting can't prevent that. Light obfuscation (e.g., encoding the list) stops accidental spoilers, not determined ones. I'm treating that as fine for a game.
- If there's a daily mode, the day changes at the player's **local midnight**, as is standard in the genre.

**Confirm**: Kay. Is "answers are readable in the bundle" acceptable?

---

## Questions

### QST-PLAY-MODEL: One shared puzzle per day, unlimited random games, or both?
- Status: unanswered
- Why asking: Bytle runs on GitHub Pages with no server, so the answer must be picked in the browser, either from today's date (everyone gets the same word) or at random (a new word each game). That choice shapes the game state, what we save in the browser (streaks and stats or not), whether a "share your result" grid makes sense, and how fast ADR-0001's answer list runs out.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Daily only**: One answer per calendar day, the same for every player, computed from the date. One game a day. Progress, streaks, and stats are saved in the browser, and you can copy an emoji result grid to share. Cost: the list runs out at one word per day (150 words ≈ 5 months before repeats), plus some date logic.
- **B — Unlimited only**: A random answer every game, with a "New game" button. The simplest option: no dates, no streaks, and the easiest to test by just playing. You lose the shared "everyone got today's word" moment, and a shared result means little when everyone had a different word.
- **C — Daily + practice**: A as the main mode, plus a practice mode that draws random answers and never touches daily stats. Cost over A: one mode switch, and keeping the two game states separate.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-12)

**C — Daily + practice.** *Rationale*: Under ADR-0003's recommended structure, the game engine takes the answer as an input and doesn't care where it came from. The two modes differ only in the one-line function that picks the answer (date to index, or random), so C adds little over A once the engine exists. Daily gives the social hook. Practice turns it into a CS vocabulary trainer, and it lets us and any testers play many rounds in one sitting, which A alone doesn't allow. *Confidence*: 0.65 — because this is mostly a scope call about Kay's goals, not something evidence settles. The low-cost claim depends on ADR-0003's engine/UI split, which isn't decided yet. *If wrong*: if Kay wants the smallest possible v1, flip to **B** (no date logic, ships sooner, daily can be added later without rework). If the shared daily moment is the whole point and practice feels like dilution, flip to **A**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending the answer to QST-PLAY-MODEL.

---

## Open Follow-ups

- [ ] Colorblind-safe feedback. Green/yellow/gray is hard to tell apart for many players, so offer a high-contrast palette option. This is also a chance to give Bytle its own look instead of copying the genre's best-known colors.
- [ ] If daily: decide what happens when the list runs out (reshuffle and repeat, or extend the list).

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's founding prompt asking for the 2–3 decisions to settle before code
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Initial draft; QST-PLAY-MODEL posed with a recommendation
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0001 (word rules: the list this mode uses up), ADR-0003 (stack: the engine/UI split that makes C cheap)
