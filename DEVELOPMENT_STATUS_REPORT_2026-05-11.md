# Development Status Report
Date: 2026-05-11  
Repo: `/home/itb09/manuscript_editor`  
Version baseline: `v1.1.0`

## 1) Executive Summary
- Core manuscript workflow is production-grade and backend-connected: auth, upload, process, reference validation, exports, admin settings, diagnostics, and assistant Phase 1 are implemented.
- The application is **not primarily demo/static**. Most UI surfaces are wired to live APIs and persisted storage.
- Main remaining engineering work is **hardening and completeness**, not greenfield build:
1. Assistant clarity/reliability edge cases
2. Reference enrichment confidence and unresolved-loop automation
3. Admin settings surface completeness for newly added runtime flags
4. Packaging/release QA evidence and dependency lifecycle governance

## 2) Codebase Inventory (Complete Application Structure)

### Backend Core
- `webapp.py`
  - Web routes/pages, API layer, auth/session guards, task lifecycle, assistant endpoints, admin endpoints, diagnostics, downloads.
- `document_processor.py`
  - Orchestrator for copyediting, AI/rules fallback, report assembly, DOCX generation.
- `chicago_editor.py`
  - Rule engine, reference parsing/normalization, online validation (Crossref/Serper/OpenAlex), DOI/autofill logic.
- `app_store.py`
  - Persistence layer and schema bootstrap for users/sessions/tasks/files/settings/audit.
- `version_info.py` + `VERSION`
  - Unified runtime and packaging version source.

### Frontend Core
- Pages: `web/tasks.html`, `web/task_detail.html`, `web/index.html`
- App modules: `web/app.js`, `web/app-auth-admin.js`, `web/app-preview.js`, `web/app-settings.js`, `web/app-state.js`
- Bridge/API client: `web/eel_web_bridge.js`
- Styling/fragments: `web/style.css`, `web/fragments/*`

### Testing & Quality
- `tests/test_webapp_api.py`
- `tests/test_regression_rules.py`
- `tests/test_docx_structure_preservation.py`
- `tests/test_export_save_telemetry.py`
- `tests/test_section_chunk_scoring.py`
- Quality runner: `scripts/run_quality_checks.sh`

### Packaging/Release
- Windows: `packaging/windows/*`
- Linux: `scripts/linux/build_deb.sh`
- Release docs/checklists: `RELEASE_CHECKLIST.md`, `QA_SIGNOFF_TEMPLATE.md`, `CHANGELOG.md`

## 3) Dynamic vs Static Module Audit

## Finding
No major end-user module was found to be demo-only with fake hardcoded business data.

What appears static is mostly:
1. Empty-state/help text (e.g., “No tasks yet”, “Assistant output appears here”)
2. Default form values before runtime settings are loaded
3. Placeholder guidance text in diagnostics until first process run

These are UX placeholders, not disconnected demo modules.

## 4) Development Completeness Matrix

| Module | Completeness | Dynamic Data Source | Gaps / Insufficient Areas |
|---|---|---|---|
| Auth + Session | High | `/api/auth/*`, DB `users`, `user_sessions` | Add stronger SSO observability and domain-policy admin UI explanation. |
| Task Dashboard | High | `/api/tasks`, DB `tasks` | Good overall; mostly UX optimization opportunities. |
| Task Detail Editor | High | `/api/tasks/<id>`, `/api/tasks/<id>/process` | Continue performance optimization for very large manuscripts. |
| Copyediting Rules Engine | High | `document_processor.py` + `chicago_editor.py` | Rule expansion can continue (CMOS breadth, domain packs). |
| Online Reference Validation | Medium-High | Crossref/Serper/OpenAlex via `chicago_editor.py` | Ambiguous match auto-resolution still needs confidence tuning + provenance UI improvements. |
| DOI Autofill / Missing-field Enrichment | Medium-High | Same as above + runtime options | Some real-world cases still report “found but rejected” and unresolved missing fields. |
| Assistant (Phase 1) | Medium | `/api/assistant` + task/admin diagnostics | Phase 1 scope only; one test currently failing for admin-activity response shape; conversational clarity still improving. |
| Admin Global Settings | Medium-High | `/api/admin/global-settings`, DB `app_settings` | Newly added backend flags are not fully exposed in admin form controls. |
| Admin Diagnostics | High | `/api/admin/reference-validation-diagnostics` | Useful and dynamic; add quick action links and unresolved filters. |
| Export (Clean/Redline DOCX) | High | `/api/tasks/<id>/download*`, generated files in `task_files` | Stable; continue edge-case fidelity tests for complex DOCX constructs. |
| Telemetry & Health | Medium-High | `/api/health`, `/api/runtime-telemetry` | Add richer SLO/error-budget view and alerting integration. |
| Packaging/Release Pipeline | Medium | scripts + packaging configs | Final release gate still fresh-machine QA evidence/signoff. |

