# Write Canvas

*by Usama Hassan*

Your books. Your chapters. Your words. Nothing else gets in the way.

Write Canvas is a private, quiet place to write novels. Open the app, choose a book, choose a chapter and write.

## Running it

It's plain HTML, CSS and JavaScript. There's no build step and nothing to install.

- **Simplest:** open `index.html` in a browser.
- **Recommended:** serve the folder so the app can also reopen without a connection:

  ```sh
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

Your writing is stored in this browser's `localStorage`. It stays on this device, in this browser. Clearing the browser's site data also deletes your books.

## Using it

- **Books:** use **+ New Book** to create one. Click a book to open it. The `⋯` menu renames or deletes it. Deleting a book deletes its chapters too, and the app always asks first.
- **Chapters:** use **+ New Chapter** inside a book. The `⋯` menu opens, renames, moves up or down, or deletes a chapter.
- **Writing:** write Markdown in **Write** mode and switch to **Preview** to read it as a manuscript. Saving is automatic, shortly after you stop typing and whenever you leave the chapter. A line of `* * *` or `---` becomes a scene break.

### Keyboard

| Key | Action |
| --- | --- |
| `Ctrl/⌘ + S` | Save now (autosave runs anyway) |
| `Enter` | Confirm a title dialog |
| `Escape` | Close a dialog or menu |
| `↑` / `↓` | Move through an open menu |

In delete dialogs, **Cancel** has the focus, so a stray `Enter` never deletes anything.

## Project structure

```
index.html        page shell
styles.css        all styling
app.js            hash routing and global events (save on leave, Ctrl+S)
sw.js             offline cache (used when served over http/https)
js/
  storage.js      the only code that touches localStorage; all book/chapter CRUD
  markdown.js     small, HTML-escaping Markdown renderer for the preview
  ui.js           element builder, dialogs, context menu, date wording
  books.js        home screen: list, create, rename, delete books
  chapters.js     book workspace: list, create, rename, reorder, delete chapters
  editor.js       Write/Preview editor, autosave, word count
```

Routes: `#/` (books), `#/book/:id` (chapters), `#/book/:id/chapter/:id` (editor).

## Data

Everything lives under one key, `writecanvas_data`:

```json
{
  "version": 1,
  "books": [
    {
      "id": "book-…",
      "title": "The Darkness Between Us",
      "createdAt": "2026-10-05T09:00:00.000Z",
      "updatedAt": "2026-10-05T09:30:00.000Z",
      "chapters": [
        {
          "id": "chapter-…",
          "title": "Prologue",
          "content": "# Prologue\n\n…",
          "order": 1,
          "createdAt": "…",
          "updatedAt": "…"
        }
      ]
    }
  ]
}
```

The app protects your data in these ways:

- **Unreadable data:** if the stored data can't be read, it is copied to `writecanvas_data_backup_<timestamp>` before anything new is written. A notice tells you where the copy is.
- **Missing fields:** they are repaired on load, and chapter text is kept.
- **Failed saves:** if storage is unavailable or full, a notice says so, the editor shows *Not saved*, and the browser asks before you close the page.
- **Two open tabs:** each save re-reads storage first, so the tabs don't overwrite each other's books.
