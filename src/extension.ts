import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { CommentMdEditorProvider } from './customEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('commentMd.openPreview', (uri?: vscode.Uri) => {
      let target = uri;
      if (!target) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('Open a markdown file first.');
          return;
        }
        target = editor.document.uri;
      }
      if (!/\.(md|markdown)$/i.test(target.fsPath)) {
        vscode.window.showWarningMessage('Comment MD works only with .md / .markdown files.');
        return;
      }
      PreviewPanel.createOrShow(context, target);
    }),
    vscode.commands.registerCommand('commentMd.submit', () => {
      const panel = PreviewPanel.current;
      if (!panel) {
        vscode.window.showWarningMessage('No Comment MD preview is active.');
        return;
      }
      panel.requestSubmit();
    }),
    vscode.window.registerCustomEditorProvider(
      CommentMdEditorProvider.viewType,
      new CommentMdEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );
}

export function deactivate() {
  PreviewPanel.disposeAll();
}
