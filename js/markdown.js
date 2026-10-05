/*
 * Write Canvas — a small Markdown renderer for the manuscript preview.
 *
 * Covers what prose needs: headings, paragraphs, emphasis, lists,
 * blockquotes, links, horizontal rules and code. All text is HTML-escaped;
 * raw HTML in the source is shown as text, never executed.
 */
const Markdown = (() => {
  const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)[^`]*$/;
  const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const QUOTE_RE = /^ {0,3}> ?/;
  const LIST_RE = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)/;

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const isBlank = (line) => /^\s*$/.test(line);
  const indentOf = (line) => line.match(/^ */)[0].length;
  const isOrdered = (marker) => /\d/.test(marker);

  // Lines that end a paragraph without a blank line before them.
  function interruptsParagraph(line) {
    if (FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line)) {
      return true;
    }
    const m = line.match(LIST_RE);
    return Boolean(m) && m[3] !== '' && (!isOrdered(m[2]) || parseInt(m[2], 10) === 1);
  }

  /* ---------- Blocks ---------- */

  function render(source) {
    const lines = String(source || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '    ')
      .split('\n');
    return renderBlocks(lines, false);
  }

  // tight: paragraphs are emitted without <p> (inside tight list items).
  function renderBlocks(lines, tight) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (isBlank(line)) {
        i += 1;
      } else if ((m = line.match(FENCE_RE))) {
        i = fencedCode(lines, i, m, out);
      } else if ((m = line.match(HEADING_RE))) {
        const level = m[1].length;
        out.push(`<h${level}>${inline(m[2] || '')}</h${level}>`);
        i += 1;
      } else if (HR_RE.test(line)) {
        out.push('<hr>');
        i += 1;
      } else if (QUOTE_RE.test(line)) {
        i = blockquote(lines, i, out);
      } else if (LIST_RE.test(line)) {
        i = list(lines, i, out);
      } else {
        i = paragraph(lines, i, out, tight);
      }
    }
    return out.join('\n');
  }

  function fencedCode(lines, start, match, out) {
    const fence = match[1];
    const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
    const body = [];
    let i = start + 1;
    while (i < lines.length && !closing.test(lines[i])) {
      body.push(lines[i]);
      i += 1;
    }
    const lang = match[2] ? ` class="language-${escapeHtml(match[2])}"` : '';
    out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}</code></pre>`);
    return i + 1;
  }

  function blockquote(lines, start, out) {
    const inner = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      const previous = inner[inner.length - 1];
      if (QUOTE_RE.test(line)) {
        inner.push(line.replace(QUOTE_RE, ''));
      } else if (!isBlank(line) && previous && !isBlank(previous) && !interruptsParagraph(line)) {
        inner.push(line); // lazy continuation of a quoted paragraph
      } else {
        break;
      }
      i += 1;
    }
    out.push(`<blockquote>\n${renderBlocks(inner, false)}\n</blockquote>`);
    return i;
  }

  function list(lines, start, out) {
    const first = lines[start].match(LIST_RE);
    const ordered = isOrdered(first[2]);
    const items = [];
    let current = null;
    let contentIndent = 0;
    let loose = false;
    let i = start;

    const startsSibling = (line) => {
      const m = line.match(LIST_RE);
      return Boolean(m) && indentOf(line) < contentIndent && isOrdered(m[2]) === ordered;
    };

    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(LIST_RE);

      if (m && (current === null || indentOf(line) < contentIndent)) {
        if (isOrdered(m[2]) !== ordered) break;
        current = [line.slice(m[0].length)];
        contentIndent = m[3] === '' ? m[0].length + 1 : m[0].length;
        items.push(current);
      } else if (isBlank(line)) {
        let next = i + 1;
        while (next < lines.length && isBlank(lines[next])) next += 1;
        const continues = next < lines.length
          && (indentOf(lines[next]) >= contentIndent || startsSibling(lines[next]));
        if (!continues) break;
        loose = true;
        current.push('');
      } else if (indentOf(line) >= contentIndent) {
        current.push(line.slice(contentIndent));
      } else if (!isBlank(current[current.length - 1]) && !interruptsParagraph(line)) {
        current.push(line.trimStart()); // lazy continuation
      } else {
        break;
      }
      i += 1;
    }

    const tag = ordered ? 'ol' : 'ul';
    const startNumber = ordered ? parseInt(first[2], 10) : 1;
    const startAttr = ordered && startNumber !== 1 ? ` start="${startNumber}"` : '';
    const body = items.map((item) => `<li>${renderBlocks(item, !loose)}</li>`).join('\n');
    out.push(`<${tag}${startAttr}>\n${body}\n</${tag}>`);
    return i;
  }

  function paragraph(lines, start, out, tight) {
    const buffer = [lines[start]];
    let i = start + 1;
    while (i < lines.length && !isBlank(lines[i]) && !interruptsParagraph(lines[i])) {
      buffer.push(lines[i]);
      i += 1;
    }
    const text = buffer.map((l) => l.trimStart()).join('\n').trimEnd();
    const html = inline(text);
    out.push(tight ? html : `<p>${html}</p>`);
    return i;
  }

  /* ---------- Inline ---------- */

  function safeUrl(url) {
    if (/^(https?:|mailto:)/i.test(url)) return url;
    if (/^www\./i.test(url)) return `https://${url}`;
    return null;
  }

  function inline(text) {
    const slots = [];
    const stash = (html) => `\u0000${slots.push(html) - 1}\u0000`;
    let s = text.replace(/\u0000/g, '');

    // Code spans first, so nothing inside them is formatted.
    s = s.replace(/(`+)([\s\S]+?)\1(?!`)/g, (_, ticks, code) =>
      stash(`<code>${escapeHtml(code.replace(/^ ([\s\S]*\S[\s\S]*) $/, '$1'))}</code>`));

    // Backslash escapes: \* shows a literal asterisk.
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_, ch) => stash(escapeHtml(ch)));

    s = escapeHtml(s);

    // Hard line breaks: two trailing spaces or a trailing backslash.
    s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n');

    s = s.replace(/\[([^\]]+)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (match, label, url, title) => {
      const href = safeUrl(url);
      if (!href) return label;
      const titleAttr = title ? ` title="${title}"` : '';
      return stash(`<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">`)
        + label + stash('</a>');
    });

    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>');
    s = s.replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>');
    s = s.replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');

    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
  }

  return { render };
})();
