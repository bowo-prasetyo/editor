# Changelog

What changed in each version of Plumb, newest first. Versions follow
[semantic versioning](https://semver.org/); while Plumb is below 1.0, a new
minor version (0.x) can change how things work.

## [0.2.0] – 2026-11-14

**Plumb's first release.** The editor became **Plumb**, with a written
[vision](VISION.md) and one clear model: **files stay on your disk, and the
browser holds drafts.** It also has its own look, and speaks English,
Indonesian and Japanese.

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
- **Plumb in Indonesian and Japanese**, and ready for more languages.
  ([#41](https://github.com/bowo-prasetyo/plumb/pull/41),
  [#42](https://github.com/bowo-prasetyo/plumb/pull/42),
  [#43](https://github.com/bowo-prasetyo/plumb/pull/43),
  [#44](https://github.com/bowo-prasetyo/plumb/pull/44))
- **Its own look:** a logo, and a palette of ink blue with brass for calm
  notices.
  ([#34](https://github.com/bowo-prasetyo/plumb/pull/34),
  [#38](https://github.com/bowo-prasetyo/plumb/pull/38))
- **Easier to use, from the keyboard, with a screen reader, and on a phone.**
  ([#35](https://github.com/bowo-prasetyo/plumb/pull/35),
  [#36](https://github.com/bowo-prasetyo/plumb/pull/36),
  [#37](https://github.com/bowo-prasetyo/plumb/pull/37))

### Added

- [`VISION.md`](VISION.md): who Plumb is for, its principles, what it won't do,
  and what's next.
  ([#18](https://github.com/bowo-prasetyo/plumb/pull/18),
  [#20](https://github.com/bowo-prasetyo/plumb/pull/20),
  [#21](https://github.com/bowo-prasetyo/plumb/pull/21))
- **Plumb in Japanese (日本語).** Every message, including the editor's own
  panels, with Japanese number and date formats and 「」 quotation marks. A
  browser set to Japanese gets it from the first visit; **Settings →
  Language** picks it anywhere. The words used are in
  [Translating Plumb](docs/translating.md#japanese); corrections from native
  speakers are welcome.
  ([#44](https://github.com/bowo-prasetyo/plumb/pull/44))
- **Plumb in Indonesian (Bahasa Indonesia).** Every message, including the
  editor's own panels, with Indonesian number and date formats. A browser set
  to Indonesian gets it from the first visit; **Settings → Language** picks
  it anywhere. Native speakers' corrections are welcome: the words used are in
  [Translating Plumb](docs/translating.md#indonesian).
  ([#43](https://github.com/bowo-prasetyo/plumb/pull/43))
- **Plumb can be translated.** Every word on screen (about 650 messages,
  including the editor's own panels) comes from one catalog,
  `src/locales/en.json`, in the i18next JSON format translation tools use.
  Plural forms follow each language's rules, and numbers and dates follow the
  language. **Settings → Language** picks one, or follows the browser.
  [Translating Plumb](docs/translating.md) explains how to add a language.
  ([#41](https://github.com/bowo-prasetyo/plumb/pull/41),
  [#42](https://github.com/bowo-prasetyo/plumb/pull/42))
- **New drafts are named in the interface language** ("Untitled.md",
  "Tanpa judul.md"), and so is a document without a name.
  ([#43](https://github.com/bowo-prasetyo/plumb/pull/43))
- **A logo and favicon.** The text cursor hangs true as a plumb line, ending in
  a brass plumb bob. New app icons, a favicon (SVG, with a `.ico` for older
  browsers), the mark in the header, and a logo with a wordmark in the README.
  ([#34](https://github.com/bowo-prasetyo/plumb/pull/34))
- **A welcome on the first visit.** Until there's anything to list, the start
  page explains files (on your disk; Save writes them back) and drafts (in
  this browser), instead of one line and a storage warning.
  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- The **Folders** button in the header shows or hides the folder sidebar, and
  so does **Ctrl/Cmd+Shift+E** in any document, Markdown included.
  ([#29](https://github.com/bowo-prasetyo/plumb/pull/29),
  [#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **A Split button** in the editor's toolbar (it was only Ctrl/Cmd+\\ or the
  palette).
  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **Recently used commands first** in the command palette, and *Go to
  heading…* in it.
  ([#30](https://github.com/bowo-prasetyo/plumb/pull/30),
  [#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **Closing the tab of a file with unsaved changes says they're kept**, with
  *Reopen*.
  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **Phones and tablets:** on narrow screens the toolbar keeps *Preview*,
  *Find* and *Save* and puts the rest under *More*, and the status bar folds
  its controls behind **⋯**, which leaves about twice the room for text. On
  touch screens, Markdown documents get **B** and *I* buttons.
  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **Mixed line endings:** the status bar says *Mixed*, and each line keeps its
  own ending. Picking one ending converts the file.
  ([#23](https://github.com/bowo-prasetyo/plumb/pull/23))
- **The version is shown in Settings**, with a link to this changelog.
  ([#33](https://github.com/bowo-prasetyo/plumb/pull/33))
- **Docs:**
  - a short [README](README.md) with screenshots in light and dark;
  - every detail in [the reference](docs/reference.md), with a
    *Troubleshooting* section;
  - a [brand note](docs/brand.md) covering the name, the logo, the palette and
    how Plumb talks.

  ([#32](https://github.com/bowo-prasetyo/plumb/pull/32),
  [#39](https://github.com/bowo-prasetyo/plumb/pull/39),
  [#40](https://github.com/bowo-prasetyo/plumb/pull/40))

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
- **The save status is honest about files on disk.** A file's own state comes
  first. The browser part reads *Edits kept in browser ✓* until you save, and
  the header says edits are kept in your browser until you save them. Before,
  the status bar said "Saved ✓ · Not saved to file", and the header said
  "Everything is saved in your browser".
  ([#35](https://github.com/bowo-prasetyo/plumb/pull/35))
- **Plumb's own colours.** The interface takes the logo's ink blue, with greys
  that lean towards it.
  - **Brass** means "notice this, nothing is lost". It marks changes not yet
    saved to a file (the dot, and *Not saved to file*, which was red), find
    matches, and the banner for a file changed or deleted on disk.
  - Red is kept for real problems, such as a failed save.
  - The browser's or installed app's title bar matches the top bar.

  ([#38](https://github.com/bowo-prasetyo/plumb/pull/38))
- **Numbers, dates, sizes and sorting** follow the interface language. Counts
  group their digits (*1,206 words*).
  ([#41](https://github.com/bowo-prasetyo/plumb/pull/41))
- **Easier to see and to hit:**
  - controls are at least 24×24 px;
  - pressed toggles and the current item in lists are above 4.5:1 contrast in
    both themes;
  - the file name has a faint border;
  - messages sit above the status bar instead of covering it.

  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **For screen readers and voice control:**
  - the open documents are a list of links, the current one marked, each with
    its own close button;
  - every screen has a top-level heading;
  - buttons are named for what they show, and the find options (*Aa*, *ab*,
    *.\**) are drawn as icons, so their names (*Match case*, *Whole word*,
    *Regular expression*) are the only labels.

  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))

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
- **Dialogs keep the keyboard to themselves.**
  - This covers the shortcuts list, the quick switcher and command palette,
    *Save to folder* and *Close folder*.
  - Tab stays inside the dialog, Escape closes it wherever focus is, and focus
    goes back where it was.
  - Before, Tab could reach the page behind, where keys typed for the dialog
    edited the document.
  - The shortcuts list can now also be scrolled from the keyboard.

  ([#35](https://github.com/bowo-prasetyo/plumb/pull/35))
- **The folder sidebar is a proper tree for screen readers**, and Enter and
  Space press its buttons (*+ File*, *Put the edits back*…), which the tree's
  keys used to take.
  ([#37](https://github.com/bowo-prasetyo/plumb/pull/37))
- **Contrast** of primary buttons and of History's *added* lines in dark mode,
  and of comments on the current line in light mode, now passes 4.5:1.
  ([#36](https://github.com/bowo-prasetyo/plumb/pull/36))
- **Small wording fixes** that came with translation: lists of names read
  "a, b and c", and quotation marks are curly everywhere.
  ([#42](https://github.com/bowo-prasetyo/plumb/pull/42))
- **Find no longer shows "NaN"** once a search has 1,000 matches or more.
  ([#41](https://github.com/bowo-prasetyo/plumb/pull/41))
- **Words in Chinese, Japanese, Thai, Lao, Khmer and Burmese are counted.**
  These languages don't put spaces between words, so a whole sentence used to
  count as one word.
  ([#42](https://github.com/bowo-prasetyo/plumb/pull/42))
- **A draft named after a long first line no longer ends in half an emoji**
  (or a letter without its accent).
  ([#42](https://github.com/bowo-prasetyo/plumb/pull/42))
- **The quick switcher matches accented letters however they're stored**: typing
  *café* finds a name that macOS stored with a separate accent.
  ([#42](https://github.com/bowo-prasetyo/plumb/pull/42))

### Under the hood

- **End-to-end tests** in a real browser for every way text could be lost or
  changed. They test saving, reloading, conflicts, the page closing mid-save,
  and files that must come back byte for byte. That's 111 tests, alongside 278
  unit tests.
- **Automated checks** keep the release from drifting:
  - an accessibility scan (axe) of the main screens and dialogs, in light and
    dark;
  - a contrast check of every text colour;
  - a pseudo-language run that shows anything left untranslatable.
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
