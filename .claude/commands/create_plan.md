---
description: Create detailed implementation plans through interactive research and iteration
model: opus
---

# Implementation Plan

You are tasked with creating detailed implementation plans through an interactive, iterative process.

## Initial Response

When this command is invoked:

1. **Check if parameters were provided**:
   - If a file path or description was provided, skip the default message
   - Immediately read any provided files FULLY
   - Begin the research process

2. **If no parameters provided**, respond with:
```
I'll help you create a detailed implementation plan. Let me start by understanding what we're building.

Please provide:
1. The task description (or reference to a ticket file)
2. Any relevant context, constraints, or specific requirements
3. Links to related research or previous implementations
```

Then wait for the user's input.

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY**
2. **Spawn research tasks to gather context**:
   - Use **codebase-locator** to find related files
   - Use **codebase-analyzer** to understand current implementation
   - Use **thoughts-locator** to find existing research/plans
3. **Present understanding and ask focused questions**

### Step 2: Research & Discovery

1. **Spawn parallel sub-tasks for comprehensive research**
2. **Present findings and design options with pros/cons**
3. **Get alignment on approach before proceeding**

### Step 3: Plan Structure Development

1. **Create initial plan outline with phases**
2. **Get feedback on structure before writing details**

### Step 4: Detailed Plan Writing

Write the plan to `thoughts/shared/plans/YYYY-MM-DD-description.md`

Use this template:

```markdown
# [Feature Name] Implementation Plan

## Overview
[Brief description of what we're implementing and why]

## Current State Analysis
[What exists now, what's missing]

## Desired End State
[Specification of desired end state and how to verify]

## What We're NOT Doing
[Out-of-scope items]

## Implementation Approach
[High-level strategy]

## Phase 1: [Descriptive Name]
### Overview
### Changes Required:
#### 1. [Component/File]
**File**: `path/to/file.ext`
**Changes**: [Summary]

### Success Criteria:
#### Automated Verification:
- [ ] Type checking passes: `npm run type-check`
- [ ] Tests pass: `npm run test`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Bot responds correctly to /start command
- [ ] Webhook processes updates without errors

## Testing Strategy
## References
```

### Step 5: Review and Iterate

1. **Present the draft plan location**
2. **Iterate based on feedback**
3. **Continue refining until user is satisfied**

## Important Guidelines

- **Be Skeptical**: Question vague requirements
- **Be Interactive**: Don't write the full plan in one shot
- **Be Thorough**: Include specific file paths and line numbers
- **Be Practical**: Focus on incremental, testable changes
- **No Open Questions in Final Plan**: Resolve everything before finalizing
