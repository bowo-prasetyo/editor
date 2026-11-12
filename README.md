# editor

A minimal, client-only text editor that runs entirely in the browser. Built with Vue 3, Vue Router and Vite.

- No server: documents are stored in your browser, in IndexedDB (hundreds of MB; falls back to `localStorage`, about 5 MB, where IndexedDB isn't available). Documents from earlier versions, which used `localStorage`, are moved over automatically. Saving happens shortly after you stop typing; the status bar shows *Saving… / Saved / Not saved*. If the page closes mid-save, a rescue copy is recovered on the next visit. The document list shows how much space is used, and the app asks the browser to keep its storage when you create or open a document.
- Safe across tabs: documents created or edited in another tab show up live; if two tabs change the same document, the other tab's version is kept as a copy.
- Routes: `#/` lists documents, `#/edit/:id` edits one. Hash routing means no server rewrites are needed.
- Open files (several at once, or drop them anywhere on the page). In Chrome and Edge, **Save (Ctrl/Cmd+S) writes back to the file you opened**, even after a reload, and warns you if the file was changed on disk in the meantime; **Save as… (Ctrl/Cmd+Shift+S)** picks another file. Other browsers download a copy instead. The encoding (UTF-8, UTF-16, Windows-1252), byte-order mark and line endings (LF, CRLF, CR) are detected on open and kept on save; change them in the status bar. Binary files are refused.
- New documents are named after their first line until you rename them. Filter the document list by name or text.
- Export all documents (Trash included) as one backup file, and import it again; importing never overwrites existing documents.
- Markdown preview for `.md` files (side by side on wide screens), adjustable text size, and printing of the whole document.
- Line numbers, cursor position and word count, kept fast on large files (only the visible line numbers are drawn; word counts for very large documents update when you pause). Spell check is off by default above 200,000 characters.
- Tab / Shift+Tab indent and outdent the selected lines; Ctrl/Cmd+Z undoes them.
- Find and replace (Ctrl/Cmd+F, Ctrl/Cmd+H) with match case and whole word; replacements can be undone.
- Word wrap (Alt+Z) and spell check, per document. Both are on by default for prose (`.txt`, `.md`, no extension) and off for code. Line numbers are hidden while wrapping.
- Deleted documents go to the Trash, with an Undo prompt; restore them or delete them forever. The Trash is emptied after 30 days.

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
