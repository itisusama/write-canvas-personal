/*
 * Write Canvas — the home screen: your books.
 */
const BooksView = (() => {
  const { el } = UI;

  function render(root) {
    const books = Store.getBooks();
    root.append(el('div', { class: 'page' },
      el('header', { class: 'brand' },
        el('h1', { class: 'brand-name', tabindex: '-1' }, 'Write Canvas'),
        el('p', { class: 'brand-by' }, 'by Usama Hassan')),
      el('section', { class: 'shelf', 'aria-labelledby': 'shelf-heading' },
        el('div', { class: 'section-head' },
          el('h2', { id: 'shelf-heading', class: 'section-title' }, 'My Books'),
          books.length ? newBookButton() : null),
        books.length ? bookList(books) : emptyState())));
  }

  function newBookButton() {
    return el('button', { type: 'button', class: 'btn', onclick: createBook }, '+ New Book');
  }

  function emptyState() {
    return el('div', { class: 'empty' },
      el('p', { class: 'empty-title' }, 'Your canvas is empty.'),
      el('p', { class: 'empty-text' }, 'Create your first book and start writing.'),
      newBookButton());
  }

  function bookList(books) {
    return el('ul', { class: 'book-list' }, books.map(bookRow));
  }

  function bookRow(book) {
    const href = `#/book/${encodeURIComponent(book.id)}`;
    return el('li', { class: 'book-row' },
      el('a', { class: 'book-link', href },
        el('span', { class: 'book-title' }, book.title),
        el('span', { class: 'book-meta' },
          `${UI.plural(book.chapters.length, 'chapter')} · ${UI.lastEdited(book.updatedAt)}`)),
      el('div', { class: 'row-actions' },
        el('a', { class: 'text-btn', href, tabindex: '-1' }, 'Open'),
        UI.menuButton(`Options for ${book.title}`, [
          { label: 'Rename', action: () => renameBook(book.id) },
          { label: 'Delete', action: () => deleteBook(book.id), danger: true },
        ])));
  }

  /* ---------- Actions ---------- */

  async function createBook() {
    const title = await UI.promptDialog({
      title: 'Create New Book', label: 'Book Title', confirmLabel: 'Create Book',
    });
    if (!title) return;
    const book = Store.createBook(title);
    UI.showStorageNotice();
    if (book) App.go(`#/book/${encodeURIComponent(book.id)}`);
  }

  async function renameBook(id) {
    const book = Store.getBook(id);
    if (!book) return;
    const title = await UI.promptDialog({
      title: 'Rename Book', label: 'Book Title', value: book.title, confirmLabel: 'Save',
    });
    if (!title || title === book.title) return;
    Store.updateBook(id, { title });
    App.refresh();
  }

  async function deleteBook(id) {
    const book = Store.getBook(id);
    if (!book) return;
    const confirmed = await UI.confirmDialog({
      title: 'Delete this book?',
      message: `“${book.title}” and all of its chapters will be permanently deleted.`,
    });
    if (!confirmed) return;
    Store.deleteBook(id);
    App.refresh();
  }

  return { render, createBook };
})();
