# Release Checklist (Week 8)

Use this checklist for every public release of Manuscript Editor.

## 1) Scope Freeze

1. Confirm release scope and version target (example: `1.0.1`).
2. Stop feature merges; allow only release-critical fixes.
3. Verify all open critical bugs are resolved or explicitly deferred.

## 2) Versioning

Version format: `MAJOR.MINOR.PATCH`

1. `MAJOR`: breaking changes.
2. `MINOR`: backward-compatible features.
3. `PATCH`: bug fixes and small improvements.

Tag format: `vMAJOR.MINOR.PATCH` (example: `v1.0.1`).

## 3) Changelog Update

1. Update `CHANGELOG.md`:
   - move items from `Unreleased` into the new version section
   - include Added/Changed/Fixed notes
   - include release date
2. Keep language user-focused (what changed and why it matters).

## 4) Quality Gate

Run local quality checks before building release artifacts:

```bash
./scripts/run_quality_checks.sh
```

Must pass:
1. Python compile checks.
2. Frontend JavaScript syntax checks.
3. Regression tests.

## 5) Build Artifacts

### Windows installer (`.exe`)

1. On Windows machine:
```bat
scripts\windows\build_exe.bat
scripts\windows\build_installer.bat
```
2. Validate outputs:
   - `dist\ManuscriptEditor\ManuscriptEditor.exe`
   - `dist_installer\ManuscriptEditor_Setup_<version>.exe`

### Ubuntu package (`.deb`)

1. On Ubuntu machine:
```bash
./scripts/linux/build_deb.sh <version>
```
2. Validate output:
   - `dist_deb/manuscript-editor_<version>_<arch>.deb`

## 6) Smoke Test Matrix

Record results in `QA_SIGNOFF_TEMPLATE.md`.

### Windows fresh machine

1. Install using setup `.exe`.
2. Launch app.
3. Load `.docx` manuscript.
4. Process document.
5. Download clean/highlighted output.
6. Confirm app reopens after restart.

### Ubuntu fresh machine

1. Install package:
```bash
sudo dpkg -i dist_deb/manuscript-editor_<version>_<arch>.deb
```
2. Launch from app menu or `manuscript-editor`.
3. Repeat same functional checks as Windows.

## 7) Upgrade Notes

For each release, write short upgrade notes:

1. What changed.
2. Any new dependencies or prerequisites.
3. Any migration steps required.
4. Any known issues/workarounds.

Suggested format:

```text
Upgrade Notes (vX.Y.Z)
- New:
- Changed:
- Action required:
- Known limitations:
```

## 8) Rollback Instructions

If release has blocking issues:

1. Stop new distribution immediately.
2. Re-publish previous stable installer/package artifacts.
3. Re-tag or mark broken release as deprecated in release notes.
4. Create hotfix branch from last stable tag.
5. Ship `PATCH` release with fix.

Rollback command examples:

```bash
# Ubuntu downgrade (example)
sudo dpkg -i manuscript-editor_<previous_version>_<arch>.deb
```

```text
# Windows rollback
Uninstall current version, install previous stable setup .exe.
```

## 9) Release Publish Steps

1. Commit final release docs.
2. Create git tag:
```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```
3. Confirm CI workflows completed:
   - Windows installer workflow
   - Ubuntu DEB workflow
4. Publish release notes and artifact links.

## 10) Post-Release Monitoring

Within first 24-48 hours:

1. Track install failures.
2. Track save/export failures.
3. Track startup crash reports.
4. Decide if hotfix is required.
