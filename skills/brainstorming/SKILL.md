---
name: brainstorming
description: Use when the operator's request is a GOAL, not a spec — "add X", "make it better", "integrate Y" — and it is unclear what "done" means. Draws out the intent and plays it back before building.
---

# Brainstorming

When a request is a goal ("add superpowers", "make scrolling feel right"),
building immediately produces the wrong thing fast. First make the intent
concrete.

## What to pin down

- **The real outcome.** What should be TRUE after this that is not true now?
  Not the feature name — the result the operator wants to see.
- **The acceptance check.** How will the operator know it works? "I open X
  and Y happens." If neither of you can state this, the task is not ready.
- **Scope edges.** What is explicitly NOT part of this (the operator often
  has an opinion, e.g. "no button", "don't touch the existing code").
- **The alternatives you considered** and why you chose one — a decision is
  cheaper to correct before it is built.

## The zames constraint (IMPORTANT)

zames has NO conversational turn: the operator sees only your final `respond`
and your tool calls, and a task is expected to make PROGRESS, not to ask
questions and wait. So do the brainstorming yourself and return it as a
SHORT, concrete proposal in ONE `respond`, instead of an interview:

- state the goal as you understood it;
- state your assumptions and the choices you made by default;
- state what you will NOT do;
- then either (a) proceed if the request was clearly actionable, or (b) stop
  and ask the ONE decision you genuinely cannot make alone.

For a request that is already precise ("read file X", "rename Y"), skip this
entirely — brainstorming a one-line task wastes the operator's time.
