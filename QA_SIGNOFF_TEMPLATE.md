# QA Sign-Off Evidence Template

Release Version: `vX.Y.Z`  
Build Date: `YYYY-MM-DD`  
Tester Name: `________________`

## 1) Test Environment

### Windows
1. OS version: `________________`
2. Installer file used: `________________`
3. Test machine type: `Fresh machine / Existing machine`

### Ubuntu
1. OS version: `________________`
2. Package file used: `________________`
3. Test machine type: `Fresh machine / Existing machine`

## 2) Windows Installer Verification

1. [ ] Installer launches successfully.
2. [ ] App installs without errors.
3. [ ] App launches from Start Menu/Desktop shortcut.
4. [ ] File upload works (`.txt` and `.docx`).
5. [ ] Processing completes successfully.
6. [ ] `Save Clean Version` works.
7. [ ] `Save Highlighted` works.
8. [ ] App relaunch works after system restart.

Evidence links (screenshots/logs):
1. `________________`
2. `________________`
3. `________________`

Notes:
`____________________________________________________________`

## 3) Ubuntu `.deb` Verification

Install command used:

```bash
sudo dpkg -i manuscript-editor_<version>_<arch>.deb
```

1. [ ] Package installs without errors.
2. [ ] App launches from app menu.
3. [ ] App launches via terminal (`manuscript-editor`).
4. [ ] File upload works (`.txt` and `.docx`).
5. [ ] Processing completes successfully.
6. [ ] `Save Clean Version` works.
7. [ ] `Save Highlighted` works.
8. [ ] Relaunch works after logout/reboot.

Evidence links (screenshots/logs):
1. `________________`
2. `________________`
3. `________________`

Notes:
`____________________________________________________________`

## 4) Regression Smoke

1. [ ] No blocking crash during startup.
2. [ ] No blocking crash during process/export flow.
3. [ ] First-run setup wizard behavior is correct.
4. [ ] No critical UI blocker observed.

## 5) Final Decision

1. QA result:
   - [ ] PASS
   - [ ] PASS with minor known issues
   - [ ] FAIL
2. Blocking issues (if any): `________________`
3. Recommended action:
   - [ ] Release approved
   - [ ] Hold release
   - [ ] Re-test required

QA Sign-Off Name: `________________`  
Date: `YYYY-MM-DD`
