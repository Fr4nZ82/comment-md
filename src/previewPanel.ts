import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createRenderer } from './markdown';
import { CommentStore, Comment } from './commentStore';

/**
 * Manages a single preview surface (either a panel we created via command,
 * or an external panel passed to us by VSCode's custom editor provider).
 */
export class PreviewPanel {
  private static commandPanels: Map<string, PreviewPanel> = new Map();
  private static instances: Set<PreviewPanel> = new Set();
  static current: PreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly mdUri: vscode.Uri;
  private readonly context: vscode.ExtensionContext;
  private readonly store: CommentStore;
  private readonly md = createRenderer();
  private readonly tracked: boolean;
  private disposables: vscode.Disposable[] = [];
  private watcher?: vscode.FileSystemWatcher;
  private disposed = false;

  /** Opens (or reveals) a Comment MD preview panel for the given .md file. */
  static createOrShow(context: vscode.ExtensionContext, mdUri: vscode.Uri) {
    const key = mdUri.toString();
    const existing = PreviewPanel.commandPanels.get(key);
    if (existing) {
      existing.panel.reveal();
      PreviewPanel.current = existing;
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'commentMdPreview',
      `Comment MD: ${path.basename(mdUri.fsPath)}`,
      vscode.ViewColumn.Beside,
      PreviewPanel.webviewOptions(context)
    );
    const wrapper = new PreviewPanel(panel, mdUri, context, true);
    PreviewPanel.commandPanels.set(key, wrapper);
    PreviewPanel.current = wrapper;
  }

  /** Binds to a panel that VSCode created for us (custom editor path). */
  static attach(panel: vscode.WebviewPanel, mdUri: vscode.Uri, context: vscode.ExtensionContext): PreviewPanel {
    panel.webview.options = PreviewPanel.webviewOptions(context);
    const wrapper = new PreviewPanel(panel, mdUri, context, false);
    PreviewPanel.current = wrapper;
    return wrapper;
  }

  static disposeAll() {
    for (const p of [...PreviewPanel.instances]) p.dispose();
    PreviewPanel.commandPanels.clear();
    PreviewPanel.instances.clear();
  }

