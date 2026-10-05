/*
 * Write Canvas — shared UI helpers: element builder, dialogs, the small
 * context menu, date wording and the storage notice.
 */
const UI = (() => {
  /* ---------- DOM ---------- */

  // Children are appended as text nodes, so user titles are never parsed as HTML.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'class') node.className = value;
      else if (key === 'value') node.value = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  }

  /* ---------- Words and dates ---------- */

  function plural(count, word) {
    return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function lastEdited(iso) {
    const date = new Date(iso);
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
    if (days <= 0) return 'Last edited today';
    if (days === 1) return 'Last edited yesterday';
    if (days < 7) return `Last edited ${days} days ago`;
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const formatted = date.toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: sameYear ? undefined : 'numeric',
    });
    return `Last edited ${formatted}`;
  }

  function savedAgo(timestamp) {
    const seconds = (Date.now() - timestamp) / 1000;
    if (seconds < 45) return 'Saved just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Saved ${minutes} min ago`;
    const time = new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `Saved at ${time}`;
  }

  /* ---------- Dialogs ---------- */

  let dialogCount = 0;

  function openDialog(build) {
    return new Promise((resolve) => {
      const returnFocus = document.activeElement;
      const titleId = `dialog-title-${++dialogCount}`;
      const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': titleId });
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
        resolve(value);
      };

      build(dialog, finish, titleId);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(null); });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      });
      // A click on the dialog element itself (not its body) is the backdrop.
      dialog.addEventListener('mousedown', (event) => { if (event.target === dialog) finish(null); });

      closeMenu();
      document.body.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  }

  function promptDialog({ title, label, value = '', confirmLabel }) {
    return openDialog((dialog, finish, titleId) => {
      const inputId = `${titleId}-input`;
      const input = el('input', {
        id: inputId, type: 'text', class: 'field-input', value,
        maxlength: '200', autocomplete: 'off', spellcheck: 'true',
      });
      const error = el('p', { class: 'field-error', 'aria-live': 'polite' });
      const form = el('form', { class: 'dialog-body', novalidate: true },
        el('h2', { id: titleId, class: 'dialog-title' }, title),
        el('label', { class: 'field-label', for: inputId }, label),
        input,
        error,
        el('div', { class: 'dialog-actions' },
          el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => finish(null) }, 'Cancel'),
          el('button', { type: 'submit', class: 'btn btn-primary' }, confirmLabel)));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = input.value.replace(/\s+/g, ' ').trim();
        if (!text) {
          error.textContent = 'Please enter a title.';
          input.focus();
          return;
        }
        finish(text);
      });
      input.addEventListener('input', () => { error.textContent = ''; });
      // Plain Enter submits; Ctrl/Cmd+Enter does nothing here.
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.preventDefault();
      });

      dialog.append(form);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    });
  }

  function confirmDialog({ title, message, confirmLabel = 'Delete' }) {
    return openDialog((dialog, finish, titleId) => {
      // Cancel holds focus, so a stray Enter never deletes anything.
      const cancel = el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => finish(false) }, 'Cancel');
      dialog.setAttribute('role', 'alertdialog');
      dialog.append(el('div', { class: 'dialog-body' },
        el('h2', { id: titleId, class: 'dialog-title' }, title),
        el('p', { class: 'dialog-message' }, message),
        el('div', { class: 'dialog-actions' },
          cancel,
          el('button', { type: 'button', class: 'btn btn-danger', onclick: () => finish(true) }, confirmLabel))));
      requestAnimationFrame(() => cancel.focus());
    }).then((answer) => answer === true);
  }

  /* ---------- Context menu ---------- */

  let activeMenu = null;

  function onOutsidePointer(event) {
    if (!activeMenu) return;
    const { menu, anchor } = activeMenu;
    if (!menu.contains(event.target) && !anchor.contains(event.target)) closeMenu();
  }

  function onMenuKey(event) {
    const items = [...activeMenu.menu.querySelectorAll('.menu-item:not([disabled])')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    } else if (event.key === 'Tab') {
      closeMenu();
    }
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = rect.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  // items: [{ label, action, danger, disabled }]
  function toggleMenu(anchor, items) {
    if (activeMenu && activeMenu.anchor === anchor) {
      closeMenu();
      return;
    }
    closeMenu();
    const menu = el('div', { class: 'menu', role: 'menu' },
      items.map((item) => el('button', {
        type: 'button',
        role: 'menuitem',
        class: `menu-item${item.danger ? ' is-danger' : ''}`,
        disabled: item.disabled,
        onclick: () => { closeMenu(); item.action(); },
      }, item.label)));

    document.body.append(menu);
    positionMenu(menu, anchor);
    anchor.setAttribute('aria-expanded', 'true');
    activeMenu = { menu, anchor };

    menu.addEventListener('keydown', onMenuKey);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    const first = menu.querySelector('.menu-item:not([disabled])');
    if (first) first.focus();
  }

  function closeMenu(returnFocus = false) {
    if (!activeMenu) return;
    const { menu, anchor } = activeMenu;
    activeMenu = null;
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    window.removeEventListener('resize', closeMenu);
    window.removeEventListener('scroll', closeMenu, true);
    if (returnFocus === true) anchor.focus();
  }

  function menuButton(label, items) {
    const button = el('button', {
      type: 'button', class: 'icon-btn', 'aria-label': label,
      'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'More',
    }, '⋯');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu(button, typeof items === 'function' ? items() : items);
    });
    return button;
  }

  /* ---------- Storage notice ---------- */

  function showStorageNotice() {
    const notice = document.getElementById('notice');
    const problem = Store.problem();
    let message = '';
    if (problem && problem.type === 'unavailable') {
      message = 'This browser is not allowing local storage, so your writing will not be kept after you close this page.';
    } else if (problem && problem.type === 'corrupt') {
      message = `Saved data could not be read. A copy was kept safely under “${problem.backupKey}” in this browser’s storage.`;
    } else if (problem && problem.type === 'corrupt-blocked') {
      message = 'Saved data could not be read, and there was no room to back it up. Saving is paused so nothing is overwritten.';
    } else if (!Store.lastWriteOk()) {
      message = 'Your latest changes could not be saved. Browser storage may be full.';
    }
    notice.textContent = message;
    notice.hidden = !message;
  }

  return {
    el,
    plural,
    lastEdited,
    savedAgo,
    promptDialog,
    confirmDialog,
    menuButton,
    closeMenu,
    showStorageNotice,
  };
})();
