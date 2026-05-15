# AI Handoff: Architecture Map

Updated: 2026-05-14

## High-Level Shape

The application is a Python web/desktop hybrid:

1. Bottle/WSGI web app for authenticated browser usage.
2. Eel-compatible bridge and legacy endpoints for desktop continuity.
3. SQLite local/test fallback and PostgreSQL production-ready persistence.
4. Plain HTML/CSS/JavaScript frontend modules.
5. Python document processing engine for editing, reference validation, and DOCX export.

## Backend Modules

### `webapp.py`

Main deployable app bootstrap. Responsibilities include:

1. Runtime config and environment setup.
2. Store initialization.
3. Shared dependency construction for routes.
4. Authentication/session helpers.
5. Processing/export helpers.
6. Route registration through `routes/register_routes`.

### `routes/`

Route modules split the Bottle API surface:

1. `page_routes.py`: HTML shells and static assets.
2. `diagnostic_routes.py`: health, version, telemetry, runtime settings.
3. `auth_routes.py`: auth config, Google login, local login, current user, logout.
4. `task_routes.py`: task upload, list, retrieve, process, correction decisions, downloads.
5. `assistant_routes.py`: assistant endpoint.
6. `legacy_routes.py`: desktop/Eel-compatible legacy operations.
7. `admin_routes.py`: users, audit, settings, reference diagnostics, provider validation.

### `app_store.py`

Persistence layer for users, sessions, tasks, generated files, audit events, and global settings.

It supports:

1. SQLite for local development/tests.
2. PostgreSQL for production.
3. Schema bootstrap through `CREATE TABLE IF NOT EXISTS`.
4. Simple SQL helpers with backend-specific placeholders.

### `document_processor.py`

Processing orchestrator. Responsibilities include:

1. Loading/extracting text from DOCX.
2. Applying rules and optional AI editing.
3. Producing corrected text and reports.
4. Generating clean and highlighted DOCX outputs.
5. Preserving important DOCX structure where possible.

### `chicago_editor.py`

Rule and reference engine. Responsibilities include:

1. Chicago/Vancouver-style editing rules.
2. Citation/reference normalization.
3. Online reference validation.
4. DOI/source enrichment.
5. Crossref, Serper fallback, and OpenAlex lookup behavior.
6. Lookup diagnostics and cache behavior.

## Frontend Modules

### HTML Shells

1. `web/tasks.html`: task dashboard.
2. `web/task_detail.html`: task editor/detail page.
3. `web/index.html`: legacy/admin dashboard shell.
4. `web/fragments/*`: shared page fragments.

### JavaScript

1. `web/app.js`: main app orchestration.
2. `web/app-state.js`: shared state and constants.
3. `web/eel_web_bridge.js`: browser API/bridge compatibility layer.
4. `web/app-preview.js`: previews, tabs, correction rendering.
5. `web/app-settings.js`: local/runtime settings UI behavior.
6. `web/app-auth-admin.js`: auth, admin UI, diagnostics, task history.

### Styling

1. `web/style.css`: global product styling.

## Deployment And Runtime

1. `Dockerfile`: web/container deployment.
2. `requirements.txt`: runtime dependencies.
3. `requirements-build.txt`: build/packaging dependencies.
4. `run_web.sh`, `start.sh`, `run.sh`: local runtime helpers.
5. `packaging/windows/*`: Windows installer assets.
6. `scripts/linux/build_deb.sh`: Debian package build.

## Testing

Primary tests:

1. `tests/test_webapp_api.py`
2. `tests/test_regression_rules.py`
3. `tests/test_docx_structure_preservation.py`
4. `tests/test_export_save_telemetry.py`
5. `tests/test_section_chunk_scoring.py`

Default quality gate:

```bash
./scripts/run_quality_checks.sh
```

## Growth Direction

The existing architecture is ready for enhancements, but major additions should respect these boundaries:

1. Store schema changes belong in `app_store.py` until a formal migration system is introduced.
2. New authenticated workflows should prefer `routes/` modules instead of adding large route blocks to `webapp.py`.
3. New processing behavior should route through `document_processor.py` and `chicago_editor.py` rather than duplicating processing logic in routes.
4. Frontend growth should continue toward the route/page separation described in `MULTIPAGE_ARCHITECTURE.md`.