  private static webviewOptions(context: vscode.ExtensionContext): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    };
  }

  private constructor(panel: vscode.WebviewPanel, mdUri: vscode.Uri, context: vscode.ExtensionContext, tracked: boolean) {
    this.panel = panel;
    this.mdUri = mdUri;
    this.context = context;
    this.tracked = tracked;
    this.store = new CommentStore(mdUri, context);
    PreviewPanel.instances.add(this);

    this.panel.webview.html = this.buildHtml();
    this.sendUpdate();
    vscode.commands.executeCommand('setContext', 'commentMd.previewOpen', true);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(() => {
      if (this.panel.active) PreviewPanel.current = this;
    }, null, this.disposables);

    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);

    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(mdUri.fsPath), path.basename(mdUri.fsPath))
    );
    const refresh = () => this.sendUpdate();
    this.watcher.onDidChange(refresh, null, this.disposables);
    this.watcher.onDidCreate(refresh, null, this.disposables);
    this.disposables.push(this.watcher);

    const docChange = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.toString() === this.mdUri.toString()) this.sendUpdate();
    });
    this.disposables.push(docChange);
  }

  requestSubmit() {
    this.panel.webview.postMessage({ type: 'requestSubmit' });
  }

  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.tracked) PreviewPanel.commandPanels.delete(this.mdUri.toString());
    PreviewPanel.instances.delete(this);
    if (PreviewPanel.current === this) PreviewPanel.current = undefined;
    while (this.disposables.length) {
      const d = this.disposables.pop();
      try { d?.dispose(); } catch { /* noop */ }
    }
    if (this.tracked) {
      try { this.panel.dispose(); } catch { /* noop */ }
    }
    if (PreviewPanel.instances.size === 0) {
      vscode.commands.executeCommand('setContext', 'commentMd.previewOpen', false);
    }
  }

  private readMarkdown(): string {
    try {
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.mdUri.toString());
      if (doc) return doc.getText();
      return fs.readFileSync(this.mdUri.fsPath, 'utf8');
    } catch {
      return `# Error\nCould not read \`${this.mdUri.fsPath}\``;
    }
  }

  private sendUpdate() {
    const source = this.readMarkdown();
    const html = this.md.render(source);
    this.panel.webview.postMessage({
      type: 'update',
      html,
      comments: this.store.getAll(),
      file: this.mdUri.fsPath,
    });
  }

  private async onMessage(msg: any) {
    switch (msg?.type) {
      case 'ready':
        this.sendUpdate();
        break;
      case 'addComment': {
        const c = this.store.add({
          startLine: msg.startLine,
          endLine: msg.endLine,
          selectedText: msg.selectedText ?? '',
          comment: msg.comment ?? '',
        });
        this.panel.webview.postMessage({ type: 'commentAdded', comment: c });
        break;
      }
      case 'updateComment': {
        const c = this.store.update(msg.id, msg.comment ?? '');
        if (c) this.panel.webview.postMessage({ type: 'commentUpdated', comment: c });
        break;
      }
      case 'deleteComment': {
        if (this.store.remove(msg.id)) {
          this.panel.webview.postMessage({ type: 'commentDeleted', id: msg.id });
        }
        break;
      }
      case 'submit': {
        await this.handleSubmit(msg.comments as Comment[]);
        break;
      }
      case 'log':
        console.log('[comment-md webview]', msg.payload);
        break;
    }
  }

  private async handleSubmit(comments: Comment[]) {
    const payload = {
      file: this.mdUri.fsPath,
      submittedAt: new Date().toISOString(),
      comments: comments.map((c) => ({
        file: this.mdUri.fsPath,
        startLine: c.startLine,
        endLine: c.endLine,
        selectedText: c.selectedText,
        comment: c.comment,
      })),
    };
    const json = JSON.stringify(payload, null, 2);

    const ws = vscode.workspace.getWorkspaceFolder(this.mdUri);
    const outDir = ws
      ? path.join(ws.uri.fsPath, '.comment-md-cache')
      : path.join(this.context.globalStorageUri.fsPath, 'cache');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = Date.now();
    const jsonFile = path.join(outDir, `submission-${stamp}.json`);
    const mdFile = path.join(outDir, `submission-${stamp}.md`);
    fs.writeFileSync(jsonFile, json, 'utf8');
    fs.writeFileSync(mdFile, buildSubmissionMarkdown(payload, json), 'utf8');

    await vscode.env.clipboard.writeText(json);

    const sentToChat = await this.tryInsertIntoClaudeChat(mdFile);

    const summary = `Comment MD: ${payload.comments.length} comment(s) submitted.`;
    const detail = sentToChat
      ? 'Reference inserted into Claude chat — review and press Enter.'
      : 'Copied to clipboard + saved on disk.';
    const choice = await vscode.window.showInformationMessage(
      `${summary} ${detail}`,
      'Open submission',
      'OK'
    );
    if (choice === 'Open submission') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mdFile));
      vscode.window.showTextDocument(doc, { preview: false });
    }
    this.panel.webview.postMessage({ type: 'submitDone', file: mdFile, sentToChat });
  }

  /**
   * Best-effort: opens the Claude Code chat, makes the submission .md the
   * active editor with a full selection, then invokes Claude Code's own
   * `insertAtMention` command so the chat input receives an @-reference to it.
   * Returns false silently if Claude Code is not installed or any step fails.
   */
  private async tryInsertIntoClaudeChat(submissionFile: string): Promise<boolean> {
    const claude = vscode.extensions.getExtension('Anthropic.claude-code');
    if (!claude) return false;
    try {
      if (!claude.isActive) await claude.activate();

      const cfg = vscode.workspace.getConfiguration('claudeCode');
      const useTerminal = cfg.get<boolean>('useTerminal') === true;
      const preferredLocation = cfg.get<string>('preferredLocation') ?? 'panel';

      const allCommands = await vscode.commands.getCommands(true);
      const insertCmd = useTerminal
        ? (allCommands.includes('claude-code.insertAtMentioned') ? 'claude-code.insertAtMentioned' : null)
        : (allCommands.includes('claude-vscode.insertAtMention') ? 'claude-vscode.insertAtMention' : null);
      if (!insertCmd) return false;

      if (!useTerminal) {
        const hasExistingClaudePanel = vscode.window.tabGroups.all
          .flatMap((g) => g.tabs)
          .some((t) => {
            const input = t.input as { viewType?: string } | undefined;
            return typeof input?.viewType === 'string' && /claude/i.test(input.viewType);
          });

        if (!hasExistingClaudePanel) {
          const openCmd = preferredLocation === 'sidebar'
            ? 'claude-vscode.sidebar.open'
            : 'claude-vscode.editor.openLast';
          if (allCommands.includes(openCmd)) {
            try { await vscode.commands.executeCommand(openCmd); } catch { /* noop */ }
          }
        }
      }

      const submissionUri = vscode.Uri.file(submissionFile);
      const doc = await vscode.workspace.openTextDocument(submissionUri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.Active,
      });
      const lastLine = Math.max(0, doc.lineCount - 1);
      const lastChar = doc.lineAt(lastLine).text.length;
      editor.selection = new vscode.Selection(0, 0, lastLine, lastChar);
      editor.revealRange(editor.selection);

      await vscode.commands.executeCommand(insertCmd);

      const submissionTab = vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .find((t) => {
          const input = t.input as { uri?: vscode.Uri } | undefined;
          return input?.uri?.toString() === submissionUri.toString();
        });
      if (submissionTab) {
        try { await vscode.window.tabGroups.close(submissionTab); } catch { /* noop */ }
      }

      return true;
    } catch (e) {
      console.error('[comment-md] tryInsertIntoClaudeChat failed', e);
      return false;
    }
  }

  private buildHtml(): string {
    const webview = this.panel.webview;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.js'));
    const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'mermaid.min.js'));
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Comment MD</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <header class="toolbar">
    <div class="title" id="title">Comment MD</div>
    <div class="actions">
      <span class="counter" id="counter">0 comments</span>
      <button id="btnSubmit" class="primary">Submit</button>
    </div>
  </header>
  <main class="layout">
    <section class="preview" id="preview"></section>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">Comments</div>
      <div class="comment-list" id="commentList"></div>
    </aside>
  </main>
  <div class="floater" id="floater" hidden>
    <button id="btnAdd">＋ Add comment</button>
  </div>
  <div class="modal" id="modal" hidden>
    <div class="modal-box">
      <div class="modal-header">
        <span id="modalTitle">New comment</span>
        <button class="icon" id="modalClose">✕</button>
      </div>
      <div class="modal-snippet" id="modalSnippet"></div>
      <textarea id="modalInput" placeholder="Write a comment..."></textarea>
      <div class="modal-actions">
        <button id="modalCancel">Cancel</button>
        <button id="modalSave" class="primary">Save</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

