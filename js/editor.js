/*
 * Write Canvas — the chapter editor: Markdown in, manuscript out.
 *
 * The textarea is the source of truth while a chapter is open. Changes are
 * saved after a short pause, and immediately whenever the writer leaves.
 */
const EditorView = (() => {
  const { el } = UI;
  const SAVE_DELAY = 800;
  const COUNT_DELAY = 150;
  const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

  // Cursor and scroll per chapter, kept for the length of the session.
  const positions = new Map();

  let state = null;

  function countWords(text) {
    const words = text.match(WORD_RE);
    return words ? words.length : 0;
  }

  /* ---------- Rendering ---------- */

  function render(root, bookId, chapterId, options = {}) {
    const book = Store.getBook(bookId);
    const chapter = Store.getChapter(bookId, chapterId);
    const chapters = Store.getChapters(bookId);
    const index = chapters.findIndex((c) => c.id === chapterId);

    const textarea = el('textarea', {
      class: 'manuscript-input',
      'aria-label': `${chapter.title}, Markdown text`,
      placeholder: 'Begin writing…',
      spellcheck: 'true',
      autocapitalize: 'sentences',
      value: chapter.content,
    });
    const preview = el('article', { class: 'manuscript-preview', hidden: true, 'aria-live': 'off' });
    const writeTab = modeButton('Write', 'write');
    const previewTab = modeButton('Preview', 'preview');
    const wordCount = el('span', { class: 'word-count' });
    const saveStatus = el('span', { class: 'save-status', role: 'status' });

    root.append(el('div', { class: 'editor-screen' },
      el('header', { class: 'editor-bar' },
        el('a', { class: 'back-link', href: `#/book/${encodeURIComponent(bookId)}` },
          el('span', { class: 'back-arrow', 'aria-hidden': 'true' }, '←'),
          el('span', { class: 'back-title' }, book.title)),
        el('div', { class: 'mode-toggle', role: 'group', 'aria-label': 'View' }, writeTab, previewTab)),
      el('div', { class: 'desk' },
        el('div', { class: 'sheet' },
          el('h1', { class: 'chapter-heading' }, chapter.title),
          textarea,
          preview)),
      el('footer', { class: 'editor-foot' },
        wordCount,
        chapterNav(bookId, chapters, index),
        saveStatus)));

    state = {
      bookId, chapterId, textarea, preview, writeTab, previewTab, wordCount, saveStatus,
      mode: 'write', dirty: false, savedAt: null, saveTimer: null, countTimer: null, ticker: null,
    };

    textarea.addEventListener('input', onInput);
    updateWordCount();
    setStatus(chapter.content ? 'Saved' : '');
    state.ticker = setInterval(refreshSavedLabel, 20000);
    restorePosition(options.focusEditor || window.matchMedia('(pointer: fine)').matches);
  }

  function modeButton(label, mode) {
    return el('button', {
      type: 'button', class: 'mode-btn', 'aria-pressed': String(mode === 'write'),
      onclick: () => setMode(mode),
    }, label);
  }

  function chapterNav(bookId, chapters, index) {
    const link = (chapter, className, text) => chapter && el('a', {
      class: `chapter-step ${className}`,
      href: `#/book/${encodeURIComponent(bookId)}/chapter/${encodeURIComponent(chapter.id)}`,
      title: chapter.title,
    }, text);
    return el('nav', { class: 'chapter-steps', 'aria-label': 'Chapters' },
      link(chapters[index - 1], 'prev', '‹ Previous'),
      link(chapters[index + 1], 'next', 'Next ›'));
  }

  function restorePosition(shouldFocus) {
    const { textarea } = state;
    const saved = positions.get(state.chapterId);
    const end = textarea.value.length;
    const start = saved ? Math.min(saved.start, end) : end;
    const finish = saved ? Math.min(saved.end, end) : end;
    if (shouldFocus) textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, finish);
    textarea.scrollTop = saved ? saved.scrollTop : textarea.scrollHeight;
  }

  function rememberPosition() {
    const { textarea } = state;
    positions.set(state.chapterId, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
    });
  }

  /* ---------- Write / Preview ---------- */

  function setMode(mode) {
    if (!state || state.mode === mode) return;
    const { textarea, preview } = state;
    flush();

    const ratio = (el) => (el.scrollHeight > el.clientHeight
      ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0);

    if (mode === 'preview') {
      const position = ratio(textarea);
      preview.innerHTML = textarea.value.trim()
        ? Markdown.render(textarea.value)
        : '<p class="preview-empty">Nothing written yet.</p>';
      textarea.hidden = true;
      preview.hidden = false;
      preview.scrollTop = position * (preview.scrollHeight - preview.clientHeight);
    } else {
      const position = ratio(preview);
      preview.hidden = true;
      textarea.hidden = false;
      textarea.scrollTop = position * (textarea.scrollHeight - textarea.clientHeight);
      textarea.focus({ preventScroll: true });
    }

    state.mode = mode;
    state.writeTab.setAttribute('aria-pressed', String(mode === 'write'));
    state.previewTab.setAttribute('aria-pressed', String(mode === 'preview'));
  }

  /* ---------- Saving ---------- */

  function onInput() {
    state.dirty = true;
    setStatus('Saving…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(flush, SAVE_DELAY);
    if (!state.countTimer) {
      state.countTimer = setTimeout(() => { state.countTimer = null; updateWordCount(); }, COUNT_DELAY);
    }
  }

  // Saves now if there are unsaved changes. Returns true when nothing is pending.
  function flush(force = false) {
    if (!state) return true;
    clearTimeout(state.saveTimer);
    if (!state.dirty && !force) return true;

    const saved = Store.updateChapter(state.bookId, state.chapterId, { content: state.textarea.value });
    if (saved && Store.lastWriteOk()) {
      state.dirty = false;
      state.savedAt = Date.now();
      setStatus(UI.savedAgo(state.savedAt));
    } else {
      setStatus(saved ? 'Not saved' : 'Not saved — chapter no longer exists', true);
    }
    UI.showStorageNotice();
    return !state.dirty;
  }

  function setStatus(text, isError = false) {
    state.saveStatus.textContent = text;
    state.saveStatus.classList.toggle('is-error', isError);
  }

  function refreshSavedLabel() {
    if (state && !state.dirty && state.savedAt) setStatus(UI.savedAgo(state.savedAt));
  }

  function updateWordCount() {
    if (state) state.wordCount.textContent = UI.plural(countWords(state.textarea.value), 'word');
  }

  /* ---------- Lifecycle ---------- */

  function leave() {
    if (!state) return;
    flush();
    rememberPosition();
    clearTimeout(state.countTimer);
    clearInterval(state.ticker);
    state = null;
  }

  return {
    render,
    leave,
    flush,
    isOpen: () => state !== null,
    hasUnsavedChanges: () => Boolean(state && state.dirty),
  };
})();
