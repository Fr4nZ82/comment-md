import MarkdownIt from 'markdown-it';

export function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
  });

  md.core.ruler.push('source_line_attrs', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.level === 0 && token.type.endsWith('_open')) {
        token.attrJoin('class', 'src-block');
        token.attrSet('data-source-line', String(token.map[0]));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
      if (token.map && token.type === 'fence') {
        token.attrJoin('class', 'src-block');
        token.attrSet('data-source-line', String(token.map[0]));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
    }
  });

  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    if (info === 'mermaid') {
      const startLine = token.map ? token.map[0] : 0;
      const endLine = token.map ? token.map[1] : 0;
      const escaped = token.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<div class="mermaid src-block" data-source-line="${startLine}" data-source-line-end="${endLine}">${escaped}</div>\n`;
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md;
}
