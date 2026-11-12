# editor

A minimal, client-only text editor that runs entirely in the browser. Built with Vue 3, Vue Router and Vite.

- No server: documents are stored in your browser, in IndexedDB (hundreds of MB; falls back to `localStorage`, about 5 MB, where IndexedDB isn't available). Documents from earlier versions, which used `localStorage`, are moved over automatically. Saving happens shortly after you stop typing; the status bar shows *Saving… / Saved / Not saved*. If the page closes mid-save, a rescue copy is recovered on the next visit. The document list shows how much space is used, and the app asks the browser to keep its storage when you create or open a document.
- Safe across tabs: documents created or edited in another tab show up live; if two tabs change the same document, the other tab's version is kept as a copy.
- Routes: `#/` lists documents, `#/edit/:id` edits one. Hash routing means no server rewrites are needed.
- Open files (several at once, or drop them anywhere on the page). In Chrome and Edge, **Save (Ctrl/Cmd+S) writes back to the file you opened**, even after a reload, and warns you if the file was changed on disk in the meantime; **Save as… (Ctrl/Cmd+Shift+S)** picks another file. Other browsers download a copy instead. The encoding (UTF-8, UTF-16, Windows-1252), byte-order mark and line endings (LF, CRLF, CR) are detected on open and kept on save; change them in the status bar. Binary files are refused.
- New documents are named after their first line until you rename them. Filter the document list by name or text.
- Export all documents (Trash included) as one backup file, and import it again; importing never overwrites existing documents.
- Markdown preview for `.md` files (side by side on wide screens), adjustable text size, and printing of the whole document.
- Built on [CodeMirror 6](https://codemirror.net/): only the visible lines are drawn, so files of several MB stay quick to type in. Line numbers (also with word wrap), cursor position, selection and word count. Word counts for very large documents update when you pause, and spell check is off by default above 200,000 characters.
- Find and replace (Ctrl/Cmd+F, Ctrl/Cmd+H) with match case and whole word; replacements can be undone.
- Word wrap (Alt+Z) and spell check, per document. Both are on by default for prose (`.txt`, `.md`, no extension) and off for code.
- Deleted documents go to the Trash, with an Undo prompt; restore them or delete them forever. The Trash is emptied after 30 days.

## Keyboard shortcuts

Ctrl means Cmd on a Mac.

| Keys | What it does |
|---|---|
| Enter | New line, indented like the current one (tabs stay tabs) |
| Tab / Shift+Tab | Indent at the cursor, or indent / outdent the selected lines |
| Ctrl+/ | Comment or uncomment the lines, in the file type's syntax (`//`, `#`, `--`, `<!-- -->`…) |
| Alt+↑ / Alt+↓ | Move the line(s) up or down |
| Shift+Alt+↑ / Shift+Alt+↓ | Duplicate the line(s) above or below |
| Ctrl+Shift+K | Delete the line(s) |
| Ctrl+D | Select the next occurrence of the selection (add a cursor there) |
| Ctrl+Shift+L | Select every occurrence of the selection |
| Ctrl+Alt+↑ / Ctrl+Alt+↓ | Add a cursor on the line above or below |
| Ctrl+click / Alt+drag | Add a cursor / select a rectangular block |
| Escape | Back to a single cursor |
| Ctrl+G | Go to a line, or `line:column` (or click the position in the status bar) |
| Ctrl+[ / Ctrl+] | Outdent / indent the lines |
| Ctrl+F / Ctrl+H | Find / find and replace (every match is highlighted) |
| Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) | Undo / redo |
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Alt+Z | Word wrap on or off |

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

The `dist/` folder is plain static files. Host it anywhere (GitHub Pages, Netlify, S3), or serve it locally with `npm run preview`.
