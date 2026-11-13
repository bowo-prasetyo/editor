# Vision

> **Status: accepted.** This sets the direction for Plumb. Nothing here is
> built yet unless it says so. The [decisions](#decisions) section records what
> has been settled. There are no open questions right now.

## The name

**Plumb.** A plumb line shows what is exactly true and straight. Plumb keeps
your file the same way: true to what it was, plus only the changes you made.

## In one sentence

**The private, zero-install editor for the text files on your own computer.**

Open the page (or the installed app), open a file or a folder, edit it, save it
back. No account, no server, no upload, works offline, and your file comes back
exactly as it went in, except for the changes you made.

## Why this exists

Editing a text file today usually means one of two compromises:

- **Install something**: a desktop editor or an IDE. That's heavy for a config
  file, a README or a log, and not possible on a locked-down or borrowed machine.
- **Use a web tool**: most of them want an account, store your text on their
  servers, or quietly change your file (line endings, encoding, trailing
  whitespace).

The browser can now read and write local files directly. That makes a third
option possible: an editor that is **as easy to reach as a web page and as
trustworthy as a desktop app**. That gap is what Plumb fills.

## Who it's for

In priority order:

1. **People who edit text files on their own computer**: developers making a quick
   change outside their IDE, sysadmins editing config files, writers keeping
   Markdown notes in a folder. They want speed, fidelity and no setup.
2. **People who can't or won't install software**: school and work laptops,
   Chromebooks, a borrowed machine.
3. **People who need a scratchpad**: somewhere to paste, clean up and keep text
   for a while, privately.

Not the target: teams that need collaboration, or developers who want a full
IDE in the browser. vscode.dev and github.dev already serve them well.

## Principles

When features compete, these decide, in this order.

1. **Never lose text.** Every change is kept: on disk, in the browser, or in
   version history. A save that fails is visible. This beats every other
   principle. *(Already strong: see `src/store.js` and the live-reload rules.)*
2. **Faithful to the file.** Encoding, byte-order mark, line endings and
   whitespace are kept unless the user asks for a change. Changes on disk are
   noticed, and nothing is overwritten without asking.
3. **Private by construction.** No server, no account, no analytics. The text
   never leaves the machine. This is a promise, not a setting.
4. **Ready in a second.** Opens instantly, works offline, nothing to configure
   before the first keystroke.
5. **Calm.** Few buttons, plain words, and power available through the keyboard
   and the command palette rather than on screen.

## The product model

**Files are the source of truth. The browser holds drafts.**

| | Files | Drafts |
|---|---|---|
| What | Files and folders on your disk, opened through the browser | Text that isn't a file yet: new documents, pasted text, notes |
| Where the text lives | On disk. The browser keeps only unsaved edits and version history | In the browser (IndexedDB) |
| Format | Whatever the file is | Markdown (`.md`) by default |
| Organised by | The real folder tree | A flat list: search, sort and pin |
| Leaving | Closing a folder never loses unsaved edits: save them to disk or keep them as drafts. Cached copies are cleared | Trash, then deleted after 30 days. Export as a backup, or **Save to folder…** to make it a file |

One word, one meaning: a **folder** is always a folder on disk. Drafts have no
folders of their own. Once something is worth organising, its home is a folder
on disk, and **Save to folder…** gets it there.

> **This changes current behaviour.** Today, every file opened from a folder
> becomes a permanent browser document filed under a fake folder path
> (`src/workspace.js`, `openWorkspaceFile`). Copies pile up in "All documents"
> and stay after the folder is closed. Drafts can also be filed in virtual
> folders. Moving to this model is the first big piece of work this vision
> implies.

## Decisions

### Closing a folder never loses unsaved edits

Closing a folder that has unsaved edits asks first:

- **Save all to disk**: writes every changed file (with the usual check for
  files changed on disk meanwhile).
- **Keep as drafts**: each changed file becomes a draft that **remembers which
  file it came from**. When that folder is opened again, Plumb offers to put the
  edits back into those files.
- **Cancel**: the folder stays open.

Closing a folder with nothing unsaved just closes it.

### Drafts are a flat list, not a filing system

- Drafts are organised by **search, sorting and pinning**, not by folders or labels.
- **Save to folder…** turns a draft into a real file in an open folder (or
  anywhere, with Save as).
- **Migration, so nothing is lost:** each existing virtual folder name becomes a
  read-only **label** on its documents. Labels can be used to filter the list,
  but no new ones can be made.
- If users ask for grouping later, labels can grow from there. Starting without
  them is easy to reverse; taking them away later would not be.

### Markdown is first-class, within limits

**Do:**

- New drafts are named **`.md`**, not `.txt`. Plain text is valid Markdown, so
  nothing breaks, and the preview and highlighting are there from the start.
- The Markdown **preview is a toggle**, side by side on wide screens.
- A few writing conveniences in Markdown files: Enter continues a list or
  checklist; shortcuts for **bold** and *italic*; pasting a URL over selected
  text makes a link; an outline of the headings.

**Don't:**

- No WYSIWYG mode.
- No syntax beyond standard Markdown: no wiki links, embeds or front-matter
  features. A file written in Plumb must read the same in any other tool.
- Never reformat someone's Markdown (see *Faithful to the file*).

**Shortcut clash to fix:** Ctrl/Cmd+B shows or hides the folder sidebar today.
In Markdown files it should mean **bold**, as it does almost everywhere, and the
sidebar needs a shortcut that doesn't clash.

### Firefox and Safari get a smaller promise, kept in full

Plumb works best in Chrome and Edge and says so plainly. Firefox and Safari get
Drafts and single files, with faithful downloads. See [Platforms](#platforms).

## Scope

### In scope: the core

- Open, edit and save files and folders in place, keeping the file exactly as it was.
- Drafts that are kept safely in the browser, with Trash and backup.
- Version history for both.
- Find and replace in a file, and search across an open folder.
- Comfortable editing of code and prose: highlighting, multiple cursors,
  indentation that follows the file, word wrap, spell check.
- Markdown as described in [Decisions](#markdown-is-first-class-within-limits).
- Keyboard first: command palette, quick switcher, optional Vim keys.
- Works offline and installs as an app that can open files from the operating system.

### Out of scope: we will say no

- **Git**, a terminal, running or debugging code.
- **Language servers**, type-aware code completion, refactoring.
- **Extensions or plugins.**
- **Accounts, cloud sync, sharing, real-time collaboration.**
- **Any server-side component**, including telemetry.
- **A filing system for drafts** (folders, nested labels). Folders on disk do that job.

These are good features. They belong to other products. Each one would break a
principle (private, calm, ready in a second) or start a race with full IDEs
that Plumb can't win and doesn't need to.

### Grey zone: decide case by case

Checking JSON and YAML, `.editorconfig`, and the split editor are already built.
They stay as long as they are invisible until wanted and cost nothing at startup.
New features in this category have to pass the filter below.

## How to decide on a new feature

A feature should be able to answer **yes** to all of these:

1. Does it help someone **edit a text file or a draft**? (Not manage a project,
   not run code.)
2. Does it keep every **principle**, especially *Never lose text* and *Private*?
3. Can a new user **ignore it** without noticing it's there?
4. Will it **still make sense** if the user is on a browser that can't open folders?
   If not, how is it explained there?

When an audit or a request suggests a feature, check it against this page first.
If the feature is right but the page is wrong, change the page in the same PR.

## Platforms

**Plumb works best in Chrome and Edge, and says so plainly.** Opening folders,
saving in place and watching for changes depend on the browser's File System
Access API. Chromium browsers have it. Firefox has declined to build it and
Safari hasn't shipped it. That's outside Plumb's control; being honest about it
is not.

- **Chromium browsers (Chrome, Edge, Brave, Opera, Arc), desktop**: the full
  product, including opening folders, saving in place and watching for changes.
- **Firefox and Safari, desktop**: a smaller promise, fully kept (below).
- **Phones and tablets**: reading and light editing of Drafts. On iPhone and
  iPad that means the Safari promise. Not a goal to go further for now.

### The Firefox and Safari promise

**Promised:**

- **Drafts**, fully: Trash, version history, backup, works offline.
- **Single files**: open one (picker or drag and drop), edit it, and Save
  downloads a copy that keeps the original **name, encoding and line endings**.
  *Faithful to the file* still holds, even where *in place* can't.
- **Every principle** except saving in place: never lose text, private, ready
  in a second, calm.

**Not promised:** folders, saving in place, live reload, search across a folder.

### How Plumb says it

Calm, not naggy:

- **Show what's missing; don't hide it.** *Open folder…* appears greyed out,
  with one line of reason: "Opening folders needs Chrome or Edge. Your browser
  can open single files."
- **A one-time, dismissible note** on the first visit, for example: "In Firefox,
  Save downloads a copy. To save straight back to your files, use Chrome or Edge."
- **After a download, say where it went** ("Saved a copy to your Downloads
  folder"), so nobody wonders whether their file changed.
- **The README and the app's description** say "Works best in Chrome and Edge"
  up front.

### What we won't do

- **No workarounds** that imitate folders: no read-only folder upload, no
  folders kept inside the browser's own storage. Each adds a third way files
  can behave. Revisit only if a browser ships the real API.
- **No blocking or nagging.** Drafts with faithful downloads is a good product in
  its own right, and suits the scratchpad audience well.

## What "good shape" looks like

There's no telemetry, by design, so success is judged by things we can check:

- **No reported data loss**, ever. Every data-safety path has an end-to-end test.
- **A file round-trips byte for byte** when nothing was changed (tested across
  encodings and line endings).
- **First keystroke in under a second** on a cold load; works with no network.
- **The README fits on one screen** before the reference sections. If it doesn't,
  the product is getting too big.
- **Feedback comes from users**: issues and discussions, published releases and a
  changelog.

## Next steps

In order:

1. ~~**Agree on this document.**~~ Done: the name (**Plumb**), closing folders,
   drafts, Markdown and the Firefox and Safari promise are decided above.
2. **A stabilisation round, with no new features:** *(first pass done: see
   [TESTING.md](TESTING.md), including the known gaps it found)*
   - End-to-end tests (Playwright) for saving, reloading, conflicts, the page
     closing mid-save, and byte-for-byte file round-trips.
   - Linting in CI.
   - Tests for the screens, starting with `EditorView.vue`.
   - Fix what those tests find: ~~mixed line endings being normalised~~ (fixed).
3. **The Files / Drafts split** described above *(plan: [docs/files-and-drafts.md](docs/files-and-drafts.md))*:
   - ~~files from folders become temporary, with only unsaved edits and history kept~~ (phase 1, done);
   - ~~a one-time cleanup of documents that are copies of folder files~~ (phase 1, done);
   - closing a folder with unsaved edits, as decided;
   - virtual folders become read-only labels; pinning and **Save to folder…** for drafts.
4. **Markdown first-class**: `.md` drafts, the preview toggle, the writing
   conveniences, and moving the sidebar off Ctrl/Cmd+B.
5. **Explain the platform differences**, as described in
   [How Plumb says it](#how-plumb-says-it): greyed-out folder actions with a
   reason, a one-time note, where downloads went, and "Works best in Chrome and
   Edge" in the README and the app's description.
6. **Rewrite the README** as a short user guide, and move the full feature list
   to a separate reference page.
7. **Releases and a changelog**, starting at `0.2.0`.

## Open questions

None right now. New ones go here, and move to [Decisions](#decisions) once settled.
