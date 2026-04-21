# Multi-Page Architecture Plan

## Goal

Move the current single-shell web app toward a clearer multi-page structure without rewriting the backend processing engine or breaking the current editor workflow.

The app should evolve from:

- one large editor shell at `/`
- one route variant at `/admin-dashboard`

into a route-based product with focused pages, smaller frontend responsibilities, and less DOM-state coupling.

## Current State

Today the web app behaves like a single-page application:

- `/` renders the full app shell from `web/index.html`
- `/admin-dashboard` renders the same shell with admin mode pre-opened
- most navigation is JavaScript-driven
- task history, upload, editor, setup wizard, runtime settings, and admin tools all live in the same HTML shell
- frontend modules are split by concern, but still depend on one shared page-level DOM

This is workable, but it creates these problems:

- too much UI is loaded even when not needed
- routes are not true page boundaries
- admin concerns are still coupled to editor markup
- task list and editor are visually and structurally fused
- future growth will keep increasing cross-page JS coupling

## Proposed Route Map

### Public/Auth

- `/login`
  - login-only page
  - Google sign-in
  - local manual login for localhost testing

### Main App

- `/tasks`
  - task dashboard
  - upload entry point
  - task list
  - quick task status and processing duration
  - create/open manuscript tasks

- `/tasks/<task_id>`
  - editor/task detail page
  - original/corrected/redline/corrections tabs
  - compare/page/plain views
  - process, reprocess, accept/reject groups, download

- `/settings`
  - user-local setup and AI provider preferences
  - first-run wizard can become a guided page section here

### Admin

- `/admin`
  - admin landing/dashboard
  - top-level admin navigation

- `/admin/users`
  - users table
  - activate/deactivate actions

- `/admin/audit`
  - audit events and filters

- `/admin/runtime`
  - global editing/AI settings
  - API validation panel

### Compatibility

- keep `/` temporarily redirecting to `/tasks`
- keep `/admin-dashboard` temporarily redirecting to `/admin/runtime` or `/admin`

## Page Responsibilities

### 1. Login Page

Purpose:

- authentication only

Contains:

- branding
- allowed domains note
- Google login button
- local manual login box when enabled

Should not contain:

- task UI
- editor UI
- admin UI

### 2. Tasks Dashboard

Purpose:

- overview and entry point

Contains:

- upload panel
- task list
- task status badges
- processing duration
- quick open into selected task
- maybe top summary cards later

Should not contain:

- full editor preview
- admin controls
- large correction panels

### 3. Task Detail / Editor

Purpose:

- primary manuscript work surface

Contains:

- task metadata
- process button
- status/progress presence
- original/corrected/redline/corrections tabs
- page controls
- group decision tools
- clean/redline download

Should not contain:

- full task-history sidebar as the main navigation surface
- admin dashboard blocks

### 4. Settings Page

Purpose:

- user/browser-local configuration

Contains:

- provider selection
- Ollama/Gemini/OpenRouter/AgentRouter setup
- first-run setup flow
- user-local page preferences

Should not contain:

- admin-managed global settings

### 5. Admin Runtime Page

Purpose:

- operational control center

Contains:

- global runtime settings
- API validation
- users/audit links or tabs

Should not contain:

- editor preview markup
- upload zone

## Recommended Frontend Structure

Move from one shared shell toward route-aware page modules.

### Shared Core

- `web/app-state.js`
  - shared constants
  - helpers
  - cross-page auth/session state

- `web/app-api.js`
  - new module
  - all fetch/eel bridge wrappers
  - task/auth/admin/runtime API helpers

- `web/app-router.js`
  - new module
  - page bootstrapping based on `window.location.pathname`

### Page Modules

- `web/pages/login.js`
- `web/pages/tasks.js`
- `web/pages/task-detail.js`
- `web/pages/settings.js`
- `web/pages/admin-runtime.js`
- `web/pages/admin-users.js`
- `web/pages/admin-audit.js`

### Existing Modules To Reuse

- `web/app-preview.js`
  - reused mostly by task-detail page

- `web/app-settings.js`
  - split between settings page and small shared helpers

- `web/app-auth-admin.js`
  - should be decomposed
  - auth helpers stay shared
  - task-history rendering moves to `tasks.js`
  - admin settings/users/audit move to admin page modules

- `web/app.js`
  - becomes bootstrap only

## Backend Template Strategy

Keep the current API layer largely unchanged.

Add lightweight route-specific HTML renderers:

- `_render_login_html()`
- `_render_tasks_html()`
- `_render_task_detail_html()`
- `_render_settings_html()`
- `_render_admin_html(section="runtime")`

