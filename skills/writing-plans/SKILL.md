---
name: writing-plans
description: Use when a task is large enough to need more than one or two tool calls — a multi-file change, a new feature, a refactor. Breaks the work into small ordered steps with exact paths and a verification for each.
---

# Writing plans

A plan is a sequence of steps a careful engineer with NO project context
could follow. If a step needs knowledge you have but did not write down, the
plan is incomplete.

## Shape of a good plan

Each step is 2–5 minutes of work and names:

- the EXACT file path(s) it touches;
- what changes (the concrete edit, not "update the parser");
- how to verify it (the command, the test name, the expected output).

Order matters: put the step that DE-RISKS the task first (a spike, a failing
test, a proof that the API works). Do not build three layers on an unverified
assumption.

## Rules

- One concern per step. "Add the flag AND refactor the caller" is two steps.
- Prefer a step that FAILS LOUDLY over a step that silently half-works.
- Every behavioural change gets a test step (see test-driven-development);
  write the failing test BEFORE the implementation step that satisfies it.
- If you discover mid-plan that a step was wrong, STOP and revise the plan —
  do not improvise the rest of it.
- Keep the plan short enough to hold in your head; a 30-step plan is a sign
  the task should be split.

## In zames

Because there is no separate plan file unless the operator asks for one, the
plan lives in your reasoning and, for a long task, in a TodoWrite list — one
entry per step, status updated as you go. Do not narrate the plan to the
operator between tool calls; the todo list IS the visible plan.
