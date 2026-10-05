/*
 * Write Canvas — a book's workspace: its list of chapters.
 */
const ChaptersView = (() => {
  const { el } = UI;

  function render(root, bookId) {
    const book = Store.getBook(bookId);
    const chapters = Store.getChapters(bookId);
    root.append(el('div', { class: 'page' },
      el('nav', { class: 'topnav' },
        el('a', { class: 'back-link', href: '#/' }, '← Books')),
      el('header', { class: 'book-head' },
        el('h1', { class: 'book-heading', tabindex: '-1' }, book.title),
        chapters.length ? newChapterButton(bookId) : null),
      chapters.length ? chapterList(bookId, chapters) : emptyState(bookId)));
  }

  function newChapterButton(bookId) {
    return el('button', { type: 'button', class: 'btn', onclick: () => createChapter(bookId) }, '+ New Chapter');
  }

  function emptyState(bookId) {
    return el('div', { class: 'empty' },
      el('p', { class: 'empty-title' }, 'No chapters yet.'),
      el('p', { class: 'empty-text' }, 'Create your first chapter.'),
      newChapterButton(bookId));
  }

  function chapterList(bookId, chapters) {
    return el('ol', { class: 'chapter-list', 'aria-label': 'Chapters' },
      chapters.map((chapter, index) => chapterRow(bookId, chapter, index, chapters.length)));
  }

  function chapterRow(bookId, chapter, index, total) {
    const href = `#/book/${encodeURIComponent(bookId)}/chapter/${encodeURIComponent(chapter.id)}`;
    const menu = UI.menuButton(`Options for ${chapter.title}`, [
      { label: 'Open', action: () => App.go(href) },
      { label: 'Rename', action: () => renameChapter(bookId, chapter.id) },
      { label: 'Move up', action: () => moveChapter(bookId, chapter.id, -1), disabled: index === 0 },
      { label: 'Move down', action: () => moveChapter(bookId, chapter.id, 1), disabled: index === total - 1 },
      { label: 'Delete', action: () => deleteChapter(bookId, chapter.id), danger: true },
    ]);
    menu.dataset.chapterMenu = chapter.id;
    return el('li', { class: 'chapter-row' },
      el('a', { class: 'chapter-link', href },
        el('span', { class: 'chapter-num', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
        el('span', { class: 'chapter-title' }, chapter.title)),
      menu);
  }

  /* ---------- Actions ---------- */

  async function createChapter(bookId) {
    const title = await UI.promptDialog({
      title: 'New Chapter', label: 'Chapter Title', confirmLabel: 'Create Chapter',
    });
    if (!title) return;
    const chapter = Store.createChapter(bookId, title);
    UI.showStorageNotice();
    if (chapter) {
      App.go(`#/book/${encodeURIComponent(bookId)}/chapter/${encodeURIComponent(chapter.id)}`, { focusEditor: true });
    }
  }

  async function renameChapter(bookId, chapterId) {
    const chapter = Store.getChapter(bookId, chapterId);
    if (!chapter) return;
    const title = await UI.promptDialog({
      title: 'Rename Chapter', label: 'Chapter Title', value: chapter.title, confirmLabel: 'Save',
    });
    if (!title || title === chapter.title) return;
    Store.updateChapter(bookId, chapterId, { title });
    App.refresh();
  }

  function moveChapter(bookId, chapterId, direction) {
    Store.moveChapter(bookId, chapterId, direction);
    App.refresh();
    const button = document.querySelector(`[data-chapter-menu="${CSS.escape(chapterId)}"]`);
    if (button) button.focus();
  }

  async function deleteChapter(bookId, chapterId) {
    const chapter = Store.getChapter(bookId, chapterId);
    if (!chapter) return;
    const confirmed = await UI.confirmDialog({
      title: 'Delete this chapter?',
      message: `“${chapter.title}” will be deleted. This cannot be undone.`,
    });
    if (!confirmed) return;
    Store.deleteChapter(bookId, chapterId);
    App.refresh();
  }

  return { render };
})();
