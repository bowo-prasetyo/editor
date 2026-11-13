# Changelog

What changed in each version of Plumb, newest first. Versions follow
[semantic versioning](https://semver.org/); while Plumb is below 1.0, a new
minor version (0.x) can change how things work.

## Unreleased

### Added

- **Screenshots in the README**, in light and dark (GitHub shows the one that
  matches your theme), and a **brand note**, [docs/brand.md](docs/brand.md):
  the name, the logo and how to use it, the palette and what each colour
  means, type, and how Plumb talks. `npm run screenshots` and
  `npm run palette` redraw the pictures, and a test fails if the palette
  picture falls out of date.
- **A logo and favicon.** The text cursor hangs true as a plumb line, ending in
  a brass plumb bob. New app icons, a favicon (SVG, with a `.ico` for older
  browsers), the mark in the header, and a logo with a wordmark in the README.
  Regenerate the bitmaps with `npm run icons`.
- **A welcome on the first visit.** Until there's anything to list, the start
  page explains files (on your disk; Save writes them back) and drafts (in
  this browser), instead of one line and a storage warning.
- **Ctrl/Cmd+Shift+E shows or hides the folder sidebar** in any document,
  Markdown included. Ctrl/Cmd+B still does outside Markdown, where it isn't
  bold.
- **A Split button** in the editor's toolbar (it was only Ctrl/Cmd+\\ or the
  palette).
- **Recently used commands first** in the command palette.
- **Closing the tab of a file with unsaved changes says they're kept**, with
  *Reopen*.
- **Phones and tablets:** on narrow screens the toolbar keeps *Preview*,
  *Find* and *Save* and puts the rest under *More*, and the status bar folds
  its controls behind **⋯**, which leaves about twice the room for text. On
  touch screens, Markdown documents get **B** and *I* buttons.

### Changed

- **Plumb's own colours.** The interface takes the logo's ink blue, with greys
  that lean towards it, in place of GitHub's palette. **Brass** now means
  "notice this, nothing is lost": changes not yet saved to a file (the dot on
  tabs, in the sidebar and on the start page, and *Not saved to file* in the
  status bar, which was red), find matches, and the banner for a file changed
  or deleted on disk. Red is kept for real problems, such as a failed save. The
  text cursor is blue, and the browser's or installed app's title bar matches
  the top bar in light and dark instead of staying bright blue.
- **The save status is honest about files on disk.** The status bar used to
  say "Saved ✓ · Not saved to file" for an edited file, and the header
  "Everything is saved in your browser". Now a file's own state comes first,
  the browser part reads *Edits kept in browser ✓* until you save, and the
  header says edits are kept in your browser until you save them.
- **Easier to see and to hit:**
  - The status bar's controls, the tab close buttons and the sidebar's folder
    buttons are at least 24×24 px.
  - Pressed toggles (*Wrap*, *Spelling*, *Preview*) and the current item in
    lists use a darker blue, above 4.5:1 contrast in both themes.
  - The file name has a faint border, so it reads as something you can
    rename.
  - Messages sit above the status bar instead of covering it.
- **For screen readers and voice control:**
  - The open documents are a list of links, the current one marked, each
    with its own close button. Before, they were ARIA tabs with a button
    inside.
  - Every screen has a top-level heading.
  - The text size buttons are named *Smaller text* and *Larger text* by their
    content, not by a label that differs from what's on screen.

### Fixed

- **Contrast in dark mode:** primary buttons (white on light blue, 3.1:1) and
  *added* lines in History (3.7:1) now pass 4.5:1, and so do code comments on
  the current line in light mode (4.2:1). A test checks every text colour on
  its backgrounds in both themes.
- **Dialogs keep the keyboard to themselves.** In the shortcuts list, the
  quick switcher and command palette, *Save to folder* and *Close folder*,
  Tab and Shift+Tab now stay inside the dialog, Escape closes it wherever
  focus is, and focus goes back where it was when it closes. Before, Tab
  could move focus to the page behind, where keys typed for the dialog
  edited the document (`src/modal.js`).
