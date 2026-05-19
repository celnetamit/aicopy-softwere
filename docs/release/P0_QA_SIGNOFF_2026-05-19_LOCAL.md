# P0 Release QA Signoff - Phase 1-4 Closeout (Local)

Date: 2026-05-19  
Release version: `1.1.1`  
Repo: `/home/itb09/manuscript_editor`  
Environment: Local Linux workspace

## Result

Local release readiness: PASS

Final public release signoff: PENDING fresh-machine Windows and Ubuntu validation.

## What is Implemented (Phases 1-4)

1. Phase 1 stabilization:
   - env-driven limits/rate-limits/origin checks
   - production startup validation
   - async DB-backed `task_runs` lifecycle
2. Phase 2 core editing controls:
   - `editing_mode`, `tone`, `rewrite_strength`, `explain_edits`
   - prompt behavior + edit explanation reporting
3. Phase 3 UX wiring:
   - user/admin control wiring end-to-end
   - loading/error/fallback states around managed runtime/global settings
   - dynamic helper text for mode/tone/rewrite options
4. Phase 4 quality and readiness:
   - expanded automated test coverage
   - runtime observability counters/buckets + task-run lifecycle audit events
   - smoke script for admin/runtime/async flow verification

## Environment and Config Requirements

Use `.env.example` as baseline.

Production-critical:
1. `MANUSCRIPT_EDITOR_ENV=production`
2. `GOOGLE_CLIENT_ID` set
3. `DATABASE_URL` set
4. `ALLOWED_ORIGINS` set for deployed domains
5. `MANUSCRIPT_EDITOR_LOCAL_LOGIN=0`

Operational controls:
1. `PROCESSING_JOB_WORKERS`
2. `MAX_UPLOAD_BYTES`, `MAX_TEXT_CHARS`, `TASK_LIST_LIMIT_MAX`
3. `AUTH_RATE_LIMIT_COUNT`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`
4. `WRITE_RATE_LIMIT_COUNT`, `WRITE_RATE_LIMIT_WINDOW_SECONDS`
5. `FILE_RETENTION_DAYS`

Optional provider fallbacks:
1. `GEMINI_API_KEY`
2. `OPENROUTER_API_KEY`
3. `AGENT_ROUTER_TOKEN`
4. `SERPER_API_KEY`

## QA Evidence

### Full quality gate
Command:
```bash
./scripts/run_quality_checks.sh
```

Result:
```text
Ran 161 tests in 316.037s
OK
All quality checks passed.
```

### Phase 4 smoke check
Command:
```bash
python3 scripts/phase4_runtime_admin_smoke.py
```

Result:
```text
[OK] Phase 4 runtime/admin smoke checks passed.
```

### Key verified flows
1. Admin global settings save/load (including new editing controls).
2. Runtime settings reflection to non-admin user payload.
3. Async process enqueue + `task_run` lifecycle status completion.
4. Runtime telemetry captures mode/editing/fallback observability fields.

## Final Release Decision

Current decision:
1. Local implementation and regression quality for Phases 1-4 are acceptable.
2. Public release should remain held until fresh-machine Windows and Ubuntu package-install evidence is captured.
