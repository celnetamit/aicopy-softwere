# P0 Release QA Signoff - Local Readiness

Date: 2026-05-15
Release version: `1.1.0`
Repo: `/home/itb09/manuscript_editor`
Environment: Local Linux workspace

## Result

Local release readiness: PASS

Final public release signoff: PENDING fresh-machine Windows and Ubuntu validation.

This file records what could be validated in the current Linux workspace. It does not replace the required installer/package tests on real fresh machines.

## Local Quality Gate

Command:

```bash
./scripts/run_quality_checks.sh
```

Result:

```text
Ran 156 tests in 310.927s
OK
All quality checks passed.
```

Covered:

1. Python compile checks.
2. Frontend JavaScript syntax checks.
3. Regression, DOCX fidelity, telemetry, and web API tests.

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

## Windows Package Status

Windows installer definition exists:

1. `packaging/windows/ManuscriptEditor.iss`
2. Version is read from `VERSION`.
3. Expected installer output: `dist_installer/ManuscriptEditor_Setup_1.1.0.exe`

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
2. Expected package output: `dist_deb/manuscript-editor_1.1.0_amd64.deb`

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
2. Public release should remain held until fresh-machine Windows and Ubuntu evidence is captured in `QA_SIGNOFF_TEMPLATE.md` or a versioned signoff file.
