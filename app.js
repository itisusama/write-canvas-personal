/*
 * Write Canvas — routing and global events.
 *
 *   #/                              books
 *   #/book/:bookId                  a book's chapters
 *   #/book/:bookId/chapter/:id      the editor
 */
const App = (() => {
  const root = document.getElementById('app');
  let pendingOptions = {};

  function parseRoute(hash) {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(safeDecode);
    if (parts[0] === 'book' && parts[1]) {
      if (parts[2] === 'chapter' && parts[3]) {
        return { view: 'editor', bookId: parts[1], chapterId: parts[3] };
      }
      return { view: 'book', bookId: parts[1] };
    }
    return { view: 'books' };
  }

  function safeDecode(part) {
    try {
      return decodeURIComponent(part);
    } catch (err) {
      return part;
    }
  }

  function go(hash, options = {}) {
    pendingOptions = options;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  // Missing books or chapters (deleted, or an old link) fall back one level.
  function resolve(route) {
    if (route.view === 'books') return route;
    const book = Store.getBook(route.bookId);
    if (!book) return null;
    if (route.view === 'editor' && !Store.getChapter(route.bookId, route.chapterId)) {
      location.replace(`#/book/${encodeURIComponent(route.bookId)}`);
      return undefined;
    }
    return route;
  }

  function render() {
    EditorView.leave();
    UI.closeMenu();

    const route = resolve(parseRoute(location.hash));
    if (route === undefined) return;
    if (route === null) {
      location.replace('#/');
      return;
    }

    const options = pendingOptions;
    pendingOptions = {};
    root.replaceChildren();
    document.body.classList.toggle('is-editing', route.view === 'editor');

    if (route.view === 'books') {
      BooksView.render(root);
      document.title = 'Write Canvas';
    } else if (route.view === 'book') {
      ChaptersView.render(root, route.bookId);
      document.title = `${Store.getBook(route.bookId).title} · Write Canvas`;
    } else {
      EditorView.render(root, route.bookId, route.chapterId, options);
      const chapter = Store.getChapter(route.bookId, route.chapterId);
      document.title = `${chapter.title} · Write Canvas`;
    }

    window.scrollTo(0, 0);
    if (route.view !== 'editor') focusHeading();
    UI.showStorageNotice();
  }

  // Move focus to the new page for keyboard and screen-reader users,
  // without disturbing a pointer user.
  function focusHeading() {
    if (!document.activeElement || document.activeElement === document.body || !root.contains(document.activeElement)) {
      const heading = root.querySelector('h1[tabindex="-1"]');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  // Re-render the current list view after a change, keeping the scroll position.
  function refresh() {
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
  }

  function onKeydown(event) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's' && EditorView.isOpen()) {
      event.preventDefault();
      EditorView.flush(true);
    }
  }

  // Another tab changed the data: keep list views current.
  function onStorage(event) {
    if (event.key !== Store.KEY) return;
    Store.refresh();
    if (!EditorView.isOpen()) refresh();
  }

  function start() {
    Store.load();
    window.addEventListener('hashchange', render);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', () => EditorView.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') EditorView.flush();
    });
    window.addEventListener('beforeunload', (event) => {
      if (EditorView.flush()) return;
      // Saving failed: ask before the page closes.
      event.preventDefault();
      event.returnValue = '';
    });
    render();
    registerServiceWorker();
  }

  // Lets the app reopen without a connection once it has been loaded.
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  return { start, go, refresh };
})();

App.start();
