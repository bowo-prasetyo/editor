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
| Migration: each kind of old document becomes a draft or a file as planned, runs once, never deletes text; copies from closed folders are offered to the Trash (with Undo) or kept | `migration.spec.js`, `test/filesdrafts.test.js` |

### The editor screen

Naming from the first line and renaming; find and replace all with a one-step
undo; tabs keeping their own text and undo history; the quick switcher; the
Markdown preview; word wrap remembered per document. (`editor.spec.js`)

## Known gaps

Problems the tests have found but that aren't fixed yet. Each is a
`test.fail()`: the test still runs, and it **fails when the bug is fixed**, so
whoever fixes it removes the marker.

None right now. (The first one, mixed line endings being normalised on save,
was fixed: see `src/lineends.js`.)

## Not covered (yet)

- **A reload with a folder open, end to end.** In the headless Chromium the
  tests use, reading a handle from the browser's private file system back out
  of IndexedDB after a reload crashes the page. Real handles, from the
  system's pickers, aren't affected. So end-to-end tests move between pages
  without reloading once a folder is open, and reading a file's text after a
  reload is covered by unit tests (`test/workspace.test.js`).

- **Firefox and Safari.** The end-to-end tests run in Chromium only. The
  Firefox and Safari promise (drafts, single files saved as downloads; see
  [VISION.md](VISION.md#the-firefox-and-safari-promise)) should get its own
  run in those browsers once the interface explains the differences (next
  step 5).
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