interface SubmissionPayload {
  file: string;
  submittedAt: string;
  comments: Array<{
    file: string;
    startLine: number;
    endLine: number;
    selectedText: string;
    comment: string;
  }>;
}

function buildSubmissionMarkdown(payload: SubmissionPayload, json: string): string {
  const lines: string[] = [];
  lines.push(`# Comment MD submission`);
  lines.push('');
  lines.push(`- **Source file:** \`${payload.file}\``);
  lines.push(`- **Submitted at:** ${payload.submittedAt}`);
  lines.push(`- **Comments:** ${payload.comments.length}`);
  lines.push('');
  lines.push(`Please review the comments below and respond.`);
  lines.push('');
  payload.comments.forEach((c, i) => {
    const rangeLabel = c.startLine === c.endLine
      ? `line ${c.startLine + 1}`
      : `lines ${c.startLine + 1}–${c.endLine}`;
    lines.push(`## ${i + 1}. ${rangeLabel}`);
    lines.push('');
    lines.push('**Selected text:**');
    lines.push('');
    lines.push('> ' + c.selectedText.split('\n').map((l) => l || ' ').join('\n> '));
    lines.push('');
    lines.push('**Comment:**');
    lines.push('');
    lines.push(c.comment);
    lines.push('');
  });
  lines.push(`---`);
  lines.push('');
  lines.push(`<details><summary>Raw JSON payload</summary>`);
  lines.push('');
  lines.push('```json');
  lines.push(json);
  lines.push('```');
  lines.push('');
  lines.push(`</details>`);
  lines.push('');
  return lines.join('\n');
}
