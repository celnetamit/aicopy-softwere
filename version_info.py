"""Application version metadata sourced from a single VERSION file."""

from __future__ import annotations

import os


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
VERSION_FILE = os.path.join(ROOT_DIR, "VERSION")


def _read_version(default_value: str = "1.0.0") -> str:
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as handle:
            raw = handle.read().strip()
            return raw or default_value
    except Exception:
        return default_value


APP_VERSION = _read_version()
# Asset version tracks app release version for cache busting at release boundaries.
WEB_ASSET_VERSION = f"v{APP_VERSION}"

