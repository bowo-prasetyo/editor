<p align="center"><img src="docs/logo.svg" alt="Plumb" width="360"></p>

# Plumb

**The private, zero-install editor for the text files on your own computer.**

Open [Plumb](https://bowo-prasetyo.github.io/plumb/) in your browser, open a file
or a folder, edit it, and save it back. There's no account and no server, it
works offline, and your text never leaves your machine. Your file comes back
exactly as it went in, apart from the changes you made.

**Works best in Chrome and Edge.** In Firefox and Safari you get drafts, and
single files that Save downloads as a copy; Plumb tells you what's missing
there.

## Getting started

1. **Open Plumb.** The first visit is all it needs; after that it works offline.
   In Chrome and Edge, *Install* in the header adds it as an app.
2. **Write**, with *New document*, or **open** your own files with
   *Open files…*, *Open folder…*, or by dropping files on the page.
3. **Save** with Ctrl/Cmd+S. In Chrome and Edge it writes straight back to the
   file, and asks first if the file changed on disk meanwhile.
4. **Find anything** with Ctrl/Cmd+P (documents and files) and
   Ctrl/Cmd+Shift+P (every command). Press F1 for all the shortcuts.

## Files and drafts

- **Files** are on your disk. Plumb reads them from disk when you open them and
  keeps no copies. Only your unsaved edits and a version history stay in the
  browser. Files you open on their own are listed in *Recent files*.
- **Drafts** are text that isn't a file yet: notes, pasted text, new
  documents. They're kept in your browser and are Markdown by default. Pin
  them, filter them, or turn one into a file with *Save to folder…*.
- **Closing a folder never loses unsaved edits.** Plumb asks you to save them or
  keep them as drafts, and offers to put them back when you open the folder
  again.

## What you can do

- **Write Markdown:** preview, bold and italic, lists that continue, pasting
  links, and jumping to headings.
- **Edit code:** highlighting for 140+ languages, multiple cursors, folding, and
  checking for JSON and YAML. It follows your project's `.editorconfig`, and
  Vim keys are available if you want them.
- **Search and replace** across drafts and whole folders, with regular
  expressions.
- **Keep files faithful:** encodings, byte-order marks and line endings are kept
  as they are, mixed line endings included.
- **Follow changes** made to your files by other programs, without ever losing
  unsaved text.
- **Go back in time** with version history, the Trash, and backups.

Everything, with all the details: **[the reference](docs/reference.md)**.

## Privacy and safety

- **No account, server or analytics.** Plumb is a static page; nothing you type
  is sent anywhere.
- **Your text is saved as you type.** It survives a reload, a crash, or the tab
  closing mid-save. Other tabs stay in step.
- **Nothing is overwritten without asking.** That covers a file changed on disk,
  an unsaved edit, and a file in a folder you close.

## More

- [Reference](docs/reference.md): every feature, the shortcuts, and the limits
- [Changelog](CHANGELOG.md): what changed in each version
- [Vision](VISION.md): what Plumb is for, its principles, and what's next
- [Testing](TESTING.md): how Plumb is tested

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test            # unit tests
npm run test:e2e    # end-to-end tests in Chromium (first time: npx playwright install chromium)
npm run lint        # ESLint
```

See [TESTING.md](TESTING.md) for what is tested and how.

## Build

```bash
npm run build
```

The `dist/` folder is plain static files, including `sw.js`, the service worker
that makes Plumb work offline. It's generated at build time by `build/pwa.js`
with the list of built files, and only runs in production builds (not in
`npm run dev`). Serve the folder over HTTPS (or `localhost`) for offline support
and installing. Host it anywhere (GitHub Pages, Netlify, S3), or serve it
locally with `npm run preview`.
