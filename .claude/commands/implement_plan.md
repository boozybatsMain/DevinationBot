---
description: Execute an implementation plan phase by phase with verification
model: opus
---

# Implement Plan

Execute an implementation plan with careful verification at each phase.

## Process:

1. **Read the plan file** provided as parameter (FULLY, no partial reads)
2. **Identify the current phase** (first incomplete phase)
3. **For each phase:**

   a. **Read all files** that will be modified
   b. **Implement changes** as described in the plan
   c. **Run automated verification**:
      - `npm run type-check`
      - `npm run lint`
      - `npm run test`
   d. **Report results** to user
   e. **Wait for manual verification** if the plan specifies it
   f. **Only proceed to next phase** after confirmation

4. **After all phases complete:**
   - Run full verification suite
   - Summarize what was implemented
   - Note any deviations from the plan

## Important:
- Follow the plan exactly - don't improvise unless blocked
- If blocked, explain why and propose alternatives
- Always verify after each phase before proceeding
- Keep the user informed of progress
- Use TodoWrite to track phase completion

## Usage:
```
/implement_plan thoughts/shared/plans/2026-02-05-feature-name.md
```
