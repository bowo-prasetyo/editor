# editor

A minimal, client-only text editor that runs entirely in the browser. Built with Vue 3, Vue Router and Vite.

- No server: documents are stored in your browser's `localStorage`, one entry per document. Saving happens shortly after you stop typing; the status bar shows *Saving… / Saved / Not saved*, and a banner offers a download if the browser's storage is full.
- Safe across tabs: documents created or edited in another tab show up live; if two tabs change the same document, the other tab's version is kept as a copy.
- Routes: `#/` lists documents, `#/edit/:id` edits one. Hash routing means no server rewrites are needed.
- Open local files, download a document (or press Ctrl/Cmd+S), line numbers, cursor position and word count.
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
