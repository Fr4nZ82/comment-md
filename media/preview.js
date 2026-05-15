(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    preview: document.getElementById('preview'),
    sidebar: document.getElementById('sidebar'),
    commentList: document.getElementById('commentList'),
    counter: document.getElementById('counter'),
    title: document.getElementById('title'),
    floater: document.getElementById('floater'),
    btnAdd: document.getElementById('btnAdd'),
    btnSubmit: document.getElementById('btnSubmit'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSnippet: document.getElementById('modalSnippet'),
    modalInput: document.getElementById('modalInput'),
    modalSave: document.getElementById('modalSave'),
    modalCancel: document.getElementById('modalCancel'),
    modalClose: document.getElementById('modalClose'),
  };

  let state = {
    file: '',
    comments: [],
    pendingSelection: null,
    editingId: null,
  };

  let mermaidReady = false;
  if (typeof mermaid !== 'undefined') {
    try {
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      mermaidReady = true;
    } catch (e) {
      console.error('mermaid init failed', e);
    }
  }

  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'update':
        state.file = msg.file;
        state.comments = msg.comments || [];
        renderPreview(msg.html);
        renderSidebar();
        applyHighlights();
        break;
      case 'commentAdded':
        state.comments.push(msg.comment);
        renderSidebar();
        applyHighlights();
        break;
      case 'commentUpdated':
        state.comments = state.comments.map((c) => (c.id === msg.comment.id ? msg.comment : c));
        renderSidebar();
        break;
      case 'commentDeleted':
        state.comments = state.comments.filter((c) => c.id !== msg.id);
        renderSidebar();
        applyHighlights();
        break;
      case 'requestSubmit':
        submitAll();
        break;
      case 'submitDone':
        flash(`Submitted (${state.comments.length}).`);
        break;
    }
  });

  function renderPreview(html) {
    els.preview.innerHTML = html;
    if (mermaidReady) {
      const blocks = els.preview.querySelectorAll('.mermaid');
      blocks.forEach((b, i) => {
        const code = b.textContent || '';
        const id = `mermaid-svg-${Date.now()}-${i}`;
        try {
          const out = mermaid.render(id, code);
          if (out && typeof out.then === 'function') {
            out.then((res) => { b.innerHTML = res.svg; }).catch(() => {});
          } else if (out && out.svg) {
            b.innerHTML = out.svg;
          }
        } catch (e) {
          b.innerHTML = `<pre style="color:#c66">Mermaid error: ${escapeHtml(String(e && e.message || e))}</pre>`;
        }
      });
    }
  }

  function renderSidebar() {
    els.counter.textContent = `${state.comments.length} comment${state.comments.length === 1 ? '' : 's'}`;
    els.commentList.innerHTML = '';
    const sorted = [...state.comments].sort((a, b) => a.startLine - b.startLine);
    for (const c of sorted) {
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.dataset.id = c.id;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `lines ${c.startLine + 1}–${c.endLine}`;
      card.appendChild(meta);

      const snip = document.createElement('div');
      snip.className = 'snippet';
      snip.textContent = c.selectedText || '(no selection text)';
      card.appendChild(snip);

      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = c.comment;
      card.appendChild(body);

      const row = document.createElement('div');
      row.className = 'row';
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openModalForEdit(c));
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'deleteComment', id: c.id });
      });
      const gotoBtn = document.createElement('button');
      gotoBtn.textContent = 'Go to';
      gotoBtn.addEventListener('click', () => scrollToLine(c.startLine));
      row.appendChild(gotoBtn);
      row.appendChild(editBtn);
      row.appendChild(delBtn);
      card.appendChild(row);

      els.commentList.appendChild(card);
    }
  }

  function applyHighlights() {
    els.preview.querySelectorAll('.src-block.has-comment').forEach((el) => {
      el.classList.remove('has-comment');
    });
    const lines = new Set();
    for (const c of state.comments) {
      for (let l = c.startLine; l <= c.endLine; l++) lines.add(l);
    }
    els.preview.querySelectorAll('.src-block[data-source-line]').forEach((el) => {
      const start = parseInt(el.getAttribute('data-source-line') || '0', 10);
      const end = parseInt(el.getAttribute('data-source-line-end') || String(start), 10);
      for (let l = start; l < end; l++) {
        if (lines.has(l)) { el.classList.add('has-comment'); break; }
      }
    });
  }

  function scrollToLine(line) {
    const candidates = Array.from(els.preview.querySelectorAll('.src-block[data-source-line]'));
    let target = null;
    for (const el of candidates) {
      const s = parseInt(el.getAttribute('data-source-line') || '0', 10);
      if (s <= line) target = el;
      if (s > line) break;
    }
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
      hideFloater();
      return;
    }
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range) { hideFloater(); return; }
    if (!els.preview.contains(range.startContainer) || !els.preview.contains(range.endContainer)) {
      hideFloater();
      return;
    }
    const startBlock = findSrcBlock(range.startContainer);
    const endBlock = findSrcBlock(range.endContainer);
    if (!startBlock || !endBlock) { hideFloater(); return; }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { hideFloater(); return; }
    showFloater(rect, {
      startLine: parseInt(startBlock.getAttribute('data-source-line') || '0', 10),
      endLine: parseInt(endBlock.getAttribute('data-source-line-end') || endBlock.getAttribute('data-source-line') || '0', 10),
      selectedText: sel.toString(),
    });
  });

  function findSrcBlock(node) {
    let n = node;
    while (n && n !== els.preview) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('src-block')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function showFloater(rect, info) {
    state.pendingSelection = info;
    els.floater.style.left = (rect.left + rect.width / 2) + 'px';
    els.floater.style.top = (rect.top - 6) + 'px';
    els.floater.hidden = false;
  }
  function hideFloater() {
    state.pendingSelection = null;
    els.floater.hidden = true;
  }

  els.btnAdd.addEventListener('click', () => {
    if (!state.pendingSelection) return;
    openModalForNew(state.pendingSelection);
    hideFloater();
  });

  function openModalForNew(sel) {
    state.editingId = null;
    els.modalTitle.textContent = 'New comment';
    els.modalSnippet.textContent = sel.selectedText;
    els.modalInput.value = '';
    els.modal.hidden = false;
    setTimeout(() => els.modalInput.focus(), 30);
    els.modal.dataset.startLine = String(sel.startLine);
    els.modal.dataset.endLine = String(sel.endLine);
    els.modal.dataset.snippet = sel.selectedText;
  }
  function openModalForEdit(c) {
    state.editingId = c.id;
    els.modalTitle.textContent = 'Edit comment';
    els.modalSnippet.textContent = c.selectedText || '(no selection text)';
    els.modalInput.value = c.comment;
    els.modal.hidden = false;
    setTimeout(() => els.modalInput.focus(), 30);
  }
  function closeModal() { els.modal.hidden = true; state.editingId = null; }
  els.modalCancel.addEventListener('click', closeModal);
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.modal.hidden) closeModal();
    if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey) && !els.modal.hidden) els.modalSave.click();
  });

  els.modalSave.addEventListener('click', () => {
    const text = els.modalInput.value.trim();
    if (!text) { closeModal(); return; }
    if (state.editingId) {
      vscode.postMessage({ type: 'updateComment', id: state.editingId, comment: text });
    } else {
      vscode.postMessage({
        type: 'addComment',
        startLine: parseInt(els.modal.dataset.startLine || '0', 10),
        endLine: parseInt(els.modal.dataset.endLine || '0', 10),
        selectedText: els.modal.dataset.snippet || '',
        comment: text,
      });
    }
    closeModal();
    window.getSelection()?.removeAllRanges();
  });

  els.btnSubmit.addEventListener('click', submitAll);

  function submitAll() {
    vscode.postMessage({ type: 'submit', comments: state.comments });
  }

  function flash(text) {
    els.counter.textContent = text;
    setTimeout(() => {
      els.counter.textContent = `${state.comments.length} comment${state.comments.length === 1 ? '' : 's'}`;
    }, 1500);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
})();
