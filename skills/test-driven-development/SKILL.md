---
name: test-driven-development
description: Use when writing or changing behaviour that can be tested — a bug fix, a new function, a parser, a formatter. Write the failing test first, watch it fail, then make it pass. Prevents tests that only pass because they were written against the finished code.
---

# Test-driven development

RED → GREEN → REFACTOR. The order is the point, not a formality.

## The cycle

1. **RED** — write the smallest test that expresses the new behaviour and
   RUN it. It must FAIL, and fail for the RIGHT reason ("not implemented",
   not a typo or a missing import). A test you never saw fail proves nothing.
2. **GREEN** — write the MINIMUM code that makes it pass. Do not add the
   next feature "while you are there"; that code is untested.
3. **REFACTOR** — clean up with the test green, and re-run it.

## What makes a test good

- It asserts BEHAVIOUR (input → output), not implementation detail.
- It fails when the behaviour is wrong — verify this by breaking the code
  on purpose once, if you are unsure.
- It is deterministic: no sleeps, no network, no dependence on wall-clock
  time or on the order other tests ran in.
- One reason to fail, with a message that says what broke.

## Rules in this project

- A bug fix ALWAYS gets a regression test that reproduces the original bug.
- When you fix a test to make it pass, ask whether the TEST was wrong or the
  CODE was wrong; do not just move the assertion.
- If the code was written before its test, delete and rewrite it driven by
  the test — otherwise the test is shaped around the implementation.
