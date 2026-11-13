# Vision

> **Status: draft.** This proposes a direction for Plumb. Nothing here is
> built yet unless it says so. Sections marked **Open question** need a decision
> from the maintainer before work starts.

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
trustworthy as a desktop app**. That gap is what this project fills.

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
| Organised by | The real folder tree | A simple list, with optional labels |
| Leaving | Closing a folder clears its unsaved edits (after a warning) and its cached copies | Trash, then deleted after 30 days. Export as a backup |

One word, one meaning: a **folder** is always a folder on disk. Grouping drafts
uses something else, such as labels.

> **This changes current behaviour.** Today, every file opened from a folder
> becomes a permanent browser document filed under a fake folder path
> (`src/workspace.js`, `openWorkspaceFile`). Copies pile up in "All documents"
> and stay after the folder is closed. Moving to this model is the first big
> piece of work this vision implies.

## Scope

### In scope: the core

- Open, edit and save files and folders in place, keeping the file exactly as it was.
- Drafts that are kept safely in the browser, with Trash and backup.
- Version history for both.
- Find and replace in a file, and search across an open folder.
- Comfortable editing of code and prose: highlighting, multiple cursors,
  indentation that follows the file, Markdown preview, word wrap, spell check.
- Keyboard first: command palette, quick switcher, optional Vim keys.
- Works offline and installs as an app that can open files from the operating system.

### Out of scope: we will say no

- **Git**, a terminal, running or debugging code.
- **Language servers**, type-aware code completion, refactoring.
- **Extensions or plugins.**
- **Accounts, cloud sync, sharing, real-time collaboration.**
- **Any server-side component**, including telemetry.

These are good features. They belong to other products. Each one would break a
principle (private, calm, ready in a second) or start a race with full IDEs
that this project can't win and doesn't need to.

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

- **Chromium browsers (Chrome, Edge, Brave, Opera, Arc), desktop**: the full
  product, including opening folders, saving in place and watching for changes.
- **Firefox and Safari, desktop**: Drafts, plus opening files and saving them as
  downloads. The interface should **say plainly** what's missing and why, rather
  than hiding it.
- **Phones and tablets**: reading and light editing of Drafts. Not a goal to go
  further for now.

> **Open question:** Is "Drafts mode" on Firefox and Safari good enough to
> promise, or should the product say plainly that it works best in Chromium browsers?

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

1. **Agree on this document.** Settle the open questions. *(The name is decided:
   **Plumb**. A plumb line shows what is exactly true, as the file stays true
   to itself.)*
2. **A stabilisation round, with no new features:**
   - End-to-end tests (Playwright) for saving, reloading, conflicts, the page
     closing mid-save, and byte-for-byte file round-trips.
   - Linting in CI.
   - Tests for the screens, starting with `EditorView.vue`.
3. **The Files / Drafts split** described above, including a one-time cleanup of
   documents that are copies of folder files.
4. **Explain the platform differences** in the interface.
5. **Rewrite the README** as a short user guide, and move the full feature list
   to a separate reference page.
6. **Releases and a changelog**, starting at `0.2.0`.

## Open questions

- **Drafts and labels.** Do drafts need grouping at all, or is search plus a
  sorted list enough? Today's virtual folders would become labels, or go away.
- **Closing a folder with unsaved edits.** Offer to save them, keep them as
  drafts, or both?
- **Markdown.** Should Markdown be a first-class kind of document (a draft
  starting with `#` is named `.md`, with preview), given that writers are part
  of the audience?
