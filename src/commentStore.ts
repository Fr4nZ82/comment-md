import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface Comment {
  id: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export class CommentStore {
  private comments: Comment[] = [];
  private readonly cacheFile: string;

  constructor(private readonly mdUri: vscode.Uri, context: vscode.ExtensionContext) {
    this.cacheFile = CommentStore.resolveCachePath(mdUri, context);
    this.load();
  }

  private static resolveCachePath(mdUri: vscode.Uri, context: vscode.ExtensionContext): string {
    const ws = vscode.workspace.getWorkspaceFolder(mdUri);
    let baseDir: string;
    if (ws) {
      baseDir = path.join(ws.uri.fsPath, '.comment-md-cache');
    } else {
      baseDir = path.join(context.globalStorageUri.fsPath, 'cache');
    }
    fs.mkdirSync(baseDir, { recursive: true });
    const rel = ws ? path.relative(ws.uri.fsPath, mdUri.fsPath) : mdUri.fsPath;
    const safe = rel.replace(/[\\/:]/g, '__');
    const hash = crypto.createHash('sha1').update(mdUri.fsPath).digest('hex').slice(0, 8);
    return path.join(baseDir, `${safe}.${hash}.json`);
  }

  private load(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const raw = fs.readFileSync(this.cacheFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.comments)) {
          this.comments = parsed.comments;
        }
      }
    } catch (e) {
      console.error('[comment-md] failed to load cache', e);
      this.comments = [];
    }
  }

  private save(): void {
    const payload = {
      file: this.mdUri.fsPath,
      updatedAt: new Date().toISOString(),
      comments: this.comments,
    };
    fs.writeFileSync(this.cacheFile, JSON.stringify(payload, null, 2), 'utf8');
  }

  getAll(): Comment[] {
    return [...this.comments];
  }

  add(input: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Comment {
    const now = new Date().toISOString();
    const c: Comment = {
      id: crypto.randomBytes(6).toString('hex'),
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.comments.push(c);
    this.save();
    return c;
  }

  update(id: string, comment: string): Comment | undefined {
    const c = this.comments.find((x) => x.id === id);
    if (!c) return undefined;
    c.comment = comment;
    c.updatedAt = new Date().toISOString();
    this.save();
    return c;
  }

  remove(id: string): boolean {
    const before = this.comments.length;
    this.comments = this.comments.filter((x) => x.id !== id);
    if (this.comments.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  get cachePath(): string {
    return this.cacheFile;
  }
}
