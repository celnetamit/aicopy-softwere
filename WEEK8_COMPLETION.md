# Week 8 Completion Report

Date: 2026-04-17  
Project: Manuscript Editor  
Sprint: Week 8 (Packaging + Deployment)

## Executive Summary

Week 8 implementation scope is complete for engineering deliverables:

1. Windows installer pipeline (`.exe`) is implemented.
2. Ubuntu package pipeline (`.deb`) is implemented.
3. Release operations documentation is implemented.
4. First-run setup wizard for API keys/Ollama host is implemented.

Release readiness is high, with one remaining gate: fresh-machine QA sign-off on Windows and Ubuntu installers.

## Scope Status (Week 8 Tasks)

### Task 1: Windows installer pipeline (`.exe`) - Completed

Implemented artifacts:
1. `requirements-build.txt`
2. `scripts/windows/build_exe.bat`
3. `scripts/windows/build_exe.ps1`
4. `scripts/windows/build_installer.bat`
5. `packaging/windows/ManuscriptEditor.iss`
6. `.github/workflows/windows-installer.yml`

Expected outputs:
1. `dist\ManuscriptEditor\ManuscriptEditor.exe`
2. `dist_installer\ManuscriptEditor_Setup_<version>.exe`

### Task 2: Ubuntu package pipeline (`.deb`) - Completed

Implemented artifacts:
1. `scripts/linux/build_deb.sh`
2. `packaging/linux/manuscript-editor`
3. `packaging/linux/manuscript-editor.desktop`
4. `.github/workflows/ubuntu-deb.yml`

Expected output:
1. `dist_deb/manuscript-editor_<version>_<arch>.deb`

### Task 3: Release checklist and release docs - Completed

Implemented artifacts:
1. `RELEASE_CHECKLIST.md`
2. `CHANGELOG.md`
3. README release sections updated

Included content:
1. versioning policy
2. changelog update flow
3. upgrade note template
4. rollback instructions

### Task 4: First-run setup wizard text for API keys/Ollama host - Completed

Implemented capabilities:
1. first-run setup wizard overlay
2. provider-aware helper text for Ollama, Gemini, OpenRouter, Agent Router
3. reopen wizard button in AI settings
4. close/save/skip behavior fixes and state persistence

## Definition of Done Status (Week 8)

From sprint plan:

1. Fresh-machine install test passes on Windows + Ubuntu
   - Status: Pending formal QA sign-off
   - Reason: pipelines and scripts are in place, but cross-machine install evidence is not yet attached in this repo.

2. User can launch, process, and export without manual code edits
   - Status: Functionally ready, pending installer-based verification on fresh machines
   - Reason: runtime and export flows pass project regression checks; installer path still needs end-user environment validation.

## Validation Evidence

Automated quality gate has been run repeatedly after Week 8 changes:
1. Python compile checks: pass
2. Frontend syntax checks: pass
3. Regression tests: pass (`19/19`)

## Known Gaps (Non-blocking for code complete, blocking for release sign-off)

1. No recorded screenshot/log bundle of fresh Windows installer smoke test.
2. No recorded screenshot/log bundle of fresh Ubuntu `.deb` smoke test.

## Final Recommendation

Week 8 can be marked:

1. Engineering Complete
2. Release Candidate Ready
3. Awaiting QA Install Sign-Off

After fresh-machine QA evidence is collected, Week 8 can be marked fully Done.