- **The folder sidebar is a proper tree for screen readers.** Each open
  folder is its own tree, holding only tree items: the folder's row, its
  files and folders, and *Loading…* / *Empty* as items you can't pick. The
  folder's buttons and notes (*Put the edits back*, *Allow access*) sit next
  to its tree rather than inside it, where they made the tree invalid.
- **Enter and Space press the sidebar's buttons.** On *+ File*, *+ Folder*,
  *Put the edits back* and the others, the tree's own keys used to take them,
  so the buttons couldn't be pressed from the keyboard.

## [0.2.0] – 2026-11-13

The first release since the product review. The editor became **Plumb**,
with a written [vision](VISION.md) and one clear model:
**files stay on your disk, and the browser holds drafts.**

### Highlights

- **Plumb keeps no copies of your files.** A file from a folder, or one opened
  on its own, isn't stored in the browser when it has no unsaved changes. Its
  text is read from disk when shown, so it's always current. Only unsaved edits
  and version history are kept.
  ([#25](https://github.com/bowo-prasetyo/plumb/pull/25),
  [#28](https://github.com/bowo-prasetyo/plumb/pull/28))
- **Closing a folder never loses unsaved edits.** Plumb asks you to *Save all
  to disk*, *Keep as drafts*, or *Cancel*. Open the folder again and it offers
  to *Put the edits back*.
  ([#26](https://github.com/bowo-prasetyo/plumb/pull/26))
- **Drafts are a simple list:** pin them, filter them by their old folders
  (now labels), and turn one into a file with *Save to folder…*.
  ([#27](https://github.com/bowo-prasetyo/plumb/pull/27))
- **Recent files:** files you open on their own are listed on the start page,
  and opening one again shows the same one.
  ([#28](https://github.com/bowo-prasetyo/plumb/pull/28))
- **Markdown is first-class.**
  - New drafts are `.md`.
  - Ctrl/Cmd+B and Ctrl/Cmd+I make text bold and italic.
  - Lists continue on Enter, without renumbering the rest.
  - Pasting a URL over selected text makes a link.
  - Type `#` in the quick switcher to go to a heading.

  ([#29](https://github.com/bowo-prasetyo/plumb/pull/29),
  [#30](https://github.com/bowo-prasetyo/plumb/pull/30))
- **Firefox and Safari, said plainly.** *Open folder…* is greyed out with its
  reason, a one-time note explains that Save downloads a copy, and each
  download says where it went.
  ([#31](https://github.com/bowo-prasetyo/plumb/pull/31))

### Added

- [`VISION.md`](VISION.md): who Plumb is for, its principles, what it won't do,
  and what's next.
  ([#18](https://github.com/bowo-prasetyo/plumb/pull/18),
  [#20](https://github.com/bowo-prasetyo/plumb/pull/20),
  [#21](https://github.com/bowo-prasetyo/plumb/pull/21))
- The **Folders** button in the header shows or hides the folder sidebar.
  ([#29](https://github.com/bowo-prasetyo/plumb/pull/29))
- *Go to heading…* in the command palette.
  ([#30](https://github.com/bowo-prasetyo/plumb/pull/30))
- **Mixed line endings:** the status bar says *Mixed*, and each line keeps its
  own ending. Picking one ending converts the file.
  ([#23](https://github.com/bowo-prasetyo/plumb/pull/23))
- **The version is shown in Settings**, with a link to this changelog.
- **Docs:** a short [README](README.md), with every detail in
  [the reference](docs/reference.md).
  ([#32](https://github.com/bowo-prasetyo/plumb/pull/32))

### Changed

- **The name.** The editor is now **Plumb**, at
  <https://bowo-prasetyo.github.io/plumb/>.
  ([#19](https://github.com/bowo-prasetyo/plumb/pull/19))
- **The start page lists drafts only.** Files are in the folder sidebar and in
  Recent files.
- **Virtual folders became read-only labels.** New folders can't be made;
  *Move to folder…* and dragging onto folders are gone.
  ([#27](https://github.com/bowo-prasetyo/plumb/pull/27))
- **Ctrl/Cmd+B** means bold in Markdown documents, and still shows or hides the
  sidebar elsewhere.
  ([#29](https://github.com/bowo-prasetyo/plumb/pull/29))
- **Saving a draft to a file makes it that file**, in Recent files.
  ([#28](https://github.com/bowo-prasetyo/plumb/pull/28))
- **After a reload**, a file with no unsaved changes shows *Allow access* until
  the browser has permission for it again. Its text is on disk, not in the
  browser.
  ([#25](https://github.com/bowo-prasetyo/plumb/pull/25))
- **Search reads files from disk**, never a stored copy. Its *Documents* scope
  is now *Drafts*.
  ([#25](https://github.com/bowo-prasetyo/plumb/pull/25))
- **Backups** hold drafts and unsaved file edits, not copies of saved files.
  ([#25](https://github.com/bowo-prasetyo/plumb/pull/25))

### Fixed

- **A file that mixed line endings** was saved with every ending changed to the
  most common one, even with no edits.
  ([#23](https://github.com/bowo-prasetyo/plumb/pull/23))
- **A change made on disk to only a file's line endings or encoding** (for
  example `dos2unix`) was undone by Plumb's next save.
  ([#23](https://github.com/bowo-prasetyo/plumb/pull/23))
- **A draft restored from the Trash** went back into the Trash if the tab closed
  right after.
  ([#28](https://github.com/bowo-prasetyo/plumb/pull/28))
- **In Markdown, Enter in a numbered list renumbered the items after it.**
  ([#30](https://github.com/bowo-prasetyo/plumb/pull/30))
- ***Save as* on a folder's file** kept pointing at the folder's file.
  ([#28](https://github.com/bowo-prasetyo/plumb/pull/28))
- **Opening the same file again** made another copy each time.
  ([#28](https://github.com/bowo-prasetyo/plumb/pull/28))

### Under the hood

- **End-to-end tests** in a real browser for every way text could be lost or
  changed. They test saving, reloading, conflicts, the page closing mid-save,
  and files that must come back byte for byte. Each phase of the work added
  more: 78 tests now, alongside 242 unit tests.
- **Linting in CI**, and a testing guide, [`TESTING.md`](TESTING.md).
  ([#22](https://github.com/bowo-prasetyo/plumb/pull/22))

### Upgrading from 0.1.0

- **Your documents are brought up to date once,** the first time you open
  0.2.0. Nothing is deleted unless you choose it.
  - Documents from open folders become files.
  - Unsaved edits from folders you'd closed become drafts that remember their
    file.
  - Single files you'd opened move to Recent files.
  - Old copies of files get a one-time banner offering to move them to the Trash,
    with *Export a backup first*.
- **The address changed** from `/editor/` to
  [`/plumb/`](https://bowo-prasetyo.github.io/plumb/). Your documents are still
  there in the same browser. If you installed the app from the old address,
  install it again from the new one: the old one doesn't get updates.

## [0.1.0] – 2026-11-12

The editor as it was before the review
([#1](https://github.com/bowo-prasetyo/plumb/pull/1)–[#17](https://github.com/bowo-prasetyo/plumb/pull/17)):
a client-only text and code editor built with Vue 3, Vite and CodeMirror 6.

- **Storage:** documents kept in IndexedDB, saved as you type, safe across tabs,
  with a Trash, backups and version history.
- **Files:**
  - files opened and saved back in place (Chrome, Edge), keeping their encoding
    and line endings;
  - folders in a sidebar, with live reload of files changed on disk;
  - search and replace across documents and folders.
- **Editing:**
  - syntax highlighting for 140+ languages, multiple cursors, folding, and
    editing helpers;
  - find and replace with regular expressions;
  - line commands, indentation settings, and `.editorconfig`;
  - JSON and YAML checking, a split editor, and Vim keys.
- **Getting around:** tabs, a quick switcher, a command palette, and a shortcuts
  panel.
- **The app:** works offline, and can be installed as an app.

[0.2.0]: https://github.com/bowo-prasetyo/plumb/releases/tag/v0.2.0
[0.1.0]: https://github.com/bowo-prasetyo/plumb/tree/7f60cd5
