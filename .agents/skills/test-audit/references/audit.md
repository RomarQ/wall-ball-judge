# Audit workflow

Use it after the authoring gate in [SKILL.md](../SKILL.md). Its junk patterns and its retention bar apply to every candidate.

## Evidence before an edit

Discovery is read-only. Report the candidates before you edit anything.

Read the whole test, the module that owns the behaviour, its entry point, its callers and the tests beside it. For a claim about a dependency, read the dependency's source or types. Then record for each candidate:

- its file, its name, and the failure it can detect;
- the callers outside the tests of the code it covers;
- the stronger test that still covers the contract, or why no contract exists;
- why the test exists (`git log -S`, `git blame`) and what its deletion makes possible;
- the risk, and the command that checks the change.

With evidence missing, keep the test. A few sure candidates are better than many guesses.

## Finding candidates

- Exports that only tests use: take each export of the production code and look for its name in every production entry point and caller. A name that only the tests use is a test-only seam, or a decision extracted on purpose to test it. Remove the first; keep the second.
- Setup repeated across files: one shared fixture, or a table in one test.
- The same helper replayed through several layers: keep the test at the strongest layer.

## Edits

- Delete a test-only seam in production code together with its tests.
- Move a kept regression test to the test file of its owner.
- Prefer fewer lines of production code. Never add a test of the implementation to replace a deleted one.

## A whole-suite audit

1. Baseline: run the test suite and record each test file's result, and the line counts of the tests and of the production code. Keep the files that fail apart: they can be real bugs.
2. Group the test files by the module that owns their behaviour, not by file name.
3. For each group, read every test in full, parameter tables included, and give each one a mark with one line of evidence: `R` keep (the contract and the bug it catches), `F` keep but repair the assertion, `C` merge into a named owner test, `D` delete (the proof that remains, or why no contract exists). Judge a test by its assertions, not by its name.
4. Before you delete, compare what each deleted test covered with the tests that stay. For each contract that moved, break its owner once and see the keeper fail.
5. Report the baseline and final line counts, production lines apart from test lines, the marks, and each bug the baseline showed.

## Validation and report

- Run the owner's and the neighbouring test files, then the project's full check and its build, in the order CI runs them. Include every package or platform the change touches.
- Run `git diff --check`, then read `git diff --numstat`.
- Report the causes, what you removed and kept and why, the proof you ran, and the lines removed from production code and from the tests.
