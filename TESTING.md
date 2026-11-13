# Testing

How Plumb is tested, and why. This is the first step of the stabilisation
round in [VISION.md](VISION.md#next-steps): before Plumb grows again, every way
it could lose or change someone's text has a test that runs on every pull
request.

## Commands

```bash
npm test            # unit tests (Node's test runner), a few seconds
npm run test:e2e    # end-to-end tests in Chromium, against the production build
npm run lint        # ESLint
```

`npm run test:e2e` builds the app and serves it with `vite preview`. The first
time on a new machine, install the browser with `npx playwright install chromium`.
To watch a test run, add `--headed`; to debug a failure, add `--trace on` and
open the trace with `npx playwright show-trace`.

All three run in CI (`.github/workflows/ci.yml`) as separate jobs: `lint`,
`test` (unit tests and the build) and `e2e`. When `e2e` fails, its HTML report
is attached to the run.

## The layers

| Layer | Where | What it covers | What it can't |
|---|---|---|---|
| **Unit** | `test/*.test.js` | The logic in `src/*.js`: encodings, find and replace, indentation, the store's queues and rescue copies, history thinning, `.editorconfig`, search. Runs in Node with fakes (`fake-indexeddb`, `test/fakefs.js`). | Anything in a `.vue` file, CodeMirror, real browser storage, real files |
| **End to end** | `e2e/*.spec.js` | Plumb as people use it: the production build in a real Chromium, with real IndexedDB, localStorage, tabs and real file handles. | Firefox and Safari (see below); the operating system's file pickers |
| **Lint** | `eslint.config.js` | Mistakes: undefined or unused names, unreachable code, broken Vue templates. Style is left alone. | Behaviour |

The screens (`src/views/*.vue`, `src/components/*.vue`) are tested end to end
rather than with component tests. CodeMirror needs a real browser to lay out
text, and what matters is the whole path from a key press to the bytes in
IndexedDB or on disk.

## A stand-in for the disk

Browsers don't let tests click through the system's *Open* and *Save* dialogs.
So, before the app loads, `useFakeDisk()` (in `e2e/helpers.js`) replaces
`showOpenFilePicker`, `showSaveFilePicker` and `showDirectoryPicker` with
versions that return files from the browser's **Origin Private File System**
(OPFS), under a `disk/` folder.

These are real `FileSystemFileHandle` and `FileSystemDirectoryHandle` objects,
not mocks. Plumb reads and writes them, stores them in IndexedDB, checks their
permissions and dates, and watches them for changes, exactly as it does with a
folder on a real disk. The test reads and writes the same files to check bytes
and to play "another program" changing a file.

```js
await useFakeDisk(page)
await writeFile(page, 'notes.txt', [0xff, 0xfe, ...])  // bytes, or a string
await pick(page, ['notes.txt'])                        // what the user picks next
await page.getByRole('button', { name: 'Open files…' }).click()
// … edit, save …
expect(await readBytes(page, 'notes.txt')).toEqual([...])
```

Storage failures are simulated the same way: `breakStorage()` in
`e2e/storage.spec.js` makes IndexedDB refuse to save documents, as it does when
the disk or the quota is full.

## What is covered

The scenarios follow the principles in [VISION.md](VISION.md#principles).

### Never lose text

| Scenario | Test |
|---|---|
| Typing is saved by itself and survives a reload | `storage.spec.js` |
| Text typed just before the tab closes is kept | `storage.spec.js` |
| Browser storage fails: the problem is shown, and *Try again* saves once there's room | `storage.spec.js` |
| Browser storage fails and the tab is closed: the browser warns, and a rescue copy brings the text back | `storage.spec.js` |
| A rescue copy brings back fields removed since the last write too (a draft restored from the Trash just before the page closed stays restored) | `test/store.test.js` |
| A document edited in one tab shows up in another | `storage.spec.js` |
| Deleting a document can be undone | `storage.spec.js` |
| A file changed on disk never replaces unsaved text: *Keep mine* keeps it, and Save still asks | `livereload.spec.js` |
| *Reload from disk* keeps the unsaved text in History | `livereload.spec.js` |
| A file deleted on disk keeps its text in Plumb, and says so | `livereload.spec.js` |
| Cancelling the save dialog writes nothing and keeps the text | `files.spec.js` |

### Faithful to the file

| Scenario | Test |
|---|---|
| Saving with no edits keeps the file **byte for byte**: UTF-8 with and without BOM, UTF-16 LE and BE, Windows-1252; LF, CRLF and CR, and **mixed** line endings; no final newline; trailing whitespace; non-ASCII; an empty file | `files.spec.js` |
| An edit is written in the file's own encoding and line endings | `files.spec.js` |
| In a file with mixed line endings, untouched and edited lines keep theirs and added lines get the main one; picking one ending in the status bar converts the file | `files.spec.js`, `test/lineends.test.js` |
| A change to only the line endings on disk (e.g. `dos2unix`) is taken, not undone by the next save | `files.spec.js` |
| A file changed on disk is not overwritten without asking | `files.spec.js` |
| Plumb's own save isn't mistaken for a change on disk | `livereload.spec.js` |
| A document with nothing unsaved follows its file, and Undo brings the old text back | `livereload.spec.js` |
| Save on a new document asks where, then keeps saving there; Save as links to the new file | `files.spec.js` |
| A folder's file opens, saves back, and shows when it has unsaved changes; opening it again shows the same document; changes from other programs and new files are picked up | `folders.spec.js` |

### Files and drafts ([plan](docs/files-and-drafts.md))

| Scenario | Test |
|---|---|
| A file from a folder is a file, never in the Drafts list | `folders.spec.js`, `test/workspace.test.js` |
| A file with nothing unsaved is stored **without its text**; unsaved edits are stored in full | `folders.spec.js`, `test/filesdrafts.test.js` |
| A file not read yet gets its text from disk when shown, fresh (changed while Plumb was closed), and asks for permission when the browser needs it | `test/workspace.test.js` |
| A file not read yet is never written (its empty placeholder would wipe the file) | `test/workspace.test.js` |
| Search reads files from disk, not stored copies | `folders.spec.js` |
| Closing a folder keeps unsaved files as drafts; the others, and their history, go | `folders.spec.js`, `test/workspace.test.js` |
| Closing with unsaved files asks: *Save all to disk* (writes, then closes; stays open and says which file if one can't be saved), *Keep as drafts*, *Cancel*; with nothing unsaved it just closes | `closing.spec.js`, `test/closing.test.js` |
| Opening the folder again offers to *Put the edits back*: unchanged files become files again with their unsaved edits; files changed meanwhile get the *changed on disk* banner and Save asks; files gone stay drafts; *Not now* leaves them; another folder with the same name isn't mistaken for it | `closing.spec.js`, `test/closing.test.js` |
| Backups hold drafts and unsaved file edits, not copies; rescue copies and other tabs never blank a file | `test/filesdrafts.test.js` |
| Pinned drafts stay at the top, and stay pinned | `drafts.spec.js`, `test/folders.test.js`, `test/drafts.test.js` |
| Labels: filter by one, remove one with Undo; no folder controls remain; the quick switcher makes plain drafts | `drafts.spec.js`, `test/folders.test.js` |
| *Save to folder…* writes the draft's text (its encoding and line endings) as a new file, creating subfolders; never replaces a file or a folder; refuses bad names; the draft becomes that file, with its history; Undo makes it a draft again and removes the file only if unchanged | `drafts.spec.js`, `test/drafts.test.js` |
| Files opened on their own are in Recent files, not drafts; opening one again shows the same record, up to date with the disk; unsaved changes are marked and never drop off; the list keeps 20; ✕ takes one off and leaves the file on disk | `recent.spec.js`, `test/recent.test.js` |
| A draft saved to a file becomes that file (Recent files); a folder's file saved as another file leaves the folder | `recent.spec.js`, `test/recent.test.js` |
| Migration step 3: single files kept as drafts become recent files (20 most recent, plus any with unsaved changes); older ones are offered as copies | `recent.spec.js`, `test/recent.test.js` |
| Migration: each kind of old document becomes a draft or a file as planned, runs once, never deletes text; copies from closed folders are offered to the Trash (with Undo) or kept | `migration.spec.js`, `test/filesdrafts.test.js` |

### Markdown ([plan](docs/markdown.md))

| Scenario | Test |
|---|---|
| New drafts (and the quick switcher's) are named `.md`; the preview is off until turned on | `markdown.spec.js`, `test/naming.test.js` |
| Ctrl/Cmd+B and Ctrl/Cmd+I wrap and unwrap the selection, insert a pair with nothing selected, toggle every selection, and don't take each other's stars | `markdown.spec.js`, `test/mdedit.test.js` |
| Outside Markdown, Ctrl/Cmd+B shows and hides the sidebar and adds no stars; the Folders button does too | `markdown.spec.js` |
| Lists, tasks and quotes continue on Enter, copying indentation and spacing; an ordered list is never renumbered; Enter on an empty item ends the list; nothing happens outside lists, inside a marker or in code blocks | `markdown.spec.js`, `test/mdedit.test.js` |
| Pasting a URL over selected text makes a link; elsewhere it pastes as is | `markdown.spec.js` |
| Go to heading: `#` in the quick switcher lists headings (not in code blocks; underlined ones too) and jumps to one; also from the palette | `markdown.spec.js`, `test/mdedit.test.js` |

### Firefox and Safari ([VISION.md](VISION.md#the-firefox-and-safari-promise))

| Scenario | Test |
|---|---|
| *Open folder…* is shown, disabled, with the reason; Chrome and Edge get no such notes | `platform.spec.js` |
| A one-time note says Save downloads a copy, naming the browser; once dismissed it stays away | `platform.spec.js`, `test/platform.test.js` |
| Save downloads a faithful copy (name, line endings) and says where it went | `platform.spec.js` |

### The editor screen

Settings shows the version from `package.json`, with a link to the changelog.
(`editor.spec.js`)

Naming from the first line and renaming; find and replace all with a one-step
undo; tabs keeping their own text and undo history; the quick switcher; the
Markdown preview; word wrap remembered per document. (`editor.spec.js`)

For a file on disk, the status bar and header never say "saved" while the
file is out of date: *Not saved to file · Edits kept in browser ✓*, then
*Saved to file*; drafts keep *Saved ✓*. (`files.spec.js`)

Dialogs are modal from the keyboard: Tab and Shift+Tab stay inside, focus
moved outside is brought back, Escape closes them wherever focus is, keys
meant for a dialog never edit the document behind, and focus returns to the
editor or the button that opened them. (`dialogs.spec.js`)

Finding and using things (`usability.spec.js`): the first visit explains
files and drafts, without the storage warning; every screen has a top-level
heading; the open documents are links (the current one marked) with their
own close buttons, no control inside another; the status bar's controls and
tab close buttons are at least 24×24 px; the text size buttons are named by
their content; *Split* has a button that shows its state; the palette lists
recently run commands first; closing a file's tab with unsaved changes says
they're kept, and *Reopen* brings it back. On a phone (Pixel 5): the toolbar
keeps the everyday buttons and the rest are in *More* (keyboard: ↓, Escape
back to the button), which fits on screen; *Bold* and *Italic* buttons format
Markdown and keep the editor focused; the status bar folds its controls
behind a details button. Ctrl/Cmd+Shift+E shows and hides the sidebar in
Markdown too (`markdown.spec.js`).

Text in any language (`test/stats.test.js`, `test/naming.test.js`,
`test/fuzzy.test.js`, `test/locale.test.js`): words are counted in scripts
written without spaces (Japanese, Thai); names are never cut through an emoji
or an accent; the quick switcher matches composed and decomposed accents and
highlights whole letters; numbers, dates, sizes and sorting follow the one
locale in `src/locale.js` (by default the browser's, identical to a bare
`toLocaleString()`); and command groups are ids, so renaming one on screen
doesn't change the palette's order (`test/commands.test.js`).

The folder sidebar (`folders.spec.js`): each folder's tree holds only tree
items (the folder first, at level 1); arrow keys still move, expand and
collapse; Enter on the folder's buttons presses them.

## Known gaps

Problems the tests have found but that aren't fixed yet. Each is a
`test.fail()`: the test still runs, and it **fails when the bug is fixed**, so
whoever fixes it removes the marker.

None right now. (The first one, mixed line endings being normalised on save,
was fixed: see `src/lineends.js`.)

## Not covered (yet)

- **A reload with a folder or a recent file open, end to end.** In the headless Chromium the
  tests use, reading a handle from the browser's private file system back out
  of IndexedDB after a reload crashes the page. Real handles, from the
  system's pickers, aren't affected. So end-to-end tests move between pages
  without reloading once a folder is open, and reading a file's text after a
  reload is covered by unit tests (`test/workspace.test.js`).

- **Real Firefox and Safari.** The end-to-end tests run in Chromium only.
  `platform.spec.js` checks the Firefox and Safari promise there by hiding
  the File System Access API, as those browsers lack it: *Open folder…*
  disabled with its reason, the one-time note, and faithful downloads that
  say where they went. A run in Firefox and WebKit themselves would also
  catch differences in their editing and storage; Playwright can add them as
  projects.
- **Two tabs editing the same document at the same moment.** The rule (keep
  both, the other tab's as a copy) is unit-tested in `test/store.test.js`; it
  is hard to time reliably end to end.
- **Large files and performance budgets** ("first keystroke in under a
  second"). A measured check belongs in a later round.
- **Accessibility checks** (for example axe). Worth adding, outside this round.

## Writing a new test

- **Name it after what a person sees**, not the code: "a file changed on disk is
  not overwritten without asking".
- **Find things the way people do**: by role and label (`getByRole('button',
  { name: 'Save as…' })`), not by CSS classes, where the markup allows.
- **Wait for the outcome, not for time.** Use `expect(...).toHaveText()` and
  `expect.poll()`. The only fixed waits are `tick()`, which lets a file's date
  move on before an "outside" change.
- **Check the bytes.** For anything that touches a file, compare `readBytes()`
  with what's expected, not just the text on screen.
- **Never skip a failing test to get green.** If it's a real bug that can't be
  fixed in the same PR, mark it `test.fail()` with a comment and list it under
  *Known gaps* above.
