# editor

A minimal, client-only text editor that runs entirely in the browser. Built with Vue 3, Vue Router and Vite.

- No server: documents are stored in your browser's `localStorage`.
- Routes: `#/` lists documents, `#/edit/:id` edits one. Hash routing means no server rewrites are needed.
- Open local files, download a document (or press Ctrl/Cmd+S), line numbers, cursor position and word count.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The `dist/` folder is plain static files. Host it anywhere (GitHub Pages, Netlify, S3), or serve it locally with `npm run preview`.
