# AI Handoff: Frontend Map

Updated: 2026-05-14

## Current Frontend Style

The frontend is a plain HTML/CSS/JavaScript app. It is not React/Vue/Next.

The current UI is partially route-based:

1. `/tasks` renders the task dashboard.
2. `/tasks/<task_id>` renders the task detail/editor.
3. `/admin-dashboard` renders the admin dashboard shell.
4. Some legacy page and shared-DOM behavior still remains.

## Main HTML Files

| File | Purpose |
|---|---|
| `web/tasks.html` | Task dashboard, upload entry, task list |
| `web/task_detail.html` | Editor/task detail page |
| `web/index.html` | Legacy/admin dashboard shell |
| `web/fragments/app_header.html` | Shared header fragment |
| `web/fragments/app_footer.html` | Shared footer fragment |
| `web/fragments/login.html` | Login fragment |
| `web/fragments/script_bundle.html` | Shared script includes |

## JavaScript Files

| File | Purpose |
|---|---|
| `web/app-state.js` | Shared state/constants/helpers |
| `web/eel_web_bridge.js` | API bridge and Eel compatibility |
| `web/app.js` | Main app bootstrapping/orchestration |
| `web/app-preview.js` | Original/corrected/redline/corrections previews |
| `web/app-settings.js` | Runtime/provider settings behavior |
| `web/app-auth-admin.js` | Auth, task history, admin settings, diagnostics |

## CSS

| File | Purpose |
|---|---|
| `web/style.css` | Global app styling |

## Current UX Surfaces

1. Login/auth.
2. Task dashboard.
3. Upload text/DOCX.
4. Task detail editor.
5. Original/corrected/redline/corrections tabs.
6. Correction group decisions.
7. Clean/highlighted download actions.
8. Runtime provider settings.
9. Admin users and audit events.
10. Admin global settings.
11. Reference validation diagnostics and cache reset.

## Known Frontend Direction

`MULTIPAGE_ARCHITECTURE.md` recommends continuing the split toward:

1. `/login`
2. `/tasks`
3. `/tasks/<task_id>`
4. `/settings`
5. `/admin`
6. `/admin/users`
7. `/admin/audit`
8. `/admin/runtime`

Recommended future JS structure:

1. `web/app-api.js`: central API client.
2. `web/app-router.js`: route-aware page bootstrapping.
3. `web/pages/login.js`
4. `web/pages/tasks.js`
5. `web/pages/task-detail.js`
6. `web/pages/settings.js`
7. `web/pages/admin-runtime.js`
8. `web/pages/admin-users.js`
9. `web/pages/admin-audit.js`

## Frontend Upgrade Guidance

1. Preserve existing working controls while splitting pages.
2. Avoid adding more shared global DOM coupling.
3. Move API calls into a central client before adding large new workflows.
4. Keep admin controls separate from editor controls.
5. Prefer compact, professional, operations-friendly UI.
6. Add skeleton/loading states and clear errors for long-running actions.
7. Do not expose secrets in browser-rendered diagnostic payloads.

