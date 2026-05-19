# Manuscript Editor Upgrade Closeout (Phases 1-4)

Date: 2026-05-19  
Repo: `/home/itb09/manuscript_editor`  
Scope: Stabilization, core copy-editing controls, UX wiring, quality/testing/deploy readiness checks

## A. Implemented in Phases 1-4

### Phase 1: Stabilization (Critical/High)
1. Security/config guardrails in `webapp.py`:
   - upload/text/task-list limits via env
   - write/auth rate-limits
   - origin/referer checks for authenticated/admin write routes
   - production startup validation for critical config
2. Auth hardening:
   - login rate-limiting path added (`routes/auth_routes.py`, production-aware)
3. Payload safety:
   - strict base64 decode + size checks for DOCX upload
   - text length validation on upload/process paths
4. Async process durability:
   - DB-backed `task_runs` lifecycle (`PENDING/RUNNING/SUCCEEDED/FAILED`)
   - persisted `job_id`, result/error snapshots, and status polling support
5. Baseline env contract:
   - `.env.example` added and wired into setup documentation

### Phase 2: Core Copy-Editing Improvements
1. Runtime controls added to normalized global settings:
   - `editing_mode`
   - `tone`
   - `rewrite_strength`
   - `explain_edits`
2. Prompt/processing enhancements in `document_processor.py`:
   - mode/tone/rewrite directives included in AI prompt path
   - guardrails for meaning preservation
3. Edit explanation support:
   - grouped explanation payload (`edit_explanations`) returned with processing reports

### Phase 3: UX and Product Enhancements
1. Full UI wiring for new controls:
   - user settings screen (task/editor views)
   - admin global settings screen
   - load/save/runtime application pipeline
2. UX feedback states:
   - managed runtime loading/success/error/fallback messages
   - admin global settings load/save button state handling
3. Inline guidance:
   - mode/tone/rewrite/explanation helper text (dynamic per selection)

### Phase 4: Quality, Testing, Deployment Readiness
1. Test expansion:
   - admin global settings round-trip now validates new editing controls
   - runtime telemetry coverage for processing-mode/editing-control observability
   - Phase 3 UX wiring checks in API/frontend integration tests
2. Observability instrumentation:
   - telemetry buckets/counters for mode, fallback reasons, edit-option usage
   - async run lifecycle counters and duration samples
   - task-run lifecycle audit events (`task_run_pending/running/succeeded/failed`)
3. Deploy/readiness smoke check:
   - `scripts/phase4_runtime_admin_smoke.py`
   - validates admin settings write/read, runtime reflection, async `task_run` completion

## B. Environment and Config Requirements

Use `.env.example` as source-of-truth baseline.

### Required for production
1. `MANUSCRIPT_EDITOR_ENV=production`
2. `GOOGLE_CLIENT_ID` (non-empty)
3. `DATABASE_URL` (explicit, non-empty recommended)
4. `ALLOWED_ORIGINS` (must include deployed origins)
5. `MANUSCRIPT_EDITOR_LOCAL_LOGIN=0` (must remain disabled)
6. Strong non-default `MANUSCRIPT_EDITOR_LOCAL_LOGIN_PASSWORD` (even when local login is disabled)

### Key operational controls
1. `PROCESSING_JOB_WORKERS`
2. `MAX_UPLOAD_BYTES`, `MAX_TEXT_CHARS`, `TASK_LIST_LIMIT_MAX`
3. `AUTH_RATE_LIMIT_*`, `WRITE_RATE_LIMIT_*`
4. `FILE_RETENTION_DAYS`

### Optional provider fallbacks
1. `GEMINI_API_KEY`
2. `OPENROUTER_API_KEY`
3. `AGENT_ROUTER_TOKEN`
4. `SERPER_API_KEY` (online reference fallback)

## C. QA Evidence (Current)

### Full quality gate
Command:
```bash
./scripts/run_quality_checks.sh
```

Latest verified result:
1. `Ran 161 tests in 316.037s`
2. `OK`
3. `All quality checks passed`

### Targeted smoke and focused checks
1. `python3 scripts/phase4_runtime_admin_smoke.py`  
   - `[OK] Phase 4 runtime/admin smoke checks passed.`
2. Focused API tests for:
   - async run + `task_run` status path
   - runtime telemetry capture for new editing controls
   - Phase 3 UX wiring assertions

### Key flows verified
1. Admin global settings save/load and normalization
2. User runtime settings reflection of admin controls
3. Async processing queue + status poll completion
4. Edit explanation payload availability
5. Runtime telemetry endpoint exposes new processing observability fields

## D. Remaining release gate (outside local workspace)
1. Fresh-machine Windows installer validation
2. Fresh-machine Ubuntu `.deb` validation
3. Final public release signoff artifact update with machine evidence
