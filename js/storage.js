/*
 * Write Canvas — storage layer.
 *
 * Every book and chapter lives in one localStorage entry. Each write first
 * re-reads the stored copy, so a second open tab doesn't overwrite changes
 * made in the first.
 */
const Store = (() => {
  const KEY = 'writecanvas_data';
  const VERSION = 1;
  const MAX_TITLE = 200;

  let data = emptyData();
  let available = true;
  let writesBlocked = false;
  let lastWriteOk = true;
  let problem = null;

  function emptyData() {
    return { version: VERSION, books: [] };
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function newId(prefix) {
    const random = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return `${prefix}-${random}`;
  }

  function cleanTitle(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  }

  /* ---------- Reading and validating stored data ---------- */

  function validDate(value, fallback) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
  }

  function uniqueId(value, prefix, seen) {
    let id = typeof value === 'string' && value ? value : newId(prefix);
    if (seen.has(id)) id = newId(prefix);
    seen.add(id);
    return id;
  }

  function sanitizeChapter(raw, index, seen, now) {
    const createdAt = validDate(raw.createdAt, now);
    return {
      id: uniqueId(raw.id, 'chapter', seen),
      title: cleanTitle(raw.title) || 'Untitled chapter',
      content: raw.content == null ? '' : String(raw.content),
      order: Number.isFinite(raw.order) ? raw.order : index + 1,
      createdAt,
      updatedAt: validDate(raw.updatedAt, createdAt),
    };
  }

  function sanitizeBook(raw, seen, now) {
    const createdAt = validDate(raw.createdAt, now);
    const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => sanitizeChapter(c, i, seen, now));
    normalizeOrder(chapters);
    return {
      id: uniqueId(raw.id, 'book', seen),
      title: cleanTitle(raw.title) || 'Untitled book',
      createdAt,
      updatedAt: validDate(raw.updatedAt, createdAt),
      chapters,
    };
  }

  // Repairs what it can (missing fields, duplicate ids) and keeps all text.
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.books)) {
      throw new Error('Stored data has an unexpected shape');
    }
    const now = nowISO();
    const seen = new Set();
    const books = raw.books
      .filter((b) => b && typeof b === 'object')
      .map((b) => sanitizeBook(b, seen, now));
    return { version: VERSION, books };
  }

  function readStored() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return emptyData();
    return sanitize(JSON.parse(raw));
  }

  function storageWorks() {
    try {
      const probe = '__writecanvas_probe__';
      localStorage.setItem(probe, probe);
      localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  function load() {
    available = storageWorks();
    if (!available) {
      problem = { type: 'unavailable' };
      return;
    }
    try {
      data = readStored();
    } catch (err) {
      backUpUnreadable();
    }
  }

  // Never overwrite data we couldn't read: copy it aside first.
  function backUpUnreadable() {
    data = emptyData();
    try {
      const backupKey = `${KEY}_backup_${Date.now()}`;
      localStorage.setItem(backupKey, localStorage.getItem(KEY));
      problem = { type: 'corrupt', backupKey };
    } catch (err) {
      writesBlocked = true;
      problem = { type: 'corrupt-blocked' };
    }
  }

  /* ---------- Writing ---------- */

  function canWrite() {
    return available && !writesBlocked;
  }

  function refresh() {
    if (!canWrite()) return;
    try {
      data = readStored();
    } catch (err) {
      // Keep the in-memory copy; the next write repairs storage.
    }
  }

  function write() {
    if (!canWrite()) {
      lastWriteOk = false;
      return false;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      lastWriteOk = true;
    } catch (err) {
      lastWriteOk = false;
    }
    return lastWriteOk;
  }

  function mutate(change) {
    refresh();
    const result = change(data);
    if (result !== null && result !== undefined) write();
    return result;
  }

  /* ---------- Books ---------- */

  function findBook(source, id) {
    return source.books.find((b) => b.id === id) || null;
  }

  function getBooks() {
    return [...data.books].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function getBook(id) {
    return findBook(data, id);
  }

  function createBook(title) {
    const clean = cleanTitle(title);
    if (!clean) return null;
    return mutate((d) => {
      const now = nowISO();
      const book = { id: newId('book'), title: clean, createdAt: now, updatedAt: now, chapters: [] };
      d.books.push(book);
      return book;
    });
  }

  function updateBook(id, changes) {
    const title = cleanTitle(changes.title);
    if (!title) return null;
    return mutate((d) => {
      const book = findBook(d, id);
      if (!book) return null;
      book.title = title;
      book.updatedAt = nowISO();
      return book;
    });
  }

  function deleteBook(id) {
    return mutate((d) => {
      const index = d.books.findIndex((b) => b.id === id);
      if (index === -1) return null;
      return d.books.splice(index, 1)[0];
    });
  }

  /* ---------- Chapters ---------- */

  function normalizeOrder(chapters) {
    chapters.sort((a, b) => a.order - b.order);
    chapters.forEach((c, i) => { c.order = i + 1; });
  }

  function findChapter(book, id) {
    return book ? book.chapters.find((c) => c.id === id) || null : null;
  }

  function getChapters(bookId) {
    const book = getBook(bookId);
    return book ? [...book.chapters].sort((a, b) => a.order - b.order) : [];
  }

  function getChapter(bookId, chapterId) {
    return findChapter(getBook(bookId), chapterId);
  }

  function createChapter(bookId, title) {
    const clean = cleanTitle(title);
    if (!clean) return null;
    return mutate((d) => {
      const book = findBook(d, bookId);
      if (!book) return null;
      const now = nowISO();
      const chapter = {
        id: newId('chapter'),
        title: clean,
        content: '',
        order: book.chapters.length + 1,
        createdAt: now,
        updatedAt: now,
      };
      book.chapters.push(chapter);
      book.updatedAt = now;
      return chapter;
    });
  }

  // changes: { title } and/or { content }
  function updateChapter(bookId, chapterId, changes) {
    let title;
    if ('title' in changes) {
      title = cleanTitle(changes.title);
      if (!title) return null;
    }
    return mutate((d) => {
      const book = findBook(d, bookId);
      const chapter = findChapter(book, chapterId);
      if (!chapter) return null;
      if (title) chapter.title = title;
      if (typeof changes.content === 'string') chapter.content = changes.content;
      chapter.updatedAt = book.updatedAt = nowISO();
      return chapter;
    });
  }

  function deleteChapter(bookId, chapterId) {
    return mutate((d) => {
      const book = findBook(d, bookId);
      if (!book) return null;
      const index = book.chapters.findIndex((c) => c.id === chapterId);
      if (index === -1) return null;
      const [removed] = book.chapters.splice(index, 1);
      normalizeOrder(book.chapters);
      book.updatedAt = nowISO();
      return removed;
    });
  }

  // direction: -1 moves the chapter up, +1 moves it down.
  function moveChapter(bookId, chapterId, direction) {
    return mutate((d) => {
      const book = findBook(d, bookId);
      if (!book) return null;
      normalizeOrder(book.chapters);
      const index = book.chapters.findIndex((c) => c.id === chapterId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= book.chapters.length) return null;
      book.chapters[index].order = target + 1;
      book.chapters[target].order = index + 1;
      normalizeOrder(book.chapters);
      book.updatedAt = nowISO();
      return book.chapters[target];
    });
  }

  return {
    KEY,
    load,
    refresh,
    problem: () => problem,
    lastWriteOk: () => lastWriteOk,
    getBooks,
    getBook,
    createBook,
    updateBook,
    deleteBook,
    getChapters,
    getChapter,
    createChapter,
    updateChapter,
    deleteChapter,
    moveChapter,
  };
})();
