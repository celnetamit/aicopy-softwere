# Repo Status And Roadmap

Date: 2026-04-21
Project: Manuscript Editor
Status: Release Candidate / Engineering-Complete Core

## Current Status

The project is beyond prototype stage and is operating like a real product:

1. Core manuscript processing is implemented.
2. DOCX load, rewrite, highlighted export, and structure-preservation flows are implemented.
3. Authenticated web mode with task history, admin controls, and persistent storage is implemented.
4. Desktop Eel mode is implemented.
5. Windows installer and Ubuntu `.deb` build pipelines are implemented.
6. Local automated quality gate is passing.

Current release posture:

1. Engineering status: Strong
2. Product status: Usable
3. Release status: Near-ready
4. Remaining release gate: Fresh-machine installer QA evidence for Windows and Ubuntu

## What Is Already Built

### Product / User Flows

1. Rule-based Chicago-style editing
2. Optional AI enhancement with Ollama, Gemini, and OpenRouter-style providers
3. Section-wise AI safety scoring and fallback selection for long manuscripts
4. Citation and reference validation
5. Vancouver renumbering and journal-profile-aware reference normalization
6. Compare view and grouped accept/reject workflow
7. First-run setup wizard for AI configuration
8. Task history, re-open, and download flows

### Platform / Delivery

1. Desktop app via Eel
2. Authenticated web app via Bottle/WSGI
3. SQLite local fallback and PostgreSQL-ready persistence layer
4. Docker deployment path
5. Windows packaging workflow
6. Ubuntu packaging workflow
7. Release checklist, changelog, and QA sign-off template

### Quality Signals

1. Local quality gate passes
2. Test suite currently covers regression rules, DOCX structure preservation, telemetry, and authenticated web API flows
3. No major unfinished TODO backlog was found in the core codebase

## Main Risks Right Now

1. Installer QA sign-off is still missing, so release confidence depends on automation more than fresh-machine evidence.
2. Version and release metadata are duplicated across docs, UI, and packaging files.
3. Desktop flow, web flow, legacy compatibility endpoints, and JS bridge contain overlapping logic that will become harder to maintain.
4. Web processing is synchronous and can become a bottleneck for larger usage or slower AI providers.
5. Runtime AI secrets are managed through app settings patterns that are acceptable for internal usage but should be hardened for broader deployment.
6. Documentation has some drift against the actual current repo state.

## Prioritized Roadmap

## P0

These are release-blocking or high-confidence items to do next.

1. Complete fresh-machine QA on Windows installer and Ubuntu `.deb`.
2. Attach screenshot/log evidence using `QA_SIGNOFF_TEMPLATE.md`.
3. Validate install -> launch -> upload -> process -> export -> relaunch on both platforms.
4. Resolve any installer/runtime environment issues discovered during those smoke tests.
5. Reconcile release docs so the repo tells one consistent story about current scope and test counts.

Definition of done for P0:

1. Both packaged builds install on clean machines without manual fixes.
2. Core user path works end-to-end on packaged builds.
3. QA evidence is stored in-repo or linked from release docs.
4. README / Week 8 completion / changelog are consistent.

## P1

These are the highest-value hardening and maintainability upgrades after release sign-off.

1. Centralize versioning so UI footer, changelog, Windows installer version, Debian package version, and workflow defaults derive from one source.
2. Reduce duplicated request/processing/export logic between `main.py`, `webapp.py`, and `web/eel_web_bridge.js`.
3. Move long-running web processing toward background jobs with task progress polling instead of synchronous request execution.
4. Harden AI provider secret handling and separate admin-configurable settings from deployment-managed secrets.
5. Add smoke tests around packaging metadata and release artifact validation where feasible.
6. Clean up model/default drift, especially Ollama default model naming across README, backend defaults, and UI storage behavior.

Definition of done for P1:

1. One version source updates all release-facing surfaces.
2. Shared processing/export code paths are clearly centralized.
3. Web processing is resilient under slower providers and larger manuscripts.
4. Secret-management expectations are explicit and safer for production.

## P2

These are product-growth and platform-maturity upgrades.

1. Expand journal profile support in the UI beyond the fixed Vancouver profile.
2. Add richer user-level preferences or team presets on top of admin global settings.
3. Improve audit/reporting views for admins with filtering, export, and better operational summaries.
4. Add artifact signing and stronger release/distribution hygiene for public-facing installer delivery.
5. Improve observability around startup failures, processing failures, and provider-specific errors.
6. Consider queued processing, worker separation, and scaling improvements if usage grows materially.

Definition of done for P2:

1. Product customization grows without increasing operator complexity.
2. Admin and support workflows become easier.
3. Release and deployment posture is ready for wider distribution.

## Suggested Sequence

1. Finish P0 and produce release evidence.
2. Do version-centralization and docs cleanup first in P1.
3. Then tackle architecture cleanup and background processing.
4. After that, expand profiles, preferences, and operational tooling in P2.

## Short Recommendation

This repo should be treated as:

1. Engineering-complete for its current core scope
2. Release-candidate ready after fresh-machine QA
3. In need of hardening, consolidation, and release discipline more than major new feature invention

The best immediate move is not a large new feature. It is to finish packaged-build validation, tighten versioning/docs, and then simplify the duplicated app flow before adding broader capability.
