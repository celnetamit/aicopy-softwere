# P0 Release QA Signoff - Local Readiness Refresh

Date: 2026-05-16
Release version: `1.1.0`
Repo: `/home/itb09/manuscript_editor`
Environment: Local Linux workspace

## Result

Local release readiness: PASS

Final public release signoff: PENDING fresh-machine Windows and Ubuntu validation.

This file records what could be validated in the current Linux workspace after P1.7 dependency-locking and the P2.1 background-queue starter. It does not replace the required installer/package tests on real fresh machines.

## Local Quality Gate

Command:

```bash
./scripts/run_quality_checks.sh
```

Result:

```text
Ran 159 tests in 311.896s
OK
All quality checks passed.
```

Covered:

1. Python compile checks, including `job_queue.py` and dependency/version guard scripts.
2. Dependency-lock consistency check.
3. Frontend JavaScript syntax checks.
4. Regression, DOCX fidelity, telemetry, web API, async processing/frontend polling, and packaging-policy tests.

## Packaging Static Checks

Commands:

```bash
bash -n scripts/linux/build_deb.sh
bash -n packaging/linux/manuscript-editor
dpkg --print-architecture
dpkg-deb --version
```

Results:

1. `scripts/linux/build_deb.sh` syntax check passed.
2. `packaging/linux/manuscript-editor` syntax check passed.
3. Local package architecture: `amd64`.
4. `dpkg-deb` is available: Debian package backend `1.22.6`.

## Dependency Lock Checks

Commands:

```bash
python3 scripts/check_dependency_lock.py
python3 -m pytest -q tests/test_webapp_api.py -k "dependency_lock_is_used_for_release_installs"
```

Results:

1. Dependency lock wiring check passed.
2. Focused dependency-lock packaging test passed.
3. CI, Docker, Windows build dependencies, and Ubuntu package build now consume `requirements.lock`.
4. Weekly GitHub Actions dependency audit exists at `.github/workflows/dependency-audit.yml`.

## P2.1 Starter Checks

Command:

```bash
python3 -m pytest -q tests/test_webapp_api.py -k "async_process_route_returns_job_and_status"
```

Result:

1. Async process route returns `202`.
2. Job status can be polled through `GET /api/tasks/<id>/process-status`.
3. Existing synchronous processing route remains unchanged by default.

## Windows Package Status

Windows installer definition exists:

1. `packaging/windows/ManuscriptEditor.iss`
2. Version is read from `VERSION`.
3. Build dependencies now install locked runtime dependencies through `requirements-build.txt`.
4. Expected installer output: `dist_installer/ManuscriptEditor_Setup_1.1.0.exe`

Fresh-machine validation still required on Windows:

1. Build `.exe`.
2. Build installer.
3. Install on clean Windows machine.
4. Launch app.
5. Upload `.txt` and `.docx`.
6. Process manuscript.
7. Save clean/highlighted outputs.
8. Relaunch after restart.

## Ubuntu Package Status

Ubuntu package build script exists:

1. `scripts/linux/build_deb.sh`
2. Runtime venv installs from `requirements.lock` when present.
3. Expected package output: `dist_deb/manuscript-editor_1.1.0_amd64.deb`

Fresh-machine validation still required on Ubuntu:

1. Build `.deb`.
2. Install with `sudo dpkg -i dist_deb/manuscript-editor_1.1.0_amd64.deb`.
3. Launch from app menu.
4. Launch via `manuscript-editor`.
5. Upload `.txt` and `.docx`.
6. Process manuscript.
7. Save clean/highlighted outputs.
8. Relaunch after logout/reboot.

## Final Release Decision

Current decision:

1. Local code quality and static packaging readiness are acceptable.
2. Dependency-lock and async-processing starter checks passed locally.
3. Public release should remain held until fresh-machine Windows and Ubuntu evidence is captured in `QA_SIGNOFF_TEMPLATE.md` or a versioned signoff file.
