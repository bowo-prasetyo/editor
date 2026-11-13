# Changelog

What changed in each version of Plumb, newest first. Versions follow
[semantic versioning](https://semver.org/); while Plumb is below 1.0, a new
minor version (0.x) can change how things work.

## Unreleased

### Added

- **A logo and favicon.** The text cursor hangs true as a plumb line, ending in
  a brass plumb bob. New app icons, a favicon (SVG, with a `.ico` for older
  browsers), the mark in the header, and a logo with a wordmark in the README.
  Regenerate the bitmaps with `npm run icons`.

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
