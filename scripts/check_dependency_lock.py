#!/usr/bin/env python3
"""Validate deterministic dependency-lock wiring for release builds."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
NAME_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*")
PIN_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==[A-Za-z0-9_.!+*-]+(?:\s*;.*)?\s*$")


def normalize_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def read_text(relative_path: str) -> str:
    return (ROOT_DIR / relative_path).read_text(encoding="utf-8")


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def meaningful_lines(relative_path: str) -> list[str]:
    lines: list[str] = []
    for raw_line in read_text(relative_path).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def package_names_from_requirements(relative_path: str) -> set[str]:
    names: set[str] = set()
    for line in meaningful_lines(relative_path):
        if line.startswith(("-", "--")):
            continue
        match = NAME_RE.match(line)
        if match:
            names.add(normalize_name(match.group(1)))
    return names


def package_names_from_lock(relative_path: str, errors: list[str]) -> set[str]:
    names: set[str] = set()
    for line in meaningful_lines(relative_path):
        if line.startswith(("-", "--")):
            errors.append(f"{relative_path} must not include nested requirement commands: {line}")
            continue
        if not PIN_RE.match(line):
            errors.append(f"{relative_path} must exact-pin every package with ==: {line}")
            continue
        match = NAME_RE.match(line)
        if match:
            names.add(normalize_name(match.group(1)))
    return names


def main() -> int:
    errors: list[str] = []
    lock_path = ROOT_DIR / "requirements.lock"
    require(lock_path.exists(), "requirements.lock must exist", errors)

    direct_runtime_packages = package_names_from_requirements("requirements.txt")
    locked_packages = package_names_from_lock("requirements.lock", errors) if lock_path.exists() else set()
    missing_direct = sorted(direct_runtime_packages - locked_packages)
    require(
        not missing_direct,
        f"requirements.lock is missing direct runtime packages: {', '.join(missing_direct)}",
        errors,
    )

    build_requirements = read_text("requirements-build.txt")
    require("-r requirements.lock" in build_requirements, "requirements-build.txt must install runtime dependencies from requirements.lock", errors)
    require("-r requirements.txt" not in build_requirements, "requirements-build.txt must not bypass requirements.lock", errors)

    dockerfile = read_text("Dockerfile")
    require("requirements.lock" in dockerfile, "Dockerfile must copy and install requirements.lock", errors)
    require("pip install -r requirements.lock" in dockerfile, "Dockerfile must install from requirements.lock", errors)

    deb_script = read_text("scripts/linux/build_deb.sh")
    require("requirements.lock" in deb_script, "Debian build script must copy and install requirements.lock", errors)
    require("pip\" install -r \"${DEPENDENCY_FILE}\"" in deb_script, "Debian build script must install through DEPENDENCY_FILE", errors)

    ci_workflow = read_text(".github/workflows/ci.yml")
    require("requirements.lock" in ci_workflow, "CI quality workflow must install from requirements.lock", errors)

    audit_workflow = ROOT_DIR / ".github" / "workflows" / "dependency-audit.yml"
    require(audit_workflow.exists(), "Weekly dependency audit workflow must exist", errors)
    if audit_workflow.exists():
        audit_text = audit_workflow.read_text(encoding="utf-8")
        require("pip-audit" in audit_text, "Dependency audit workflow must run pip-audit", errors)
        require("requirements.lock" in audit_text, "Dependency audit workflow must audit requirements.lock", errors)
        require("schedule:" in audit_text, "Dependency audit workflow must run on a schedule", errors)

    readme = read_text("README.md")
    require("requirements.lock" in readme, "README.md must document locked dependency installs", errors)
    require("Upgrade policy" in readme, "README.md must document the dependency upgrade policy", errors)

    if errors:
        for error in errors:
            print(f"DEPENDENCY LOCK CHECK FAILED: {error}", file=sys.stderr)
        return 1
    print("Dependency lock wiring OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
