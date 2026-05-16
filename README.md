# Comment MD

A VSCode extension that opens Markdown files in a rich preview where you can attach **persistent comments** to any text selection. Mermaid diagrams are rendered inline. Comments live in a sidecar cache — the original `.md` file is never touched.

When you're done annotating, click **Submit** and the extension exports your comments as a structured JSON payload (copied to clipboard + saved to disk) ready to feed to a code-review tool, an LLM chat, or any downstream pipeline.

![Comment MD — selecting text, adding comments, and submitting them to a Claude Code chat](docs/demo.gif)

---

## Features

- **Custom Markdown preview** with Mermaid (bundled — no companion extension required).
- **Select-to-comment**: highlight any text, click the floating "＋ Add comment" button, write a note, save.
- **Persistent, file-scoped cache**: comments are stored under `.comment-md-cache/<file>.<hash>.json` in your workspace.
- **Editable**: edit, delete, or jump-to any comment from the sidebar.
- **Visual cue**: blocks containing comments get a left-side accent so you can see at a glance what has feedback.
- **Submit**: serializes all comments as JSON `{ file, startLine, endLine, selectedText, comment }[]`, copies it to the clipboard, and writes `submission-<timestamp>.json` to the cache directory.
- **Three access points**: command palette, `editor/title` action, right-click in the Explorer, right-click inside an open `.md`, and **"Reopen Editor With..."** picker.

---

## Install

Install **Comment MD** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Fr4nz82.comment-md), or from inside VSCode:

1. Open the **Extensions** view (`Ctrl+Shift+X`).
2. Search for **Comment MD**.
3. Click **Install**.

No configuration is required — open any `.md` file and follow the steps below.

---

## How to open the preview

You have several entry points — pick whichever fits your flow.

### 1. Right-click a `.md` file in the Explorer
The file tree's context menu shows **Open Comment Preview**. Use this when you want to start a review without opening the raw markdown first.

### 2. Right-click inside an open `.md` editor
The editor's context menu has the same **Open Comment Preview** entry.

### 3. The editor title bar
Open a `.md` file → click the **Open Comment Preview** action in the top-right of the editor tab.

### 4. Command palette
`Ctrl+Shift+P` → **Comment MD: Open Comment Preview**.

### 5. "Reopen Editor With..." (replace text editor with the preview)
With a `.md` file open, run **View: Reopen Editor With...** (or right-click the tab) and choose **Comment MD Preview**. This swaps the text view for our preview in the same editor slot. To go back, use **Reopen Editor With... → Text Editor**.

> Tip: if you want the preview to be the *default* opener for `.md`, run **Configure Default Editor for '\*.md'...** and select **Comment MD Preview**.

---

## Workflow

1. **Open the preview** with any of the methods above.
2. **Select text** in the preview pane. A floating **＋ Add comment** button appears anchored to the selection.
3. **Click it.** A modal opens showing the selected snippet and a textarea. Type your comment. `Ctrl+Enter` saves, `Esc` cancels.
4. Your comment now appears in the right-hand **sidebar**, sorted by source line. The corresponding block in the preview gets a left-edge accent so you can see at a glance which blocks have feedback.
5. **Manage comments**: each sidebar card has *Go to* (scroll the preview to the comment's block), *Edit*, and *Delete* buttons.
6. **Submit**: click the **Submit** button in the toolbar.
   - A clean `submission-<timestamp>.json` and a chat-friendly `submission-<timestamp>.md` are written to `.comment-md-cache/`.
   - The JSON is also copied to your clipboard.
   - **If the Claude Code VSCode extension (`Anthropic.claude-code`) is installed**, the extension automatically:
     1. opens the Claude chat (panel or sidebar, per your `claudeCode.preferredLocation` setting),
     2. opens the submission `.md` as the active editor,
     3. selects its full content,
     4. invokes Claude Code's `insertAtMention` / `insertAtMentioned` command so an `@.comment-md-cache/submission-XXX.md#L1-LN` reference appears in the chat input.
   - You then add any instruction you want (e.g. *"reply to each comment"*) and press Enter. Claude reads the referenced file and sees both the human-readable summary and the raw JSON.
   - If Claude Code is not installed, the flow falls back to clipboard + saved file only.

---

## Submission payload

```json
{
  "file": "/path/to/file.md",
  "submittedAt": "2026-05-15T12:34:56.000Z",
  "comments": [
    {
      "file": "/path/to/file.md",
      "startLine": 12,
      "endLine": 14,
      "selectedText": "the highlighted snippet from the preview",
      "comment": "the note you wrote"
    }
  ]
}
```

- `startLine` / `endLine` are **0-based** line numbers in the markdown source. They identify the block(s) the selection started/ended in.
- `selectedText` preserves the exact literal text the user highlighted, so downstream tools can locate sub-paragraph spans even though line numbers are block-level.

---

## Storage layout

```
<workspace>/
└── .comment-md-cache/
    ├── docs__guide.md.a1b2c3d4.json     # per-file comment cache
    ├── docs__intro.md.e5f6a7b8.json
    ├── submission-1715789012345.json    # exported batches (raw)
    └── submission-1715789012345.md      # chat-friendly wrapper of the same batch
```

If the file is opened outside any workspace, the cache lives in the extension's `globalStorage` instead.

Add this to your repo's `.gitignore` if you don't want to commit reviews:

```
.comment-md-cache/
```

---

## Commands

| Command ID                | Title                                | Notes                                              |
|---------------------------|--------------------------------------|----------------------------------------------------|
| `commentMd.openPreview`   | Comment MD: Open Comment Preview     | Opens the preview beside the current editor.       |
| `commentMd.submit`        | Comment MD: Submit All Comments      | Available while a Comment MD preview is focused.   |

---

## Keyboard shortcuts (inside the preview)

| Action            | Shortcut            |
|-------------------|---------------------|
| Save comment      | `Ctrl+Enter`        |
| Cancel modal      | `Esc`               |

---

## Notes & limitations

- Source-line mapping uses **block-level granularity** (paragraph, heading, list item, fence). Sub-paragraph offsets are not tracked, but `selectedText` is preserved so downstream consumers can locate exact spans.
- Comments persist across file edits, but if blocks are moved/renumbered the saved `startLine`/`endLine` may drift. Re-anchor manually via Edit/Delete.
- The preview re-renders when the file is saved.
- Mermaid runs in the webview with `securityLevel: 'loose'` so directives and click handlers in diagrams won't fire across the extension boundary.

---

## Development

Clone, install, compile, and launch the Extension Development Host:

```bash
git clone https://github.com/Fr4nZ82/comment-md.git
cd comment-md
npm install
npm run compile
```

In VSCode, open the cloned folder and press **F5** ("Run Extension"). A new Extension Development Host window launches with the extension loaded — open any `.md` file there to iterate.

To produce a local `.vsix`:

```bash
npm run package
```

Issues and contributions: <https://github.com/Fr4nZ82/comment-md/issues>.
