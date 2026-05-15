# AI Handoff: Current Status

Updated: 2026-05-14
Repo: `/home/itb09/manuscript_editor`
Baseline status: Release Candidate / Engineering-Complete Core

## Purpose

This folder is a compact handoff pack for giving another AI enough reliable project context to analyze upgrades, propose new modules, or plan major enhancements without rediscovering the application from scratch.

Use these files together with the live repository. They summarize current architecture and constraints, but the code remains the source of truth.

## Product Summary

Manuscript Editor is a professional copyediting application focused on Chicago-style editing, reference validation, DOCX preservation, and clean/highlighted export.

The app currently supports:

1. Authenticated web mode with Google login and optional local login.
2. User task history backed by persisted storage.
3. Admin users, audit events, global runtime settings, diagnostics, and provider validation.
4. Text and DOCX upload.
5. Manuscript processing through rules and optional AI providers.
6. Online reference validation through Crossref, Serper fallback, and OpenAlex.
7. Clean and highlighted DOCX export.
8. Desktop/Eel compatibility paths and web/WSGI deployment paths.
9. Windows and Linux packaging assets.

## Current Release Posture

The repo should be treated as a working application, not a prototype.

Current posture:

1. Core editing flow: high confidence.
2. DOCX preservation/export: high confidence, with focused regression coverage.
3. Authenticated web workflow: implemented and tested.
4. Admin diagnostics/settings: implemented, still expandable.
5. Assistant: functional Phase 1 style capability, still needs robustness and clearer response contracts.
6. Packaging: scripts and installer assets exist, but fresh-machine QA evidence is the remaining release gate.

## Existing Continuity Docs

Primary docs to read before major planning:

1. `LATEST_APPLICATION_STATUS.md`
2. `DEVELOPMENT_STATUS_REPORT_2026-05-11.md`
3. `REPO_STATUS_ROADMAP.md`
4. `MULTIPAGE_ARCHITECTURE.md`
5. `RELEASE_CHECKLIST.md`
6. `QA_SIGNOFF_TEMPLATE.md`

## Validation Command

Use this as the default local quality gate:

```bash
./scripts/run_quality_checks.sh
```

The quality runner covers Python compile checks, frontend JavaScript syntax checks, and the regression/API suites.

## Important Working Assumptions

1. Preserve the existing working upload -> process -> review -> export flow.
2. Prefer incremental modules and migrations over rewrites.
3. Keep DOCX fidelity and reference validation behavior as user-visible correctness requirements.
4. Treat `app_store.py` as the current schema bootstrap source.
5. Treat route modules under `routes/` as the current API surface source.
6. Keep secrets out of docs, prompts, and generated analysis packs.

