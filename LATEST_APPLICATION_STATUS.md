# Latest Application Status (Handoff)

Updated: 2026-05-15  
Repo: `manuscript_editor`  
Branch: `main` (synced with `origin/main`)

## Current Stage

`Release Candidate / Engineering-Complete Core`

This includes:
1. Core editing and DOCX preservation/export flow
2. Authenticated web mode and admin controls
3. Serper integration completed through Phase 6

## Serper Integration Progress

Completed and pushed:
1. Phase 1: safe references-only Serper fallback (`9e22d83`)
2. Phase 2: runtime control + lookup metrics (`c7f2de2`)
3. Phase 3: independent UI/admin Serper fallback toggles (`7585079`)
4. Phase 4: corrections tab Serper diagnostics (`60b9d5d`)
5. Phase 5: shared cache hardening + admin diagnostics endpoint/UI (`d9c8e97`)
6. Phase 6: admin cache reset operation for reference diagnostics (`ca06dcf`)

In-progress (local changes, not yet pushed):
1. Phase 7: diagnostics accuracy improvement for shared last-run lookup metrics

## Key Phase 5 Artifacts

1. Shared thread-safe cache + diagnostics in `chicago_editor.py`
2. Admin diagnostics endpoint in `webapp.py`:
   - `GET /api/admin/reference-validation-diagnostics`
3. Web bridge wiring in `web/eel_web_bridge.js`
4. Admin UI diagnostics block in:
   - `web/index.html`
   - `web/task_detail.html`
   - `web/app-auth-admin.js`
   - `web/app-state.js`
   - `web/app-settings.js`
   - `web/style.css`
5. Tests:
   - `tests/test_regression_rules.py`
   - `tests/test_webapp_api.py`

## Key Phase 6 Additions (Local)

1. Admin reset endpoint in `webapp.py`:
   - `POST /api/admin/reference-validation-diagnostics/reset`
2. Shared cache reset helper in `chicago_editor.py`
3. Admin UI `Reset Cache` button and status updates:
   - `web/index.html`
   - `web/task_detail.html`
   - `web/app-auth-admin.js`
   - `web/app-state.js`
   - `web/app-settings.js`
4. Added API tests for reset authorization and cache-clear behavior in `tests/test_webapp_api.py`

## Key Phase 7 Additions (Local)

1. Shared `last run` lookup metrics are now published after validation in `chicago_editor.py`.
2. Admin diagnostics now includes `lookup_metrics_last_run_at` timestamp in `webapp.py`.
3. Added regression/API coverage for cross-instance diagnostics metric visibility:
   - `tests/test_regression_rules.py`
   - `tests/test_webapp_api.py`

## Validation Snapshot

Latest full quality gate passed on 2026-05-15:
1. `./scripts/run_quality_checks.sh`
2. Result: `Ran 156 tests in 308.515s ... OK`
3. Compile checks and frontend syntax checks passed.

Latest focused P0 validation also passed:
1. `python3 -m pytest -q tests/test_webapp_api.py -k "assistant_qna_admin_activity_summary_requires_admin_role or admin_global_settings_round_trip or task_detail_route_renders_task_detail_shell or admin_dashboard_contains_new_reference_automation_controls"`
2. Result: `4 passed, 37 deselected`

## Current Architecture P0 Status

Completed locally:
1. P0.1 assistant admin-activity response contract verified by focused regression coverage.
2. P0.2 admin controls for `online_reference_validation_admin_cap` and `auto_resolve_unresolved_references` are wired through backend normalization, shared admin JS state/load/save, admin dashboard, task-detail admin shell, and API/UI tests.
3. P0.3 initial route extraction remains complete under `routes/`.
4. Release-path P0 local readiness evidence captured in `docs/release/P0_QA_SIGNOFF_2026-05-15_LOCAL.md`; final Windows/Ubuntu fresh-machine installer signoff remains pending.
5. P1 API-client foundation started with `web/app-api.js`, script loading before `/eel.js`, `eel_web_bridge.js` delegating JSON requests through `window.ManuscriptApi`, and quality coverage for the new bridge path.
6. `web/app-auth-admin.js` now prefers `window.ManuscriptApi` for auth, task history, runtime settings, admin settings, diagnostics, user/audit lists, user status, Ollama model discovery, and provider validation while retaining one `eel` compatibility adapter. Full quality gate passed after this migration.
7. `web/app.js` now prefers `window.ManuscriptApi` for upload, task polling, processing, group decisions, assistant actions, unresolved-reference reruns, export/save, redline preview, and reset-session flows while retaining one `eel` compatibility adapter. Full quality gate passed after this migration.
8. First route-specific frontend split is in place: `web/pages/tasks.js` owns dashboard upload controls plus task-history rendering/navigation, `web/pages/task-detail.js` owns editor upload/process/save/tab/view controls plus task-detail hydration/editor bootstrapping, and `app-settings.js` is narrowed back toward settings/auth/admin wiring.

## Resume From Here

Primary next workstreams from roadmap:
1. `P0`: finish fresh-machine QA sign-off for Windows and Ubuntu installer/package builds.
2. `P1`: continue frontend modernization by extracting remaining assistant/editor runtime helpers from `app.js` and creating a future `web/app-router.js`.

Suggested first commands:
1. `./scripts/run_quality_checks.sh`
2. Follow `RELEASE_CHECKLIST.md`
3. Execute QA flow in `QA_SIGNOFF_TEMPLATE.md`

## Related Reference Docs

1. `README.md` (repo status + phased summary)
2. `REPO_STATUS_ROADMAP.md` (priorities and roadmap)
3. `WEEK8_COMPLETION.md` (packaging/release milestone context)