## 5) Undeveloped / Insufficiently Developed Modules (Actionable)

### A) Assistant robustness and clarity (Business-critical UX)
- Current state:
  - Assistant exists and is functional for Q&A + safe action(s).
  - Response style can still be overly diagnostic-heavy for simple user questions.
  - Regression suite currently reports one failing assistant-role test (`admin_activity.user_counts` shape expectation).
- Required development:
1. Normalize assistant payload contract for admin/non-admin paths.
2. Add response templating for plain-language answers first, diagnostics second.
3. Add fallback recovery messaging with auto-suggested actions by context.
- APIs/DB involved:
  - `/api/assistant`
  - audit tracking via `audit_events`

### B) Admin settings surface completeness for recent backend capabilities
- Current state:
  - Backend includes `online_reference_validation_admin_cap` and `auto_resolve_unresolved_references` in runtime/settings merge.
  - Admin UI currently lacks explicit form controls for these newer flags.
- Required development:
1. Add admin UI controls (cap integer + auto-resolve toggle).
2. Bind load/save in `web/app-auth-admin.js` and `web/app-state.js`.
3. Add API/UI tests for round-trip persistence.
- APIs/DB involved:
  - `/api/admin/global-settings`, `/api/settings/runtime`
  - DB `app_settings`

### C) DOI-backed completion strictness and unresolved reference closure
- Current state:
  - Autofill logic is advanced and tested, but some verified DOI cases still remain unresolved with manual-review markers.
- Required development:
1. Add per-field provenance confidence scoring (field-level, not only entry-level).
2. Expand verified-DOI fill-all-missing policy with stronger source fallback ordering.
3. Add “unresolved only” deterministic retry flow with result delta summary.
- APIs/DB involved:
  - `/api/tasks/<id>/process` with runtime options
  - `/api/admin/reference-validation-diagnostics`
  - task report payload persisted in `tasks` JSON fields

### D) Packaging/release evidence closure
- Current state:
  - Packaging exists (Windows/Linux), but release readiness still depends on QA execution proof.
- Required development:
1. Execute reproducible build-and-smoke matrix on fresh Windows + Ubuntu.
2. Capture artifact checksum, install, smoke, export validation, rollback notes.
- APIs/DB involved: N/A (ops pipeline)

## 6) Static-to-Dynamic Conversion Plan

Because no major module is pure demo/static, this plan focuses on **partially static controls/placeholder behavior**:

1. Admin Settings Expansion
- Dynamic fetch/save targets:
  - `editing.online_reference_validation_admin_cap`
  - `editing.auto_resolve_unresolved_references`
- APIs: `GET/POST /api/admin/global-settings`
- DB: `app_settings`

2. Assistant Run Stages + Summaries
- Dynamic fetch target:
  - latest processing audit and unresolved-reference counters from current task payload
- APIs: `/api/tasks/<id>`, `/api/assistant`
- DB: `tasks` report fields

3. Unresolved References Action Controls
- Dynamic state:
  - enabled only when unresolved refs > 0
  - display last run delta
