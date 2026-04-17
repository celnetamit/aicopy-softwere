# Changelog

All notable changes to this project are documented in this file.

The format is inspired by Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Release checklist document covering versioning, changelog flow, upgrade notes, and rollback steps.

## [1.0.0] - 2026-04-17

### Added

- Week 1 quality baseline and regression test harness.
- Week 2 save/export hardening with telemetry and stable error codes.
- Week 3 section-wise chunk quality scoring and safe fallback selection.
- Week 4 global consistency pass scoring and audit summary in UI.
- Week 5 journal profile system with stronger profile-aware reference formatting.
- Week 6 citation/reference validator with corrections-tab warnings.
- Week 7 pro editing UX:
  - compare mode (Original, Corrected, Redline)
  - accept/reject correction groups
  - deterministic export from accepted decisions
- Week 8 packaging and deployment foundations:
  - first-run setup wizard
  - Windows portable and installer pipeline
  - Ubuntu `.deb` package pipeline

### Fixed

- Save fallback behavior for environments without `tkinter`.
- Wizard popup close behavior and first-run state handling.
