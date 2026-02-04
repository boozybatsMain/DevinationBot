---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*)
description: Code review a pull request
---

Provide a code review for the given pull request.

## Process:

1. **Fetch the PR diff** using `gh pr diff [number]`
2. **Read CLAUDE.md** for project coding standards
3. **Review for**:
   - grammY best practices (typed contexts, middleware patterns, error handling)
   - Vercel serverless patterns (no long polling, module-level caching, timeout handling)
   - TypeScript strictness (no `any`, explicit return types)
   - Security (webhook secret verification, no exposed tokens)
   - Session management patterns (lazy sessions, Redis adapter usage)
   - Always answering callback queries
4. **Score issues** on confidence (0-100 scale)
5. **Filter** to only high-confidence issues (>= 80)
6. **Comment on the PR** with findings using `gh pr comment`

## Output Format:

```
### Code review

Found N issues:

1. [Brief description] (CLAUDE.md says "[relevant guideline]")
   [Link to file and line]

2. [Brief description] ([reason])
   [Link to file and line]
```

## False Positives to Ignore:
- Pre-existing issues
- Style issues caught by linters
- General code quality suggestions not in CLAUDE.md
- Changes in functionality that are likely intentional
