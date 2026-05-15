import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';

/**
 * Registered against the `commentMd.preview` viewType so that the extension
 * appears in VSCode's "Reopen Editor With..." picker for .md files.
 */
export class CommentMdEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'commentMd.preview';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    PreviewPanel.attach(webviewPanel, document.uri, this.context);
  }
}
