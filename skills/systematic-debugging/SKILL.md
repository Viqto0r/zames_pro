---
name: systematic-debugging
description: Use when something is broken and the cause is not obvious — a failing test, a wrong result, a hang, a crash. Four phases: reproduce, isolate, hypothesize, fix. Prevents guessing.
---

# Systematic debugging

Do NOT start by editing code. Work through the four phases in order; each
phase must produce an artifact you can point at.

## Phase 1 — Reproduce (no fix yet)

Get a command that FAILS the same way the operator describes it.

- Run it. Copy the exact error/output into your reasoning.
- If it passes, you do not have the bug yet: narrow the input until it fails,
  or ask which steps differ.
- A bug you cannot reproduce is a bug you cannot verify you fixed.

## Phase 2 — Isolate (bisect, do not read blindly)

Shrink the failure to the smallest unit that still fails.

- Comment out / stub / binary-search the input space; each step doubles the
  information you have.
- Read the code that the failing path ACTUALLY executes — not the code you
  remember writing.
- Check the obvious causes FIRST: wrong file, stale build, cached state,
  different config, an earlier error swallowed by a catch.

## Phase 3 — Hypothesize (one at a time)

State the hypothesis in one sentence and predict what you should see if it is
right. Then test exactly that.

- One change at a time; two changes at once prove nothing.
- Prefer an observation (a log, a probe, a test assertion) over an edit.
- If the prediction is wrong, the hypothesis is wrong — discard it, do not
  "adjust" it to fit.

## Phase 4 — Fix and verify

- Fix the CAUSE, not the symptom. A guard added to hide a wrong value leaves
  the wrong value in place.
- Add a regression test that fails WITHOUT the fix and passes WITH it.
- Re-run the Phase 1 reproduction verbatim.
- Look for the same bug elsewhere (the same wrong assumption is usually not
  in one place only).

## Anti-patterns

- Editing before reproducing.
- "It works now" without knowing what changed.
- Adding a try/catch or a null-check to silence an error you do not understand.
- Trusting a green test you wrote against the FIXED code without ever seeing
  it red.
