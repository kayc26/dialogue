<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0001: Word rules — answer length and what counts as a valid guess

- **Date**: 2026-11-12
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Tessera (Claude Opus 5.5)

**TL;DR**: The CS twist clashes with the genre's core mechanic, so before any code we need to fix how long answers are and which typed words the game accepts as guesses.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12), founding session:

> The project is a Wordle variant — guess the word, colored feedback per letter — with a twist: the answers are computer science words (ARRAY, STACK, QUEUE, CACHE, TOKEN…). I want it hosted free on GitHub Pages, built with Vue using scoped CSS so styles stay component-local. Before you write any code: what are the 2–3 decisions we should settle first?

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **The genre's strategy depends on two rules that the CS theme puts under pressure.** One is a fixed word length. The other is freedom to guess any real word just to probe letters (an opening like CRANE tests five common letters). CS vocabulary comes in every length (HEAP, KERNEL, POINTER), and many CS terms aren't English words (MUTEX, REGEX, ASYNC).
2. **This choice decides the data, the layout, and the tests.** It sets which word lists ship in the bundle, how wide a board row is, and the word-list checks the gate runs (CLAUDE.md, Fifth Directive).

**Assumptions**:

- Six guesses, and the usual three feedback states per letter: right letter in the right spot, right letter in the wrong spot, letter not in the word. Kay's prompt implies this and I'm treating it as settled.
- Duplicate letters are scored the standard way (each answer letter can be "used" by only one guessed letter). That's correctness, not a choice, so the gate tests it.
- No plurals and no product or brand names as answers (LINUX, MYSQL). Brands raise trademark questions, and plurals are filler. This is my default; listed as a follow-up below.

**Confirm**: Kay. Does the theme fight the mechanic the way I describe?

---

## Questions

### QST-WORD-RULES: How long are answers, and what may a player type as a guess?
- Status: unanswered
- Why asking: Every answer is a CS term (ARRAY, STACK, CACHE…). The genre works because word length is fixed and a player may guess *any* real word to probe letters, even words that can't be the answer. CS terms come in many lengths, and many aren't English words (MUTEX, REGEX). The rule we pick decides which word lists ship in the bundle, how wide the board is, and what the gate tests, so it has to come before the scaffold.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Five letters, open guesses**: Every answer is a 5-letter CS term from a list we curate. A guess counts if it's on that CS list *or* in a public-domain English list of 5-letter words (for example the ENABLE word list). Players can open with ordinary words to probe letters and still need CS knowledge to finish. Cost: we ship a dictionary of several thousand words (my estimate is tens of KB, not yet measured), and the CS list must be merged into the guess list or nobody could type MUTEX.
- **B — Five letters, CS-only guesses**: A guess counts only if it's on the CS list. Smallest bundle and the purest theme, since every guess is a term you learn. But with only a few hundred allowed words, letter-probing mostly disappears and ordinary words get rejected ("CRANE: not in word list"). It plays more like a vocabulary quiz than a deduction game. Pick it if the quiz feel is the point.
- **C — Variable length, open guesses**: Answers run 4–7 letters (HEAP, BINARY, POINTER). Each puzzle's row width matches its answer and is shown up front. This unlocks the most iconic CS words (POINTER, LAMBDA, THREAD, KERNEL). Cost: a dictionary per length, a board that reflows (7 tiles on a phone is tight), and roughly three times the word-list test surface.
- **D — Five letters, no validation**: Any five letters are accepted. No dictionary at all, so it's the simplest. But players can type non-words full of vowels just to probe, which removes most of the deduction challenge.

**Recommendation**: (by Tessera, Claude Opus 5.5, 2026-11-12)

**A — Five letters, open guesses.** *Rationale*: All five of Kay's example answers (ARRAY, STACK, QUEUE, CACHE, TOKEN) are five letters, and a first brainstorm (Supporting Materials, below) turns up about 60 more without strain, so length 5 doesn't starve the theme. Open guesses keep the deduction that makes the genre fun (rules out B and D). The CS twist then comes from the answer set and from the post-game definition (follow-up below), not from blocking ordinary words. C has the best vocabulary, but its layout and multi-list cost doesn't belong in v1, and it can come later as a mode on top of A. *Confidence*: 0.8 — because the length evidence is a count I did myself and Kay's own examples are all five letters. What I haven't checked is the dictionary's real size in the bundle, and the license of the specific list we'd pick. *If wrong*: if curating can't reach about 150 *good* 5-letter terms (fewer than five months of daily puzzles under ADR-0002), flip to **C**. If Kay wants the game to work as a vocabulary drill, flip to **B**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Supporting Materials

### NOT: seed list — 5-letter CS terms, first brainstorm (unvetted)

ARRAY STACK QUEUE CACHE TOKEN GRAPH MUTEX REGEX PARSE QUERY INDEX LOGIC FLOAT CLASS BUILD DEBUG MERGE SHELL PIXEL ROUTE PROXY ASYNC AWAIT YIELD FETCH CLONE SCOPE TUPLE FIELD LOCAL STATE EVENT CYCLE LATCH BLOCK CHAIN SPAWN ARITY CURRY MONAD QUBIT THROW CATCH PRINT INPUT WHILE BREAK CONST UNION FRAME ERROR VALUE ALIAS MACRO BATCH SHARD TABLE CRASH PATCH STASH FLOOR ROUND LIMIT RANGE SLICE SPLIT STDIN

That's 64 words. Some are only loosely CS (ROUND, FLOOR, CRASH); vetting is a later pass. Here is what option C would add: HEAP TREE HASH LOOP BYTE NODE · KERNEL BINARY LAMBDA SCHEMA COMMIT REBASE SOCKET MEMORY THREAD BUFFER · POINTER COMPILE.

---

## Decision

Pending the answer to QST-WORD-RULES.

---

## Open Follow-ups

- [ ] Each answer carries a one-line definition shown when the game ends (e.g., "MUTEX — a lock that lets only one thread into a critical section at a time"). That's where the CS twist teaches something. It's cheap if decided before the list format is fixed; I'd say yes by default.
- [ ] Exclusion policy: no plurals, no product or brand names (LINUX, MYSQL, NGINX). My default, not yet confirmed.
- [ ] Choose the English guess list by **license first** (public domain or permissive). Never copy another game's published word lists.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's founding prompt asking for the 2–3 decisions to settle before code
- Contributors: Kay, Tessera (Claude Opus 5.5)
- Changes: Initial draft; QST-WORD-RULES posed with a recommendation
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0002 (play model: how quickly the answer list gets used up), ADR-0003 (stack: where the word lists live and how the gate checks them)
- Related: CLAUDE.md Fifth Directive (word-list integrity is one of the gate's three bug classes)
