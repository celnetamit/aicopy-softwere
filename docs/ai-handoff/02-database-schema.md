# AI Handoff: Database Schema

Updated: 2026-05-14
Source of truth: `app_store.py`

## Backend Support

`AppStore` supports SQLite and PostgreSQL.

1. Empty or SQLite `DATABASE_URL` uses local SQLite.
2. `postgres://` is normalized to `postgresql://`.
3. PostgreSQL startup schema creation is guarded by an advisory lock.
4. JSON-like fields are stored as text and normalized in Python.

## Tables

### `users`

Purpose: authenticated user accounts and role/status management.

Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key |
| `email` | TEXT | Required, unique |
| `google_sub` | TEXT | Required, unique |
| `display_name` | TEXT | Required |
| `domain` | TEXT | Required |
| `role` | TEXT | `ADMIN` or `USER` |
| `status` | TEXT | `ACTIVE` or `INACTIVE` |
| `last_login_at` | INTEGER | Unix timestamp |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

### `user_sessions`

Purpose: authenticated session persistence.

Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key |
| `user_id` | TEXT | FK to `users.id` |
| `expires_at` | INTEGER | Unix timestamp |
| `last_seen_at` | INTEGER | Unix timestamp |
| `ip_address` | TEXT | Optional |
| `user_agent` | TEXT | Optional |
| `revoked_at` | INTEGER | Unix timestamp, nullable |
| `created_at` | INTEGER | Unix timestamp |

### `tasks`

Purpose: manuscript task records, source text, processing results, options, and reports.

Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key |
| `user_id` | TEXT | FK to `users.id` |
| `file_name` | TEXT | Original/display file name |
| `source_type` | TEXT | Example: `text`, `docx` |
| `source_path` | TEXT | Optional stored source path |
| `original_text` | TEXT | Required extracted/input text |
| `corrected_text` | TEXT | Current corrected text |
| `full_corrected_text` | TEXT | Full corrected result |
| `word_count` | INTEGER | Defaults to 0 |
| `status` | TEXT | Task lifecycle status |
| `options_json` | TEXT | Processing/runtime options |
| `reports_json` | TEXT | Processing reports and diagnostics |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |
| `processed_at` | INTEGER | Unix timestamp, nullable |

### `task_files`

Purpose: generated downloadable artifacts for a task.

Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key |
| `task_id` | TEXT | FK to `tasks.id` |
| `file_type` | TEXT | Example: `clean`, `highlighted` |
| `storage_path` | TEXT | Server-side file path |
| `download_name` | TEXT | Browser download name |
| `mime_type` | TEXT | File MIME type |
| `size_bytes` | INTEGER | File size |
| `expires_at` | INTEGER | Unix timestamp |
| `deleted_at` | INTEGER | Unix timestamp, nullable |
| `created_at` | INTEGER | Unix timestamp |

Constraint:

1. Unique pair: `(task_id, file_type)`.

### `audit_events`

Purpose: admin/user activity trail.

Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Primary key |
| `actor_user_id` | TEXT | User who performed action |
| `target_user_id` | TEXT | User affected by action |
| `event_type` | TEXT | Required event label |
| `entity_type` | TEXT | Optional entity category |
| `entity_id` | TEXT | Optional entity id |
| `metadata_json` | TEXT | Event payload |
| `ip_address` | TEXT | Optional |
| `user_agent` | TEXT | Optional |
| `created_at` | INTEGER | Unix timestamp |

### `app_settings`

Purpose: admin/global runtime settings.

Columns:

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | Primary key |
| `value_json` | TEXT | JSON payload |
| `updated_by_user_id` | TEXT | Optional user id |
| `updated_at` | INTEGER | Unix timestamp |

## Indexes

Current schema creates indexes for:

1. Sessions by user and expiry.
2. Tasks by user and creation time.
3. Task files by task and file type.
4. Audit events by actor, target, and type.
5. App settings by update time.

## Store Method Map

Important methods:

1. User/session: `upsert_google_user`, `get_user_by_id`, `create_session`, `get_session_context`, `revoke_session`, `revoke_sessions_for_user`.
2. Tasks: `create_task`, `get_task_for_user`, `list_tasks_for_user`, `update_task_status`, `update_task_processing_result`, `update_task_corrected_text`.
3. Files: `upsert_task_file`, `get_task_file_for_user`, `get_expired_task_files`, `mark_task_file_deleted`.
4. Audit/admin: `record_audit_event`, `list_users`, `set_user_status`, `list_audit_events`.
5. Settings: `get_app_setting`, `upsert_app_setting`.

## Upgrade Guidance

For major enhancements:

1. Add schema changes deliberately in `app_store.py`.
2. Keep SQLite and PostgreSQL compatibility.
3. Add tests in `tests/test_webapp_api.py` or a focused new test file.
4. Do not store provider secrets directly in generated docs or prompts.
5. If schema growth becomes substantial, introduce a migration system before adding many more bootstrap changes.

