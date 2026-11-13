# Plumb reference

Everything Plumb does, by topic. For a short introduction, see the
[README](../README.md). Ctrl means Cmd, and Alt means Option, on a Mac, except
where a shortcut says otherwise.

- [The screen](#the-screen): the names used in this guide
- [Drafts](#drafts)
- [Files](#files): opening files, Recent files, folders, closing a folder, saving, encodings and line endings, live reload
- [Editing](#editing): the editor, Markdown, code, indentation, find and replace, line commands
- [Finding your way](#finding-your-way): tabs, the quick switcher, the command palette, search and replace across files, split editor
- [Never losing text](#never-losing-text): autosave, other tabs, version history, Trash, backup, where your text is kept
- [Settings](#settings)
- [Offline and installing](#offline-and-installing)
- [Browsers](#browsers)
- [Limits](#limits)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [Technical notes](#technical-notes)

## The screen

The names this guide uses for the parts of Plumb:

- **Start page:** what you see first. It has *New document*, *Open files…*
  and *Open folder…*, your Recent files and your drafts, and *Export all* and
  *Import backup…*. The Plumb logo at the top left brings you back to it.
- **Header:** the bar across the top. It holds *Go to…* (the quick switcher),
  *Search*, *Folders*, `?` (the shortcuts), ⚙ (Settings) and, when the browser
  offers it, *Install*.
- **Tabs:** one for each document you have open, under the header.
- **Toolbar:** the buttons above the text: the file name, *Save*, *Find*,
  *Preview*, *Split*, *History* and others. On a narrow screen, most of them
  are under *More*.
- **Status bar:** the line under the text. It shows the cursor position, the
  word count and whether the document is saved, and has the menus for the
  language, indentation, encoding, line endings and text size.
- **Sidebar:** the tree of an open folder's files, on the left.
- **Quick switcher** (Ctrl+P) and **command palette** (Ctrl+Shift+P): boxes
  that open over the page. Type to find a document or run any command by
  name. If you don't know where something is, look for it there.

## Drafts

Drafts are text that isn't a file yet: notes, pasted text, new documents.
They're kept in your browser.

- **New drafts are Markdown.** They're named after their first line until you
  rename them: `# Meeting notes` gives `Meeting notes.md`. Plain text is valid
  Markdown. Rename a draft to `.txt` to keep it plain.
- **The list of drafts** is on the start page. Filter it by name or text, and
  sort it by last edited, name, date created or size.
- **Pin** a draft (📌, or *Pin this draft* in the command palette) to keep it at
  the top. Pinned drafts stay first whatever the sort order.
- **Save to folder…** turns a draft into a file in an open folder. It's in the
  editor, and only appears while a folder is open.
  - Subfolders are created as needed, and an existing file is never replaced.
  - The draft keeps its history.
  - Undo turns it back into a draft, removing the file only if it hasn't
    changed since.
- **Saving a draft to a file** with Save or Save as… (Chrome and Edge) makes it
  that file. It moves to Recent files.
- **The quick switcher** creates a draft from whatever you typed when nothing
  matches.
- **From earlier versions of Plumb.** You only see these if you used Plumb
  before version 0.2:
  - **Labels.** Drafts that earlier versions filed in folders show that folder
    as a label. Filter the list by a label, or remove one with ×. New labels
    aren't made: once something is worth organising, its home is a folder on
    disk.
  - **Copies of files** that earlier versions kept are offered to the Trash
    once, in a banner on the start page.

## Files

**Plumb keeps no copies of your files.** A file with no unsaved changes isn't
stored in the browser; only its version history is. Its text is read from disk
when it's shown, so it's always current. Files never appear in the list of
drafts.

### Opening files

- **Open files…** opens several at once, or drop files anywhere on the page.
- **Binary files** are refused.
- **In Chrome and Edge:**
  - **Save (Ctrl+S) writes back to the file you opened**, even after a reload,
    and warns you if the file changed on disk in the meantime.
  - **Save as… (Ctrl+Shift+S)** picks another file. *Save as* on a folder's file
    makes it the new file, outside the folder.
- **In Firefox and Safari**, an opened file becomes a draft, and Save downloads a
  copy (see [Browsers](#browsers)).

### Recent files

Chrome and Edge only.

- **What's listed:** files you open on their own, and drafts you save to a file,
  appear on the start page above your drafts. The list keeps the 20 most
  recent.
- **Opening a file again** shows the same one, up to date with the disk.
- **After a reload**, the browser may ask for permission (*Allow access*) before
  a file's text can be shown.
- **Unsaved changes:** a file with unsaved changes is marked "Not saved to file"
  and never drops off the list.
- **Removing:** take the others off with ✕. The file stays on disk.

### Folders

Chrome and Edge only.

- **Opening:** use *Open folder…* on the start page, or the command palette.
- **The sidebar:** the folder's files show in a sidebar tree. The *Folders*
  button in the header shows or hides it, and so does Ctrl+Shift+E (anywhere)
  or Ctrl+B (outside Markdown documents, where it means bold).
- **Large folders:** a folder's contents are read only when you expand it, so big
  projects stay quick.
- **Opening a file:** click it, or use the arrow keys and Enter. Save writes back
  to it, with the same check for changes made on disk meanwhile.
- **Opening it again** shows it as you left it, reloaded from disk if it changed
  and you have no unsaved edits.
- **Unsaved changes** are marked with a dot in the tree.
- **Creating:** *+ File* and *+ Folder* create files and folders, never replacing
  one that exists. ↻ reads the folder again.
- **Finding files:** the quick switcher finds a folder's files by path, for
  example `my-app/src`.
- **After a reload**, the browser asks once for permission to use the folder
  again (*Allow access*). Until then, files with no unsaved changes can't be
  shown, because their text is on disk. Unsaved edits show at once.

### Closing a folder

**Closing a folder never loses unsaved edits.** If files have unsaved changes,
Plumb asks first:

- **Save all to disk** writes them, then closes the folder. If any file can't be
  saved, the folder stays open and Plumb says which.
- **Keep as drafts** turns them into drafts that remember where they came from.
  Open the folder again later, and the sidebar offers to **Put the edits back**:
  - a file that changed on disk meanwhile gets the usual *changed on disk*
    banner, and Save asks before replacing it;
  - a file that's gone leaves its draft as a draft.
- **Cancel** leaves the folder open.

Files with no unsaved changes, and their history, go when the folder closes:
their text is on disk.

### Saving, encodings and line endings

- **Detected and kept:** the encoding (UTF-8, UTF-16, Windows-1252), the
  byte-order mark and the line endings (LF, CRLF, CR) are detected on open and
  kept on save. Change them in the status bar.
- **Mixed line endings:** in a file that mixes them, the status bar says *Mixed*.
  Each line keeps its own ending. Lines you add get the most common one, and
  picking one ending in the status bar converts the whole file.
- **Text that won't fit the encoding:** if some characters can't be written in
  the file's encoding, Plumb asks before saving it as UTF-8.
- **Optional fixes when saving to a file:** trim trailing whitespace, and add a
  final newline.
  - Both are off by default. Turn them on in Settings or the command palette.
  - Markdown keeps its trailing spaces, which mean a line break.
  - They only happen when writing a file: documents in the browser are never
    changed behind your back.
- **`.editorconfig`:** a project's `.editorconfig` can decide these too (see
  [Settings](#settings)).

### Live reload

Documents linked to files follow changes made on disk by other programs:
another editor, a formatter, `git checkout`.

- **When changes are noticed:**
  - Files in open folders are picked up as they change; Chrome and Edge watch
    the folders.
  - Other files are checked when you come back to the window or switch to the
    document.
- **With nothing unsaved,** a document reloads by itself. Ctrl+Z undoes it, and
  the text it replaced is kept in History.
- **With unsaved changes,** nothing is replaced. A banner offers:
  - *Reload from disk*, which first keeps your text in History;
  - *Keep mine*, after which Save asks before replacing the file.
- **Deleted, renamed or moved files:**
  - A file deleted on disk gets a notice, and its text stays.
  - A file renamed or moved within its folder takes its document along.
  - A change only to the line endings or the encoding is picked up too.
- **Your own saves** never count as changes.
- **Turning it off:** in Settings, so that you're asked each time instead.

## Editing

### The editor

- **Built on [CodeMirror 6](https://codemirror.net/).** Only the visible lines are
  drawn, so files of several MB stay quick to type in.
- **Syntax highlighting** covers 140+ languages, picked from the file name
  (`.js`, `.py`, `Dockerfile`, `.yaml`…).
  - Each language is downloaded only when a document needs it.
  - Pick another language, or plain text, in the status bar. The choice is kept
    per document.
  - Files over 5 million characters start as plain text.
- **Brackets:** matching brackets are highlighted, and mismatched ones show in
  red. Ctrl+Shift+\\ jumps to the matching bracket.
- **Multiple cursors:**
  - Ctrl+D selects the next occurrence of the selection, and Ctrl+Shift+L every
    occurrence.
  - Ctrl+Alt+↑ / ↓ adds a cursor above or below.
  - Ctrl+click adds a cursor anywhere, and Alt+drag selects a rectangular block.
  - Escape goes back to one cursor.
- **Line numbers** (also with word wrap), and the cursor position, selection and
  word count in the status bar.
  - Word counts for very large documents update when you pause.
  - Spell check is off by default above 200,000 characters.
- **Word wrap** (Alt+Z) and **spell check**, per document. Both are on by default
  for prose (`.txt`, `.md`, no extension) and off for code.
- **Text size** (A− / A+ in the status bar), and **printing** the whole document.

### Markdown

These work in Markdown documents (`.md`, `.markdown`, `.mdown`).

- **Preview:** side by side on wide screens. It's off until you turn it on, then
  remembered per document. It's rendered safely: links open in a new tab, and
  nothing in a document can run code.
- **Bold and italic:** Ctrl+B and Ctrl+I wrap the selection in `**…**` or `*…*`,
  or unwrap it.
  - With nothing selected, they insert the pair with the cursor between.
  - Outside Markdown, Ctrl+B shows or hides the folder sidebar.
  - On touch screens, **B** and *I* buttons in the toolbar do the same.
- **Lists continue on Enter.**
  - This covers bullets, numbers, `- [ ]` tasks (a new task is unchecked) and
    `>` quotes.
  - Enter on an empty item ends the list.
  - The other items of a numbered list are never renumbered.
- **Pasting a URL over selected text** makes it a link.
- **Go to a heading:** type `#` in the quick switcher, or use *Go to heading…* in
  the command palette.
- **Never reformatted:** Plumb doesn't change anything you didn't type.

### Code

- **Editing helpers:**
  - Brackets and quotes close themselves.
  - Suggestions appear as you type: the language's own (keywords, CSS
    properties, names in scope), plus words from the document.
  - Indentation guides mark each level.
- **In prose,** nothing closes itself, and suggestions come only with Ctrl+Space.
- **Turning helpers off:** each helper can be turned off in Settings or the
  command palette.
- **Comments:** Ctrl+/ comments or uncomments the lines, in the file type's
  syntax (`//`, `#`, `--`, `<!-- -->`…).
- **Code folding:** fold blocks from the gutter (▾ / ▸), or with Ctrl+Shift+[ / ]
  (Cmd+Alt+[ / ] on a Mac). Fold and unfold everything with Ctrl+Alt+[ / ].
- **JSON and YAML checking** as you type:
  - Mistakes are underlined and marked in the gutter.
  - The status bar counts them: click it to list them, or press Ctrl+Shift+M.
    F8 goes to the next one.
  - JSON with comments (`tsconfig.json`, `.vscode/*.json`, `.jsonc`) isn't
    checked.

### Indentation

- **Per document:** tabs or spaces, 2, 4 or 8 wide, detected from the file.
- **Defaults:** 4 spaces for Python and similar, tabs for Go and Makefiles, and
  2 spaces otherwise.
- **Changing it:** use the menu in the status bar, which can also convert the
  whole file between tabs and spaces.
- **Enter:** in code, it indents by the language's rules, a level deeper after
  `{`, `(` or `:`. In plain text and Markdown, it keeps the current line's
  indentation.
- **Tab / Shift+Tab** indent at the cursor, or indent and outdent the selected
  lines.

### Find and replace

- **Opening it:** Ctrl+F finds, and Ctrl+H finds and replaces.
- **Options:** match case, whole word and **regular expressions** (Alt+C, Alt+W,
  Alt+R in the find bar).
- **Matches:** every match is highlighted, and replacements can be undone.
- **In regex mode:**
  - `^` and `$` match at each line, and matches can span lines (`\n`).
  - The replacement can use `$1`, `$<name>`, `$&`, `$$`, `\n` and `\t`.
- **Many matches:** up to 100,000 are listed, and Replace all replaces every one.
- **Go to a line:** Ctrl+G, or `line:column`, or click the position in the status
  bar.

### Line commands

These are in the command palette:

- sort lines: A to Z, Z to A, or ignoring case, in natural order (`file2` comes
  before `file10`);
- remove duplicate lines;
- reverse lines;
- join lines;
- change case: UPPERCASE, lowercase, Title Case;
- trim trailing whitespace.

They work on the selected lines, or the whole document when nothing is
selected; join and change case work at the cursor. Each is one undoable edit.
Alt+↑ / ↓ moves lines, Shift+Alt+↑ / ↓ duplicates them, and Ctrl+Shift+K
deletes them.

## Finding your way

- **Tabs** for the documents you open, remembered in this browser.
  - Switching tabs keeps each document's undo history, cursor and scroll
    position.
  - Close a tab with × or a middle-click. Alt+PageUp / Alt+PageDown move
    between tabs.
  - Closing the tab of a file with changes not saved to it keeps them (in the
    browser, as always) and says so, with *Reopen*.
- **Quick switcher:** Ctrl+P, or *Go to…* in the header.
  - Type part of a document's name or folder. Letters in order are enough:
    `wcl` finds `Work/Clients/…`.
  - With folders open, it also lists any file in them, opened or not. Tool and
    build folders such as `node_modules` are left out, up to 20,000 files per
    folder.
  - With nothing typed, it lists recently opened documents.
  - If nothing matches, it offers to create a draft with that name.
  - Type `>` for commands, and `#` for the current Markdown document's
    headings.
- **Command palette:** Ctrl+Shift+P, or type `>` in the quick switcher. It runs
  any action by name, from Find and Go to line to Convert indentation, Close
  tab or Export backup, with its shortcut shown alongside. The five commands
  run most recently come first, marked *Recently used*.
- **Keyboard shortcuts panel:** F1, `?`, or the `?` button in the header. It
  lists every shortcut, grouped and searchable, with ⌘/⌥ symbols on a Mac.
- **Search everywhere:** Ctrl+Shift+F, or *Search* in the header.
  - **What it covers:** every draft and every file in your open folders.
  - **Options:** match case, whole word and regular expressions.
  - **Narrowing it down:** use *files to include*, for example `*.js, src/`.
    `!` excludes, as in `!*.min.js`, and `src/**/*.vue` also works. With
    folders open, choose *Everything*, *Drafts* or *Open folders*.
  - **Results** are grouped by file, with a preview of each line. Click one to
    open the file with the match selected.
  - **From the editor:** starting a search with text selected searches for it.
  - **What's skipped:** folder files over 2 MB, binary files (recognised by
    their type, such as `.png`, `.zip` or `.woff`, and never read), and tool and
    build folders (`.git`, `node_modules`, `dist`, `build`…). Results stop at
    10,000.
  - **Speed on big projects:** the folders' files are read into memory once (up
    to about 100 MB, starting in the background when the search page opens) and
    kept between searches.
  - **Keeping up with changes:** in Chrome and Edge the open folders are watched
    for changes, which also keeps the sidebar and the quick switcher up to date.
    Elsewhere, each file's size and date are checked instead.
- **Replace across files:** replace every result, or the results in one file.
  - **Only documents change,** never files on disk directly. Each changed file
    keeps a version from before the replace (undo it from *History*), and shows
    as not saved to disk.
  - **Save all** (Ctrl+Alt+S, the button on the search page, or the command
    palette) then writes every changed file. It asks before replacing a file
    that changed on disk.
- **Split the editor:** Ctrl+\\, the *Split* button in the toolbar, or the
  command palette.
  - It shows a second document, or the same one, side by side. Pick what the
    right-hand pane shows from its menu.
  - Edits show in both panes, and each pane undoes its own typing.
  - In the right-hand pane, Ctrl+S saves its document and Ctrl+F searches in it.

## Never losing text

- **Autosave:** saving happens shortly after you stop typing. For a draft, the
  status bar shows *Saving… / Saved / Not saved*. For a file, it shows the
  file's own state first (*Not saved to file* or *Saved to file*); until you
  save, it adds *Edits kept in browser*, so it never says "saved" while the
  file on disk is out of date.
- **Rescue copies:** if the page closes mid-save, a rescue copy is recovered on
  the next visit.
- **When storage fails:** if the browser's storage is full or unavailable, a
  banner says so, and offers to save the text to a file and to try again.
- **Space used:** the start page shows how much space is used. Plumb asks the
  browser to keep its storage when you create or open a document.
- **Other tabs:** documents created or edited in another tab show up live. If two
  tabs change the same document, the other tab's version is kept as a copy.
- **Version history:** *History* in the editor.
  - **When a version is kept:** when you open a file; every few minutes while you
    edit, if the text changed; each time you save to a file; before you restore
    an older version; and whenever you press *Save version…* (optionally with a
    name).
  - **Using a version:** pick one to see what changed since then, restore it, or
    open it as a copy. Restoring can be undone, and the text it replaces is kept
    as a version.
  - **Thinning:** older automatic versions thin out. All from the last hour are
    kept, then one per hour for a day, and one per day for 30 days. Named and
    saved-to-file versions are kept longer.
  - **Deleting** a document forever deletes its history. Closing a folder drops
    the history of its files with no unsaved changes.
- **Trash:** deleted drafts go to the Trash, with an Undo prompt. Restore them, or
  delete them forever. The Trash is emptied after 30 days.
- **Backup:** *Export all* saves all drafts (Trash included), plus any unsaved
  edits to files, as one backup file.
  - *Import backup…* adds them back, and never overwrites existing documents.
  - Files with no unsaved changes aren't in the backup: their text is on disk.

### Where your text is kept, and what can remove it

Your files are on your disk, and nothing in Plumb deletes them. Everything
else (drafts, unsaved edits to files, version history and the Trash) is kept
**in this browser only**. That has some consequences worth knowing:

- **It isn't synced.** Another browser, another browser profile or another
  computer has its own, separate Plumb. To move your drafts, use *Export all*
  on one and *Import backup…* on the other.
- **Clearing the browser's data for the site deletes it.** "Clear browsing
  data" with cookies and site data, or removing the site's data in the
  browser's settings, deletes your drafts, unsaved edits, history and Trash.
  Save or export first.
- **Private and incognito windows** keep nothing once the window closes.
- **The browser may clear it to free disk space**, unless it agreed to keep
  Plumb's storage. When it hasn't agreed, the start page says so under your
  drafts.

**Export a backup now and then** (*Export all* on the start page), and save
anything that matters to a file.

## Settings

Open them with ⚙ in the header, or Ctrl+,. They're kept in this browser and
applied at once.

- **Theme:** same as the system, light or dark.
- **Font:** the system's monospace font, a common coding font (JetBrains Mono,
  Fira Code, Cascadia Code, SF Mono, Consolas…), or any installed font by name,
  with a live sample. Text size too.
- **Keyboard:** standard, or **Vim**.
  - Vim mode has normal, insert and visual modes, motions, operators and
    registers. `:w` saves and `:wa` saves all.
  - The mode shows under the text.
  - Ctrl shortcuts still work.
- **Indentation for new files,** for types with no convention of their own
  (Python keeps 4 spaces; Go and Makefiles keep tabs). Also whether prose and
  code **wrap** by default.
- **Editing helpers:** closing brackets, suggestions, indentation guides, and
  JSON/YAML checking.
- **Saving to files:** trim trailing whitespace, and add a final newline.
- **Follow `.editorconfig`** (on by default). For files opened from a folder, the
  project's `.editorconfig` files decide `indent_style`, `indent_size`,
  `tab_width`, `trim_trailing_whitespace` and `insert_final_newline`, ahead of
  the settings.
  - Nearer files win, and `root = true` stops the search.
  - The status bar shows when the indentation comes from it.
  - A document's own choice in the status bar still comes first.
- **Reload files changed on disk** (on by default; see
  [Live reload](#live-reload)).

## Offline and installing

- **Offline:** after the first visit, all of Plumb (every language included) is
  kept by a service worker, so it opens and works without a connection.
- **Installing:** in Chrome and Edge, an *Install* button appears in the header.
  Once installed, Plumb can open text files from your computer (*Open with*),
  and Save writes back to them.
- **Updates:** when a new version is published, a prompt offers to reload into
  it.

## Browsers

**Plumb works best in Chrome and Edge.** Opening folders, saving straight back
to files and watching them for changes need the browser's File System Access
API. Chrome and Edge have it; Firefox and Safari don't.

| | Chrome, Edge (desktop) | Firefox, Safari (desktop) |
|---|---|---|
| Drafts, with Trash, history and backup | ✓ | ✓ |
| Open single files | ✓, and Save writes back to them | ✓, as drafts; Save downloads a copy that keeps its name, encoding and line endings |
| Folders, Recent files, live reload | ✓ | Not available |
| Works offline | ✓, and installs as an app | ✓ |

In Firefox and Safari, Plumb says what's missing instead of hiding it:

- *Open folder…* is greyed out, with the reason;
- a one-time note explains that Save downloads a copy;
- each download says where it went.

On phones and tablets, Plumb is for reading and light editing of drafts.
On narrow screens the toolbar keeps *Preview*, *Find* and *Save*, and puts the
rest under *More*; the status bar shows the position and save status, with
**⋯** for the encoding, line endings, language, indentation and text size.

## Limits

| | Limit |
|---|---|
| Recent files kept | 20, plus any with unsaved changes |
| Files listed per folder (quick switcher) | 20,000 |
| Folder files searched | Up to 2 MB each; about 100 MB kept in memory |
| Search results | 10,000 |
| Find matches listed | 100,000 |
| Syntax highlighting | Off by default above 5 million characters |
| Spell check | Off by default above 200,000 characters |
| Trash | Emptied after 30 days |
| Browser storage | IndexedDB: hundreds of MB. Where it isn't available, `localStorage`: about 5 MB |

## Keyboard shortcuts

Ctrl means Cmd, and Alt means Option, on a Mac, unless a row says otherwise.
F1 in Plumb lists them all, searchable, in the same groups as here, with the
Mac's ⌘ ⌥ ⇧ symbols on a Mac.

### Documents

| Keys | What it does |
|---|---|
| Ctrl+P | Quick switcher: go to any document, or create one (`>` for commands, `#` for headings) |
| Ctrl+Shift+P | Command palette: run any action by name |
| Ctrl+S / Ctrl+Shift+S | Save (to the file, or as a download in Firefox and Safari) / save as |
| Ctrl+Alt+S | Save all changed files |
| Alt+PageUp / Alt+PageDown | Previous / next tab |
| Ctrl+Shift+F | Search (and replace) in all drafts and folders |
| Ctrl+\\ | Split the editor, or close the split |
| Ctrl+Shift+E | Show or hide the folder sidebar, in any document (also the *Folders* button) |
| Ctrl+, | Settings |
| F1, or ? | Show all keyboard shortcuts (`?` only when you aren't typing in a document) |

### Find

| Keys | What it does |
|---|---|
| Ctrl+F / Ctrl+H | Find / find and replace (every match is highlighted) |
| Enter / Shift+Enter | In the find box: next / previous match |
| Ctrl+Enter | In the replace box: replace all |
| Alt+C / Alt+W / Alt+R | In the find bar: match case / whole word / regular expression |
| Ctrl+G | Go to a line, or `line:column` (or click the position in the status bar) |

### Editing

| Keys | What it does |
|---|---|
| Enter | New line: in code, indented by the language's rules; in text, like the current line; in Markdown lists, the next item |
| Tab / Shift+Tab | Indent at the cursor (a tab or spaces, per the document's setting), or indent / outdent the selected lines |
| Ctrl+] / Ctrl+[ | Indent / outdent the lines |
| Ctrl+/ | Comment or uncomment the lines, in the file type's syntax (`//`, `#`, `--`, `<!-- -->`…) |
| Alt+↑ / Alt+↓ | Move the line(s) up or down |
| Shift+Alt+↑ / Shift+Alt+↓ | Duplicate the line(s) above or below |
| Ctrl+Shift+K | Delete the line(s) |
| Ctrl+Shift+\\ | Jump to the matching bracket |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo (Cmd+Shift+Z on a Mac; Ctrl+Shift+Z also works on Linux) |
| Alt+Z | Word wrap on or off |
| Ctrl+B / Ctrl+I | In Markdown documents: bold / italic. Elsewhere, Ctrl+B shows or hides the folder sidebar |
| Ctrl+Space | Show suggestions (Enter accepts, Escape closes). Ctrl on a Mac too |
| Ctrl+Shift+M / F8 | Show the problems in JSON and YAML / go to the next one |

### Folding

| Keys | What it does |
|---|---|
| Ctrl+Shift+[ / Ctrl+Shift+] | Fold / unfold the block at the cursor (Cmd+Option+[ / ] on a Mac) |
| Ctrl+Alt+[ / Ctrl+Alt+] | Fold all / unfold all. Ctrl on a Mac too |

### Cursors and selection

| Keys | What it does |
|---|---|
| Ctrl+D | Select the next occurrence of the selection (add a cursor there) |
| Ctrl+Shift+L | Select every occurrence of the selection |
| Ctrl+Alt+↑ / Ctrl+Alt+↓ | Add a cursor on the line above or below |
| Ctrl+click / Alt+drag | Add a cursor / select a rectangular block |
| Alt+L | Select the line (Ctrl+L on a Mac) |
| Escape | Back to a single cursor |

## Troubleshooting

**_Open folder…_ is greyed out, or Save downloads a copy instead of writing
the file.** You're in a browser without the File System Access API, such as
Firefox or Safari. Open Plumb in Chrome or Edge for folders and saving back to
files (see [Browsers](#browsers)).

**A file shows _Allow access_ instead of its text.** After a reload, or when
you come back later, the browser asks again before Plumb may read your files.
Press *Allow access* and accept the browser's prompt. Unsaved edits show even
before you do.

**My drafts aren't there in another browser or on another computer.** Drafts
are kept in each browser separately and aren't synced. Use *Export all* where
they are, and *Import backup…* where you want them (see
[Where your text is kept](#where-your-text-is-kept-and-what-can-remove-it)).

**The start page says the browser may clear my documents.** The browser
hasn't agreed to keep Plumb's storage, so it may delete it when the disk gets
full. Export a backup now and then, and save important text to files.
Installing Plumb as an app often makes the browser agree.

**A banner says the text couldn't be saved in the browser.** The browser's
storage is full or unavailable. Save the text to a file from the banner, free
some disk space, then press *Try again*. Your text stays on screen meanwhile.

**A file shows _changed on disk_.** Another program changed it while you had
unsaved edits. *Reload from disk* takes the file's text and keeps yours in
History; *Keep mine* keeps yours, and Save asks before replacing the file (see
[Live reload](#live-reload)).

**Ctrl+B adds stars instead of showing the sidebar.** In Markdown documents,
Ctrl+B means bold. Use Ctrl+Shift+E or the *Folders* button.

**`?` types a question mark instead of showing the shortcuts.** It only opens
the list when you aren't typing in a document. Press F1 instead.

**A file has no colours.** Files over 5 million characters start as plain
text, and some files have no recognised language. Pick a language in the
status bar.

**There's no _Install_ button.** It only appears in browsers that can install
Plumb as an app (Chrome and Edge on the desktop), and not once it's
installed.

## Technical notes

- **No server.** Documents are stored in the browser's IndexedDB, or in
  `localStorage` where IndexedDB isn't available. Documents from earlier
  versions are moved over, and brought up to date, automatically.
- **Hash routing.** `#/` is the start page and `#/edit/:id` edits a draft or a
  file, so no server rewrites are needed. The build runs from any static host
  or subpath.
- **Built with** Vue 3, Vue Router, Vite and CodeMirror 6. The Markdown preview
  uses `marked`, sanitised with DOMPurify.
- **The service worker** (`sw.js`) is generated at build time by `build/pwa.js`,
  and only runs in production builds.
- **More:** the [vision](../VISION.md), how Plumb is
  [tested](../TESTING.md), and the plans for
  [files and drafts](files-and-drafts.md) and [Markdown](markdown.md).
