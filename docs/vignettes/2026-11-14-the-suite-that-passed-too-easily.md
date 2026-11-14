# The Suite That Passed Too Easily

**Date**: 2026-11-14
**Authors**: Kay, Nibble (Claude Opus 5.5)
**Topic**: A green access-control suite was made to fail on purpose, and the failure showed what it had never checked.

## The Discovery

The diabetes bot's database is reached straight from a public web page (ADR-0010). The only thing standing between a stranger and every patient conversation is Postgres row-level security. So the rules got a real test suite. It signs in as four actual accounts on a throwaway Neon branch (two testers, a sponsor, and a signed-in stranger who isn't a member) and checks what each one can read and write through the Data API.

The first run: **20 passed**.

That's the moment to be suspicious. A security suite that's green on its first run has proven one of two things: the rules are right, or the tests can't tell. From the outside, the two look identical.

So one rule was broken on purpose. The policy deciding who may read conversation summaries was replaced with `using (true)`, so everyone reads everything. Then the suite ran again.

Two tests failed, the ones guarding consent: "tester B can't see tester A's summary" and "the sponsor can't see a summary the patient kept private". Good. But under that broken rule, a **stranger**, someone with an account and no membership, could also read every summary. And the stranger test still passed.

It passed because it only asked about demo patients, readings, the knowledge base, and members. It never asked about conversations. The one role the whole design worries about most, the outsider with an account, was being checked on the tables that matter least.

The test was widened to every table. Under the broken rule it failed, three failures in all. The real rule went back in, and the suite was green again: **20 passed**, this time with evidence that green means something.

## Why This Matters

The stranger-with-an-account is exactly the risk ADR-0010 was built around. Neon's sign-up can be turned off, but "being signed in" is still a role every account gets, so membership is the real gate. A future change to a conversation table's policy could have leaked every summary to any account, and the suite would have stayed green. That's the worst kind of regression: silent, total, and certified.

## The Fourth Directive at Work

*Tests must be meaningful, not contrived.* "Would this test catch a real bug that would affect users?" can't be answered by reading a test. It can be answered by **introducing the bug and watching**. The mutation took two SQL statements and one rerun. It turned a claim ("the access rules are tested") into an observation ("these three tests fail when summaries leak"), and it found a hole the claim had been hiding.

## Postscript: the second mask

The same day, Kay renamed the roles and split them: patient testers, care-team testers, and an admin who sees both. That added a rule: the care team may not start patient sessions. A new test said so, and it passed. Then the rule was widened on purpose to "any member may start a session". **The test still passed.**

This time the mask was the HTTP request, not the test's scope. The suite asked the Data API to return the inserted row (`Prefer: return=representation`). Returning a row needs *read* permission, and the care team can't read a session that isn't shared. So the insert failed because of the read rule, while the write rule it was meant to test never decided anything. A client that sends `return=minimal` would have created the session.

Every write-denial test now uses `return=minimal`. Under the widened rules, exactly the two intended tests failed. The fix is one header, but the lesson generalizes: **a denial test has to isolate the rule it's named after**, or a neighboring rule will quietly pass it for you.

## Lessons Learned

- **A security suite's first green run is a question, not an answer.** Break the most important rule on purpose before trusting it.
- **Check the role you fear most against the data you care about most.** The stranger was tested, but against the wrong tables.
- **Keep the mutation's lesson in the test.** The widened test carries a comment saying what the mutation found, so nobody "simplifies" it back.

## Metacognitive Insight

Writing tests and verifying them are different acts. Writing encodes what you *thought* to check; a mutation shows what you *actually* check. The gap between the two was invisible from inside the suite, and plain the moment the rule was broken on purpose.
