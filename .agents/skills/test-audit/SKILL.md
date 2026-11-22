---
name: test-audit
description: Use when writing, changing, reviewing or pruning tests. Keeps only tests that a plausible wrong implementation would fail, and removes test-only seams from production code.
---

# Test audit

Every new or changed test passes the authoring gate. An audit removes weak proof one owner at a time, and never counts deletions as progress. Before you audit existing tests, read [references/audit.md](references/audit.md).

## Authoring gate

Before you add a test, answer each question:

1. Which observable behaviour, invariant or independent contract does it protect?
2. Which plausible wrong implementation makes it fail? Name the mistake. If you cannot name one, do not write the test.
3. Why does no existing test catch that mistake? Each contract has one owning test, at the strongest boundary that is cheap to reach. Add a row to that test's table instead of a new test.
4. Does the test need an export, a flag, a wrapper or a hook that production code never uses? Then test through the real boundary instead.

Then:

- A regression test fails before the fix, for the reason the bug gives, and passes after it. Say so when you cannot show the failing run.
- One test covers one bug, at its owner. Do not repeat it at each layer the bug crossed.
- A refactor that keeps the behaviour keeps every test green.
- To test a decision buried in a long function, extract it: a small function that takes what it needs and returns what it decided. That is better than a mock.
- Match the code around it. Where the sibling modules have no unit test, rely on the integration proof instead of adding one only for yours.

## Junk patterns

Reject a new test that matches one of these, unless the retention bar keeps it:

- An assertion that compares a value with itself, or with an expected value that the code under test made.
- A copied list of files, exports, keys or messages, or a grep of the source.
- An assertion on how the code calls something, not on what its caller sees.
- A contract that another test already owns.
- A test of the language, the standard library or a dependency: a getter that returns what a constructor set, a round trip through a derived serialiser, a match arm stated again.
- A state the code cannot reach, such as two formats that come from the same formatter.
- A mock or a fixture that supplies the behaviour the test asserts.
- A negative case that passes on another guard, or on a rejection the code never reaches.
- A name that promises behaviour its inputs and assertions do not exercise.

## Retention bar

Keep a test that guards an independent contract, even when it is slow or static:

- What crosses a boundary: a wire or file format, a protocol, a public API, stored data and its migrations, a manifest, a cache key.
- A default or a limit that the user sees.
- A silent failure: a value written now and read later, a rename that a default hides, a message that is itself the recovery instruction.
- An ordering that callers can observe, and a security or platform rule.

A test that fails at baseline can show a real bug. Reproduce it and repair the owner. Do not delete the test for it.

## Proof

- Run the owner's test file alone, then the project's full check, in the order CI runs it.
- For each new or kept contract, break its owner once on purpose and see the test fail. Then restore the source exactly.
- When the project keeps end-to-end reference results (recorded inputs with known outputs), a change to the code they exercise must keep those results.
- Read the project's own instructions (`AGENTS.md`, `CLAUDE.md`, contributing notes) for its test commands, fixtures and reference data.
- Report the causes, what you removed and kept and why, the proof you ran, and the lines removed from production code and from the tests. Commit only when the task asks for it.
