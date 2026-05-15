# AI Handoff: Core Workflows

Updated: 2026-05-14

## 1. Authentication

Primary files:

1. `routes/auth_routes.py`
2. `webapp.py`
3. `app_store.py`
4. `web/app-auth-admin.js`

Flow:

1. Browser reads `/api/auth/config`.
2. User signs in through Google login or local login if enabled.
3. Backend validates identity/domain rules.
4. `AppStore` upserts user and creates session.
5. Session token is used for authenticated API requests.
6. `/api/auth/me` returns current user context.

## 2. Task Creation

Primary files:

1. `routes/task_routes.py`
2. `web/eel_web_bridge.js`
3. `app_store.py`
4. `document_processor.py`

Text flow:

1. Frontend posts to `/api/tasks/upload-text`.
2. Backend creates a task with `source_type=text`.
3. Task appears in `/api/tasks`.

DOCX flow:

1. Frontend base64-encodes DOCX and posts to `/api/tasks/upload-docx`.
2. Backend decodes bytes and extracts/stores task source data.
3. Task appears in `/api/tasks`.

## 3. Manuscript Processing

Primary files:

1. `routes/task_routes.py`
2. `webapp.py`
3. `document_processor.py`
4. `chicago_editor.py`
5. `app_store.py`

Flow:

1. Frontend calls `/api/tasks/<task_id>/process`.
2. Backend validates task ownership/admin access.
3. Runtime settings and task options are merged.
4. `document_processor.py` applies the processing pipeline.
5. `chicago_editor.py` applies style/reference logic.
6. Store is updated with corrected text, full corrected text, status, reports, and timestamps.
7. Clean/highlighted files are generated and registered in `task_files`.
8. Frontend refreshes task detail and download availability.

## 4. Reference Validation And Enrichment

Primary files:

1. `chicago_editor.py`
2. `document_processor.py`
3. `routes/admin_routes.py`
4. `web/app-auth-admin.js`

Flow:

1. Reference validation runs during processing when enabled.
2. Crossref/OpenAlex are primary lookup paths.
3. Serper is a fallback path when configured and enabled.
4. Lookup metrics and diagnostics are captured.
5. DOI/source metadata may be appended into corrected references depending on policy.
6. Admin diagnostics are exposed at `/api/admin/reference-validation-diagnostics`.
7. Admin can reset shared lookup cache through `/api/admin/reference-validation-diagnostics/reset`.

## 5. Correction Review

Primary files:

1. `web/app-preview.js`
2. `routes/task_routes.py`
3. `routes/legacy_routes.py`
4. `app_store.py`

Flow:

1. Task detail renders original, corrected, redline, and correction report tabs.
2. Correction groups can be accepted/rejected.
3. Frontend posts group decisions.
4. Backend recalculates corrected text and generated outputs.
5. Task files are refreshed.

## 6. Export And Download

Primary files:

1. `routes/task_routes.py`
2. `routes/legacy_routes.py`
3. `document_processor.py`
4. `app_store.py`

Flow:

1. Processing creates clean and highlighted DOCX artifacts.
2. `task_files` stores artifact metadata.
3. Frontend downloads through task download endpoints.
4. Legacy routes still support older save/export flows.

## 7. Admin Operations

Primary files:

1. `routes/admin_routes.py`
2. `app_store.py`
3. `web/app-auth-admin.js`
4. `web/app-settings.js`

Admin surfaces:

1. User list and activation/deactivation.
2. Audit events.
3. Global runtime settings.
4. Reference diagnostics.
5. Reference cache reset.
6. AI provider validation.

## 8. Assistant

Primary files:

1. `routes/assistant_routes.py`
2. `webapp.py`
3. `app_store.py`

Current role:

1. Answer task/admin questions.
2. Surface diagnostics and activity summaries.
3. Provide safe operational guidance.

Upgrade note:

Assistant behavior is useful but should be hardened before becoming a broader automation layer.

