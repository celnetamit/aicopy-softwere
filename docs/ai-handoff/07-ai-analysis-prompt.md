# Master Prompt For AI Analysis

Use this prompt when asking another AI to analyze this application and propose new modules, major enhancements, or implementation plans.

```text
You are analyzing an existing working application, not starting from scratch.

Application:
- Name: Manuscript Editor
- Repo path: /home/itb09/manuscript_editor
- Current status: Release Candidate / Engineering-Complete Core
- Primary domain: professional manuscript copyediting, reference validation, DOCX preservation, and clean/highlighted export.

Before proposing changes, read these handoff files in order:
1. docs/ai-handoff/00-current-status.md
2. docs/ai-handoff/01-architecture-map.md
3. docs/ai-handoff/02-database-schema.md
4. docs/ai-handoff/03-api-surface.md
5. docs/ai-handoff/04-frontend-map.md
6. docs/ai-handoff/05-core-workflows.md
7. docs/ai-handoff/06-known-gaps-and-upgrade-ideas.md

Then inspect the live source files that are relevant to the requested enhancement. Treat the code as the source of truth if docs and code differ.

Key source files:
- LATEST_APPLICATION_STATUS.md
- DEVELOPMENT_STATUS_REPORT_2026-05-11.md
- REPO_STATUS_ROADMAP.md
- MULTIPAGE_ARCHITECTURE.md
- app_store.py
- webapp.py
- routes/
- document_processor.py
- chicago_editor.py
- web/
- tests/

Important constraints:
- The app is already running and working. Do not suggest a rewrite unless explicitly asked.
- Preserve the core path: login -> upload -> process -> review -> export -> reopen/download.
- Preserve DOCX structure and highlighted export behavior.
- Preserve task ownership and admin authorization checks.
- Keep SQLite and PostgreSQL compatibility for schema changes.
- Keep secrets out of docs, prompts, logs, frontend diagnostics, and generated outputs.
- Prefer adding routes under routes/ instead of expanding webapp.py.
- Prefer adding focused tests for every backend or workflow change.
- Use ./scripts/run_quality_checks.sh as the default validation command.

When asked for a new module or major enhancement, produce:
1. Executive recommendation: build now, defer, or split into phases.
2. User value and risk summary.
3. Required backend changes.
4. Required database/schema changes.
5. Required API routes and payloads.
6. Required frontend changes.
7. Required tests and validation commands.
8. Migration/backward-compatibility notes.
9. Rollout plan with phases.
10. Exact files likely to change.

Do not give generic advice. Ground every recommendation in the current repo structure and the existing workflows.
```

## Optional Add-On Prompt For Implementation Planning

```text
Now convert the recommendation into an implementation plan.

For each phase, include:
- Goal
- Files to modify
- Data model impact
- API impact
- Frontend impact
- Tests to add/update
- Validation command
- Rollback risk
- Definition of done

Keep the plan incremental and avoid breaking the current working release-candidate flow.
```

