---
name: update-changelog
description: Update the CHANGELOG.md Unreleased section with categorized git log commits
---

## How to update the changelog

1. Determine the base commit — find the last commit that touched CHANGELOG.md:
   ```
   git log --oneline -1 -- CHANGELOG.md
   ```

2. List commits since that base:
   ```
   git log <base>..HEAD --oneline
   ```

3. Group commits by type: feat, fix, perf, refactor, docs, style, chore, test.

4. Add entries under `## [Unreleased]` in the appropriate subsection (Features, Performance, Fixes, Refactoring, Documentation).

5. Follow existing CHANGELOG.md format: `- [description]` with past tense, user-focused language.

6. Avoid duplicates — check existing unreleased entries before adding.
