# editor

A minimal, client-only text editor that runs entirely in the browser. Built with Vue 3, Vue Router and Vite.

- No server: documents are stored in your browser, in IndexedDB (hundreds of MB; falls back to `localStorage`, about 5 MB, where IndexedDB isn't available). Documents from earlier versions, which used `localStorage`, are moved over automatically. Saving happens shortly after you stop typing; the status bar shows *Saving… / Saved / Not saved*. If the page closes mid-save, a rescue copy is recovered on the next visit. The document list shows how much space is used, and the app asks the browser to keep its storage when you create or open a document.
- Safe across tabs: documents created or edited in another tab show up live; if two tabs change the same document, the other tab's version is kept as a copy.
- Routes: `#/` lists documents, `#/edit/:id` edits one. Hash routing means no server rewrites are needed.
- Open files (several at once, or drop them anywhere on the page). In Chrome and Edge, **Save (Ctrl/Cmd+S) writes back to the file you opened**, even after a reload, and warns you if the file was changed on disk in the meantime; **Save as… (Ctrl/Cmd+Shift+S)** picks another file. Other browsers download a copy instead. The encoding (UTF-8, UTF-16, Windows-1252), byte-order mark and line endings (LF, CRLF, CR) are detected on open and kept on save; change them in the status bar. Binary files are refused.
- New documents are named after their first line until you rename them. Filter the document list by name or text.
- **Open a folder** (Chrome and Edge: *Open folder…* in the document list, or the command palette). Its files show in a sidebar tree (Ctrl/Cmd+B shows or hides it); folders are read only when you expand them, so big projects stay quick. Click a file, or use the arrow keys and Enter, to open it: it becomes a document linked to the file, so **Save writes back to it**, with the same check for changes made on disk meanwhile. Opening a file again shows the same document, reloaded from disk if the file changed and you have no unsaved edits. Files with changes not yet saved to disk are marked with a dot. Create files and folders with *+ File* and *+ Folder* (never replacing one that exists); ↻ reads the folder again. Documents opened from a folder are filed under its name and path (e.g. `my-app/src`), so the quick switcher finds them by path. After a reload the browser asks once for permission to use the folder again (*Allow access*). Closing a folder keeps its documents.
- **Search everywhere** (Ctrl/Cmd+Shift+F, or *Search* in the header): every document and every file in your open folders, with match case, whole word and regular expressions. Narrow it with *files to include* (`*.js, src/`; `!` excludes, e.g. `!*.min.js`; `src/**/*.vue` also works) and, with folders open, choose *Everything*, *Documents* or *Open folders*. Results are grouped by file with a preview of each line; click one to open the file with the match selected. Starting a search with text selected in the editor searches for it. Folder files over 2 MB, binary files, and tool and build folders (`.git`, `node_modules`, `dist`, `build`…) are skipped; results stop at 10,000.
- **Replace across files**: replace every result, or the results in one file. Replacing changes documents only, never files on disk directly: each changed file keeps a version from before the replace (undo it from *History*) and shows as not saved to disk. **Save all** (Ctrl/Cmd+Alt+S, the button on the search page, or the command palette) then writes every changed file, asking before replacing a file that changed on disk.
- **Tabs** for the documents you open (remembered in this browser). Switching tabs keeps each document's undo history, cursor and scroll position. Close a tab with × or a middle-click; Alt+PageUp / Alt+PageDown move between tabs.
- **Quick switcher** (Ctrl/Cmd+P, or *Go to…* in the header): type part of a document's name or folder — with folders open, also any file in them, opened or not (tool and build folders such as `node_modules` are left out, up to 20,000 files per folder) (letters in order, e.g. `wcl` finds `Work/Clients/…`). With nothing typed it lists recently opened documents. If nothing matches, it offers to create the document, e.g. `Work/todo.md` creates `todo.md` in the Work folder.
- **Folders**, nested with `/` (e.g. `Work/Clients`). The sidebar shows each folder with how many documents it holds; pick one to see its documents and subfolders. Create, rename and remove folders (removing one never deletes documents: they move up a level). Move a document with its 📁 button, the folder button in the editor, or by dragging it onto a folder. New documents and opened or dropped files go into the folder shown.
- **Sort** the list by last edited, name, date created or size.
- **Version history** (*History* in the editor): a version is kept when you open a file, every few minutes while you edit (if the text changed), each time you save to a file, before you restore an older version, and whenever you press *Save version…* (optionally with a name). Pick a version to see what changed since then, restore it (undoable, and the text it replaces is kept as a version), or open it as a copy. Older automatic versions thin out: all from the last hour, then one per hour for a day and one per day for 30 days; named and saved-to-file versions are kept longer. Deleting a document forever deletes its history.
- **Indentation**, per document: tabs or spaces, 2, 4 or 8 wide, detected from the file (defaults: 4 spaces for Python and similar, tabs for Go and Makefiles, 2 spaces otherwise). Change it, or convert the whole file between tabs and spaces, from the menu in the status bar. In code, Enter indents by the language's rules (a level deeper after `{`, `(` or `:`); in plain text and Markdown it keeps the current line's indentation.
- **Command palette** (Ctrl/Cmd+Shift+P, or type `>` in the quick switcher): run any action by name, from Find and Go to line to Convert indentation, Close tab or Export backup, with its shortcut shown alongside.
- **Keyboard shortcuts panel** (F1, `?`, or the `?` button in the header): every shortcut, grouped and searchable, with ⌘/⌥ symbols on a Mac.
- **Works offline and installs as an app.** After the first visit, the whole editor (every language included) is kept by a service worker, so it opens and works without a connection. In Chrome and Edge an *Install* button appears in the header; installed, the editor can open text files from your computer (*Open with*), and Save writes back to them. When a new version is published, a prompt offers to reload into it.
- Export all documents (Trash included) as one backup file, and import it again; importing never overwrites existing documents.
- Markdown preview for `.md` files (side by side on wide screens), adjustable text size, and printing of the whole document.
- Syntax highlighting for 140+ languages, picked from the file name (`.js`, `.py`, `Dockerfile`, `.yaml`…). Each language is downloaded only when a document needs it. Pick another language, or plain text, in the status bar; the choice is kept per document. Files over 5 million characters start as plain text. Matching brackets are highlighted (mismatched ones in red); Ctrl/Cmd+Shift+\\ jumps to the matching bracket.
- Built on [CodeMirror 6](https://codemirror.net/): only the visible lines are drawn, so files of several MB stay quick to type in. Line numbers (also with word wrap), cursor position, selection and word count. Word counts for very large documents update when you pause, and spell check is off by default above 200,000 characters.
- **Editing helpers for code**: brackets and quotes close themselves, suggestions appear as you type (the language's own, such as keywords, CSS properties and names in scope, plus words from the document), and indentation guides mark each level. In prose nothing closes itself and suggestions come only with Ctrl+Space. Each helper can be turned off in the command palette (*Settings*).
- **Code folding**: fold blocks from the gutter (▾ / ▸), with Ctrl+Shift+[ / ] (Cmd+Alt+[ / ] on a Mac), or fold and unfold everything with Ctrl+Alt+[ / ].
- **Line commands** in the command palette: sort lines (A to Z, Z to A, ignoring case; natural order, so `file2` comes before `file10`), remove duplicate lines, reverse lines, join lines, change case (UPPERCASE, lowercase, Title Case) and trim trailing whitespace. They work on the selected lines, or the whole document when nothing is selected (join and change case work at the cursor). Each is one undoable edit.
- **When saving to a file**, optionally trim trailing whitespace and add a final newline (both off by default; turn them on in the command palette). Markdown keeps its trailing spaces, which mean a line break. Documents in the browser are never changed behind your back: this only happens when writing a file.
- Find and replace (Ctrl/Cmd+F, Ctrl/Cmd+H) with match case, whole word and **regular expressions** (Alt+C, Alt+W, Alt+R). Every match is highlighted; replacements can be undone. In regex mode `^` and `$` match at each line, matches can span lines (`\n`), and the replacement can use `$1`, `$<name>`, `$&`, `$$`, `\n` and `\t`. Up to 100,000 matches are listed; Replace all replaces every one.
- Word wrap (Alt+Z) and spell check, per document. Both are on by default for prose (`.txt`, `.md`, no extension) and off for code.
- Deleted documents go to the Trash, with an Undo prompt; restore them or delete them forever. The Trash is emptied after 30 days.

## Keyboard shortcuts

Ctrl means Cmd on a Mac.

| Keys | What it does |
|---|---|
| Enter | New line: in code, indented by the language's rules; in text, like the current line |
| Tab / Shift+Tab | Indent at the cursor (a tab or spaces, per the document's setting), or indent / outdent the selected lines |
| Ctrl+/ | Comment or uncomment the lines, in the file type's syntax (`//`, `#`, `--`, `<!-- -->`…) |
| Alt+↑ / Alt+↓ | Move the line(s) up or down |
| Shift+Alt+↑ / Shift+Alt+↓ | Duplicate the line(s) above or below |
| Ctrl+Shift+K | Delete the line(s) |
| Ctrl+Space | Show suggestions (Enter accepts, Escape closes) |
| Ctrl+Shift+[ / Ctrl+Shift+] | Fold / unfold the block at the cursor (Cmd+Alt+[ / ] on a Mac) |
| Ctrl+Alt+[ / Ctrl+Alt+] | Fold all / unfold all |
| Ctrl+B | Show or hide the folder sidebar |
| Ctrl+Shift+F | Search (and replace) in all documents and folders |
| Ctrl+Alt+S | Save all changed files |
| Ctrl+D | Select the next occurrence of the selection (add a cursor there) |
| Ctrl+Shift+L | Select every occurrence of the selection |
| Ctrl+Alt+↑ / Ctrl+Alt+↓ | Add a cursor on the line above or below |
| Ctrl+click / Alt+drag | Add a cursor / select a rectangular block |
| Escape | Back to a single cursor |
| Ctrl+P | Quick switcher: go to any document, or create one |
| Ctrl+Shift+P | Command palette: run any action by name |
| F1 or ? | Show all keyboard shortcuts |
| Alt+PageUp / Alt+PageDown | Previous / next tab |
| Ctrl+G | Go to a line, or `line:column` (or click the position in the status bar) |
| Ctrl+[ / Ctrl+] | Outdent / indent the lines |
| Ctrl+Shift+\\ | Jump to the matching bracket |
| Ctrl+F / Ctrl+H | Find / find and replace (every match is highlighted) |
| Alt+C / Alt+W / Alt+R | In the find bar: match case / whole word / regular expression |
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

The `dist/` folder is plain static files, including `sw.js`, the service worker that makes the app work offline. It's generated at build time by `build/pwa.js` with the list of built files, and only runs in production builds (not in `npm run dev`). Serve the folder over HTTPS (or `localhost`) for offline support and installing. Host it anywhere (GitHub Pages, Netlify, S3), or serve it locally with `npm run preview`.