- APIs: `/api/tasks/<id>/process` (safe rerun mode), `/api/tasks/<id>`
- DB: `tasks`, `task_files`

## 7) Extension / Plugin / Package Compatibility Report

## Runtime integrations audited
1. AI Providers: Ollama, Gemini, OpenRouter, AgentRouter
2. Reference online services: Crossref, Serper, OpenAlex
3. Auth provider path: Google login + optional local manual login
4. Packaging toolchain: PyInstaller, Inno Setup, Linux deb scripts

## Python package baseline (`requirements.txt`)
- `eel==0.17.0`
- `bottle>=0.13,<0.14`
- `gunicorn>=22,<24`
- `setuptools>=69,<81`
- `python-docx==1.1.2`
- `requests==2.31.0`
- `Pillow==10.2.0`
- `psycopg[binary]>=3.2,<3.3`
- `google-auth>=2.34,<3`

## Compatibility result (local)
- Codebase is internally synchronized and functional with current pinned/bounded dependencies.
- Quality checks run successfully for compile/syntax; regression suite nearly green with one failing assistant-role test.

## Important limitation
- Internet-based “latest upstream version” verification was not executed in this pass, so this report confirms **local compatibility and internal synchronization**, not external newest-release parity.

## Recommendations for dependency governance
1. Add a scheduled dependency audit pipeline (weekly) with `pip-audit` + controlled upgrade PRs.
2. Introduce constraints/lock strategy for deterministic builds.
3. Maintain compatibility matrix per provider API (OpenRouter/AgentRouter/Gemini/Ollama) in docs.
4. Add smoke tests that exercise at least one path per provider.

## 8) Phased Development Plan (Prioritized)

## Phase P0 (Week 1) - Stabilization Hotfix
Goal: close current reliability risks before feature growth.

Milestones:
1. Fix assistant admin-activity response contract + failing regression test.
2. Add admin UI controls for `online_reference_validation_admin_cap` and `auto_resolve_unresolved_references`.
3. Add tests for settings round-trip + runtime application.

## Phase P1 (Weeks 2-3) - Reference Automation Completion
Goal: minimize manual reference correction workload.

Milestones:
1. Field-level provenance confidence for DOI-backed fills.
2. Enhanced auto-resolve policy with strict confidence gates.
3. “Manual review only unresolved” end-to-end filter and action workflow.
4. Output summary cards: `Autofill Full / Partial / None` + rejected reasons.

## Phase P2 (Weeks 4-5) - Assistant Phase 1.5/2 UX + Actionability
Goal: assistant becomes operationally useful for editors.

Milestones:
1. Plain-language-first answer formatter.
2. Contextual quick actions (rerun unresolved, apply decisions, open diagnostics section).
3. Per-task assistant timeline with before/after metrics.

## Phase P3 (Weeks 6-7) - Ops & Release Readiness
Goal: production confidence and maintainability.

Milestones:
1. Fresh-machine Windows/Ubuntu packaging QA completion with evidence.
2. Dependency audit and safe upgrade sprint.
3. Telemetry dashboards for processing success/fallback/assistant usage.

## Phase P4 (Week 8) - CMOS Expansion Layer Continuation
Goal: broaden style/rule coverage while preserving safety.

Milestones:
1. Expand rule packs (domain/profile aware).
2. Add diagnostics on which CMOS pack rules fired.
3. Build profile templates for journal-specific behavior.

## 9) Business-Critical Priority Order
1. P0 Assistant/API contract + settings UI completeness
2. P1 DOI/reference unresolved automation
3. P3 Release QA + dependency governance
4. P2 Assistant UX enhancement
5. P4 CMOS expansion depth

## 10) Immediate Next Sprint Backlog (Concrete)
1. Fix failing test: `test_assistant_qna_admin_activity_summary_requires_admin_role`.
2. Add two missing admin settings controls and wire to save/load.
3. Add unresolved-reference delta block after rerun action.
4. Add provider smoke-test job in CI for at least one cloud and one local provider path.

---
This report is based on direct repository inspection and local quality execution.
