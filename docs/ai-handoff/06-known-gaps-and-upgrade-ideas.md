# AI Handoff: Known Gaps And Upgrade Ideas

Updated: 2026-05-14

## Top Priority: Stabilize Before Expanding

The app is already working. Major upgrades should avoid destabilizing the core path:

```text
login -> upload -> process -> review -> export -> reopen/download
```

## P0: Near-Term Stabilization

1. Complete fresh-machine Windows and Ubuntu package QA.
2. Reconcile release docs and version metadata.
3. Fix assistant response contract edge cases.
4. Expose newer runtime flags in admin settings UI.
5. Add tests for any missing settings round trips.

## P1: Reference Automation Completion

Goal: reduce manual reference correction work.

Ideas:

1. Field-level provenance confidence for DOI-backed fills.
2. Deterministic "unresolved references only" retry workflow.
3. Clear delta summary after reference reruns.
4. UI filters for unresolved, rejected, DOI matched, and source matched.
5. Better report cards for `autofill_full`, `autofill_partial`, `no_match`, and rejected reasons.

Likely files:

1. `chicago_editor.py`
2. `document_processor.py`
3. `routes/task_routes.py`
4. `routes/admin_routes.py`
5. `web/app-preview.js`
6. `web/app-auth-admin.js`
7. `tests/test_regression_rules.py`
8. `tests/test_webapp_api.py`

## P2: Assistant Phase 2

Goal: make assistant operationally useful, not just diagnostic.

Ideas:

1. Plain-language-first answer formatting.
2. Contextual quick actions.
3. Per-task assistant timeline.
4. Admin-safe action approvals.
5. Assistant access to task reports, unresolved references, export status, and audit summaries.

Likely files:

1. `routes/assistant_routes.py`
2. `webapp.py`
3. `app_store.py`
4. `web/app-auth-admin.js`
5. New assistant service module if logic grows.

## P3: Background Processing

Goal: make large manuscripts and slower providers more reliable.

Ideas:

1. Introduce task progress states.
2. Move processing to a background worker model.
3. Add polling endpoint for progress.
4. Add cancellation/retry semantics.
5. Persist stage-level progress and failure reasons.

Likely schema additions:

1. `task_runs`
2. `task_run_events`
3. Optional `task_queue` or worker lease table.

## P4: Multi-Page UI Refactor

Goal: reduce shared DOM coupling and make room for growth.

Follow `MULTIPAGE_ARCHITECTURE.md`.

Recommended first steps:

1. Add `web/app-api.js`.
2. Add `web/app-router.js`.
3. Move task dashboard behavior into a focused page module.
4. Move task detail/editor behavior into a focused page module.
5. Split admin runtime/users/audit into separate modules.

## P5: Admin And Operations

Ideas:

1. Better audit filtering and export.
2. Runtime health dashboard.
3. Provider status panel.
4. Error-budget style processing health.
5. Release artifact/build metadata page.
6. Dependency audit workflow.

## P6: Product Expansion

Ideas:

1. Journal/team profile management.
2. Rule pack management.
3. User-level preferences layered below admin settings.
4. Shared institutional templates.
5. More citation/reference style profiles.
6. Batch manuscript processing.

## Strong "Do Not Break" Rules

1. Do not regress DOCX structure preservation.
2. Do not expose API keys or provider secrets.
3. Do not bypass task ownership checks.
4. Do not remove legacy endpoints without a compatibility plan.
5. Do not make Serper the only reference path; it is currently fallback-gated.
6. Do not assume static demo data; current modules are mostly backend-connected.
7. Do not rewrite working processing logic unless there is a tested migration path.

## Suggested Analysis Questions For Another AI

1. Which module upgrade gives the highest user value with the lowest regression risk?
2. What schema additions are needed, and can they remain SQLite/PostgreSQL compatible?
3. Which current code paths duplicate behavior and should be consolidated first?
4. What API routes are needed, and where should tests be added?
5. How will the frontend expose the feature without increasing shared-DOM coupling?
6. What quality gate proves the upgrade is safe?

