#!/usr/bin/env python3
"""Validate that release-facing version surfaces read from VERSION."""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT_DIR / "VERSION"


def read_text(relative_path: str) -> str:
    return (ROOT_DIR / relative_path).read_text(encoding="utf-8")


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def load_version_info():
    module_path = ROOT_DIR / "version_info.py"
    spec = importlib.util.spec_from_file_location("version_info_for_check", module_path)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load version_info.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    errors: list[str] = []
    version = VERSION_FILE.read_text(encoding="utf-8").strip()
    require(bool(version), "VERSION must not be empty", errors)
    require(
        re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version) is not None,
        f"VERSION must be semantic, got {version!r}",
        errors,
    )

    version_info = load_version_info()
    require(version_info.APP_VERSION == version, "version_info.APP_VERSION must match VERSION", errors)
    require(version_info.WEB_ASSET_VERSION == f"v{version}", "WEB_ASSET_VERSION must be v{APP_VERSION}", errors)

    webapp = read_text("webapp.py")
    require("from version_info import APP_VERSION, WEB_ASSET_VERSION" in webapp, "webapp.py must import version_info constants", errors)
    require('"APP_VERSION": APP_VERSION' in webapp, "webapp.py must render APP_VERSION into web templates", errors)
    require('"ASSET_VERSION": WEB_ASSET_VERSION' in webapp, "webapp.py must render WEB_ASSET_VERSION into web templates", errors)
    require("app_version=APP_VERSION" in webapp, "webapp route dependencies must use APP_VERSION", errors)
    require("web_asset_version=WEB_ASSET_VERSION" in webapp, "webapp route dependencies must use WEB_ASSET_VERSION", errors)

    header = read_text("web/fragments/app_header.html")
    footer = read_text("web/fragments/app_footer.html")
    require("{{APP_VERSION}}" in header, "app header must use APP_VERSION placeholder", errors)
    require("{{APP_VERSION}}" in footer, "app footer must use APP_VERSION placeholder", errors)

    windows_iss = read_text("packaging/windows/ManuscriptEditor.iss")
    require('FileRead("..\\..\\VERSION")' in windows_iss, "Windows installer must read VERSION", errors)
    require("AppVersion={#MyAppVersion}" in windows_iss, "Windows installer AppVersion must use MyAppVersion", errors)
    require(
        "OutputBaseFilename=ManuscriptEditor_Setup_{#MyAppVersion}" in windows_iss,
        "Windows installer output filename must use MyAppVersion",
        errors,
    )

    deb_script = read_text("scripts/linux/build_deb.sh")
    require('${ROOT_DIR}/VERSION' in deb_script, "Debian build script must read VERSION", errors)
    require('VERSION="${1:-${DEFAULT_VERSION}}"' in deb_script, "Debian build script must default to VERSION", errors)
    require("Version: ${VERSION}" in deb_script, "Debian control file must use VERSION", errors)
    require("${APP_ID}_${VERSION}_${ARCH}.deb" in deb_script, "Debian output filename must use VERSION", errors)

    docs_to_check = {
        "README.md": [
            "ManuscriptEditor_Setup_1.0.0.exe",
            "build_deb.sh 1.0.0",
            "manuscript-editor_1.0.0_amd64.deb",
        ],
        "KID_GUIDE.md": [
            "build_deb.sh 1.0.0",
        ],
    }
    for relative_path, stale_snippets in docs_to_check.items():
        text = read_text(relative_path)
        for snippet in stale_snippets:
            require(snippet not in text, f"{relative_path} contains stale version example {snippet!r}", errors)

    if errors:
        for error in errors:
            print(f"VERSION CHECK FAILED: {error}", file=sys.stderr)
        return 1
    print(f"Version consistency OK: {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