These can initially share partial HTML fragments or route-specific body classes.

Recommended approach:

1. keep static assets in `web/`
2. split `index.html` into route-specific static HTML files over time
3. serve each route with its own HTML shell

Suggested static files:

- `web/login.html`
- `web/tasks.html`
- `web/task-detail.html`
- `web/settings.html`
- `web/admin.html`

## Routing Strategy

### Phase 1

- add true routes
- keep shared JS bundle
- only page-specific sections render per route

This gives immediate clarity without a total rewrite.

### Phase 2

- page-specific JS bootstraps
- page-specific DOM maps
- reduce shared DOM assumptions

### Phase 3

- smaller page-focused HTML
- less unused markup per route
- less hidden-section complexity

## Best First Split

The safest first split is:

## Split 1: `Tasks Dashboard` vs `Task Detail`

Why this is the best first move:

- it removes the biggest UX coupling in the product
- users naturally think of task list and editor as separate screens
- it improves mobile and desktop layout immediately
- it reduces the main-shell complexity without touching the deep editor logic first

### New Behavior

- `/tasks`
  - shows upload + task list

- `/tasks/<task_id>`
  - shows editor for one task

### Minimal First Implementation

- clicking a task card navigates to `/tasks/<task_id>`
- upload success redirects to the new task detail page
- editor page loads task via existing `/api/tasks/<task_id>`
- task history can remain as a smaller secondary panel or disappear entirely from editor page

### Existing APIs Already Support This

- `GET /api/tasks`
- `GET /api/tasks/<task_id>`
- `POST /api/tasks/upload-text`
- `POST /api/tasks/upload-docx`
- `POST /api/tasks/<task_id>/process`
- `GET /api/tasks/<task_id>/download`

This means the first split is mostly frontend routing and page-shell work, not backend processing redesign.

## Recommended Migration Plan

### Phase A: Route Foundations

1. add route-specific HTML renderers
2. add `/login`, `/tasks`, `/tasks/<task_id>`, `/admin`, `/settings`
3. keep current APIs unchanged
4. keep `/` and `/admin-dashboard` as compatibility routes

### Phase B: Implement First Split

1. move upload + task list to `/tasks`
2. move editor to `/tasks/<task_id>`
3. redirect upload completion into task detail
4. remove heavy editor markup from tasks dashboard

### Phase C: Move Admin Into True Admin Pages

1. `/admin/runtime`
2. `/admin/users`
3. `/admin/audit`

### Phase D: Move Setup/Provider UI To `/settings`

1. turn wizard into a settings workflow
2. keep popup wizard only as an onboarding shortcut if desired

## Data and State Boundaries

### Shared Across Pages

- auth/session status
- current user
- runtime settings payload

### Local To Tasks Dashboard

- task list
- upload state
- dashboard filters/search later

### Local To Task Detail

- loaded manuscript content
- preview mode
- processing state
- group decisions
- page layout settings

### Local To Admin Pages

- users list
- audit list
- admin validation results
- global settings form

## Risks To Manage

### 1. Over-coupled Global DOM Access

Current modules assume one page contains everything.

Mitigation:

- introduce route-aware DOM registration
- each page module should only touch its own DOM

### 2. Hidden Dependencies Between Task List And Editor

Current task click behavior loads content inline.

Mitigation:

- convert task click to route navigation
- load task fresh on task-detail page

### 3. Admin Route Still Using Editor Shell

Current `/admin-dashboard` is not a real separate page.

Mitigation:

- replace with dedicated admin shell before deeper admin expansion

### 4. Asset/Cache Drift During Migration

Frontend assets are cache-busted manually.

Mitigation:

- bump versions every route-shell change
- consider centralizing asset versioning later

## Concrete Recommendation

Implement next:

1. add true `/tasks` and `/tasks/<task_id>` pages
2. keep current editor logic mostly intact, but run it only on task-detail route
3. leave admin/settings split for the next stage

This gives the largest structural win with the lowest processing-risk surface.

## Proposed Next Implementation Ticket

### Ticket: Split Task Dashboard From Editor

Deliverables:

- route `/tasks`
- route `/tasks/<task_id>`
- dedicated dashboard HTML
- dedicated task-detail HTML
- task card navigation to detail page
- upload redirect to task detail page
- editor boot only on detail route
- compatibility redirect from `/` to `/tasks`

Success criteria:

- task list works without loading editor shell
- task detail loads one selected manuscript cleanly
- processing/download still work unchanged
- admin flow remains functional

