# Change Log

All notable changes to the "comment-md" extension will be documented in this file.

## [0.1.0] - 2026-05-16

### Added

- Initial release.
- Custom Markdown preview webview with persistent per-selection comments.
- Mermaid diagram rendering (bundled, no companion extension required).
- Sidecar JSON cache per source file under `.comment-md-cache/`; original `.md` is never modified.
- Submit flow: serializes comments to JSON + chat-friendly Markdown, copies JSON to clipboard, writes both to disk.
- Best-effort handoff to the Claude Code VSCode extension on submit (auto `@`-mention of the submission file in chat).
- Custom editor provider registered under `commentMd.preview` so the preview shows up in "Reopen Editor With…".
