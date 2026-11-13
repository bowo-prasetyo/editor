# Plan: Files and Drafts

> **Status: proposed.** This plans step 3 of [VISION.md](../VISION.md#next-steps),
> the split between **Files** and **Drafts**. No code changes yet. The
> [questions](#questions-for-the-maintainer) at the end need a decision before
> phase 1 starts.

## Why

The vision says: **files are the source of truth; the browser holds drafts.**
Today Plumb works differently:

- Opening a file from a folder makes a **permanent browser document** holding a
  **full copy** of the file's text, filed under a made-up folder path such as
  `my-app/src` (`openWorkspaceFile` in `src/workspace.js`).
- Those copies pile up in **All documents**, mixed in with the user's own
  notes, and **stay after the folder is closed**.
- Every copy is a second source of truth that has to be kept in step with
  the disk (live reload, conflict banners, re-linking after a rename).
- "Folder" means two things: a real folder on disk, and a virtual folder for
  documents (`Work/Clients`).

## The model after this work

| | Files | Drafts |
|---|---|---|
| What | A file on disk: from an open folder, or opened on its own | Text that isn't a file yet: new documents, pasted text, notes |
| Where the text lives | **On disk.** The browser keeps only **unsaved edits** and **version history** | In the browser (IndexedDB) |
| Shown in | The folder sidebar, tabs, the quick switcher, search. **Never in the Drafts list** | The **Drafts** list (today's document list), tabs, the quick switcher, search |
| Organised by | The real folder tree | A flat list: search, sort, **pin**. Old virtual folders become read-only **labels** |
| Leaving | Closing a folder **never loses unsaved edits**: save them, or keep them as drafts | Trash (30 days), export as a backup, or **Save to folder…** to make it a file |

## Design

### One kind of record, with a `kind`

Tabs, the editor's per-tab state, version history, sync between tabs, rescue
copies and saving all work on a document record by its id. Replacing that
with a separate store for files would touch nearly every module and put the
data-safety work of the last rounds at risk. Instead, **every record stays a
document**, and gains a field:

- `kind: 'draft'`: kept in full in IndexedDB, as today.
- `kind: 'file'`: stands for a file on disk. It has `source` (`{ root, path }`
  for a file in an open folder) or only a file handle (a file opened on its
  own), as today.

`kind` is derived once in the migration (below) and set when a record is created.

### What a file record stores

The rule is that **the browser keeps only what isn't on disk**:

- **When it has no unsaved changes**, a file record is stored **without its
  text**: id, `kind`, `source`, name, encoding, line endings, editor settings
  and the date of the version on disk. It's a few hundred bytes. The backend
  leaves `content` out when writing it; the change is in `backends.js`, so
  everything above it is unchanged.
- **When it has unsaved changes** (`diskDirty`), it's stored in full, exactly as
  today, so autosave, the rescue copies and sync between tabs keep protecting
  the edits.
- **In memory**, an open file's text is held while it's shown or in a tab, as
  now. A file record loaded at startup without text gets it **from disk when
  it's first shown**.

**After a reload**, the browser asks once for permission to use a folder again
(Plumb already has *Allow access*). Until then, a file with no unsaved
changes can't be shown, because its text is on disk only. The tab shows the
same *Allow access* button in place of the text. Files *with* unsaved changes
show their text at once, as today. (See [question 3](#questions-for-the-maintainer).)

### How long a file record lives

- **In an open folder:** while the folder is open. Records stay after the tab
  is closed, so **version history is kept for the folder's files** and
  reopening a file is instant. They're small.
- **Opened on its own** (with *Open files…*, dropped on the page, or *Open
  with* from the operating system): while it's in a **Recent files** list on
  the start page, the 20 most recent. Dropping out of the list removes the
  record and its history; a file with unsaved changes never drops out.
- **Closing a folder** removes its file records and their history, after the
  close dialog has dealt with any unsaved changes (below).

### Closing a folder (decided in the vision)

If any of the folder's files have unsaved changes, closing it asks:

> **“my-app” has 3 files with unsaved changes.**
> [Save all to disk] [Keep as drafts] [Cancel]

- **Save all to disk** uses the existing *Save all*, with its check for files
  changed on disk meanwhile. If any file isn't saved (cancelled, or an error),
  the folder stays open and says which ones.
- **Keep as drafts** turns each changed file into a draft. Its `kind` becomes
  `'draft'`, and it keeps its text, history and an `origin`:
  `{ folderName, path, handleKey }`. The folder's handle is kept under that key
  so the folder can be recognised later (`isSameEntry`).
- **Cancel** leaves the folder open.

With nothing unsaved, closing just closes, as today. The toast says what
happened: "Closed “my-app”. 3 unsaved files were kept as drafts."

**Reopening that folder later:** if drafts have an `origin` in it, a banner
offers **Put the edits back** (N files):

- if the file is unchanged since the draft was made, the draft becomes a file
  record again with its unsaved edits, as if the folder had never been closed;
- if the file changed on disk meanwhile, it's reattached with the usual
  *changed on disk* banner (*Reload from disk* / *Keep mine*): nothing is
  replaced without asking;
- if the file is gone, the draft stays a draft and says so.

### Drafts

- **The list:** the start page's document list becomes **Drafts** and shows
  only drafts. File records never appear there.
- **Pinning:** `pinned: true` puts a draft at the top of the list, with a pin
  button on each row and a command in the palette.
- **Labels:** today's `doc.folder` is kept as is and shown as a **label**. It's
  read-only: drafts can be filtered by label, and a label can be removed from
  a draft, but no new labels can be made. The folder sidebar of the list
  becomes a short label filter, shown only when labels exist.
  - Removed: *New folder*, *Rename* and *Remove folder*; the 📁 button on rows
    and in the editor; dragging onto folders; `FolderDialog`; the empty
    folders kept in `prefs.folders`.
  - The quick switcher's "`Work/todo.md` creates `todo.md` in Work" becomes a
    plain new draft named `todo.md`.
- **Save to folder…:** for a draft, shown when a folder is open.
  - It picks an open folder and a path, prefilled with the draft's name, and
    creates the file there. It never replaces an existing file; it uses
    `createEntry`.
  - It writes the text in the draft's encoding and line endings. The draft
    then **becomes a file record** in that folder, with its history, and
    leaves the Drafts list. Undo is offered in the toast.
  - With no folder open, *Save as…* does the same with a single file.

### Search and the quick switcher

- **Search** scopes become *Everything*, *Drafts* and *Open folders*.
  - A file record **with unsaved changes** is searched as its edited text.
  - One **without** is searched like any other folder file, through the
    file cache in `filecache.js`. So the search never reads a stale copy.
- **The quick switcher** lists drafts and open folders' files. A file record
  is one of the folder's files, not a separate entry.

### Export and backup

The backup exports drafts and the **unsaved edits of files**. It doesn't
export copies of saved files: their text is on disk. Importing is unchanged.

## Migration (existing data)

The migration runs once, at startup, after the documents load. A `schema`
number in preferences says it has run. It is **non-destructive: it never
deletes text by itself.**

| Existing document | Becomes |
|---|---|
| No file link | A **draft**. Its virtual folder becomes its label |
| From a folder that is **still open** (has `source`, folder in `prefs.workspaces`) | A **file record**. If it has no unsaved changes, its stored copy is dropped *after* the record is rewritten without text. The text is on disk, and History keeps earlier versions |
| From a folder that is **still open**, with unsaved changes | A **file record** with its edits, unchanged |
| From a folder that was **closed**, with unsaved changes | A **draft** with an `origin`, as if *Keep as drafts* had been chosen. Nothing is lost |
| From a folder that was **closed**, no unsaved changes | Kept as a draft and flagged as a **copy of a file** (see below) |
| A file opened on its own (`linked`, no `source`) | A **file record** in **Recent files**, the most recent 20. Older ones without unsaved changes are flagged as copies too |

**Copies of files from closed folders:** these are the pile-up the vision
describes. Plumb can't tell whether the file on disk still matches, since the
folder isn't open, so they aren't removed silently. The Drafts list shows a
one-time banner:

> **27 drafts are copies of files from folders you closed.** Their files are on
> your disk.
> [Move them to the Trash] [Keep them] [Export a backup first]

Moving them to the Trash can be undone for 30 days. *Keep them* turns them into
ordinary drafts and the banner doesn't come back.

**Safety:**
- The migration writes the new record, waits for IndexedDB to confirm it, and
  only then drops anything.
- Every step is covered by unit tests on `fake-indexeddb`, and by an end-to-end
  test that starts from a browser profile made by today's version.

## Phases

Each phase is one PR that ships on its own, with its tests, and leaves Plumb
working.

1. **Records and migration.**
   - Code: the `kind` field; file records stored without text when they have
     no unsaved changes; text read from disk when shown; the Drafts list
     showing drafts only; search and the quick switcher.
   - Migration: everything in the table above, and the *copies* banner.
   - Tests: migration; stored size; permission after reload; search reading
     disk, not copies.
2. **Closing folders.**
   - Code: the close dialog; *Keep as drafts* with `origin`; putting the edits
     back on reopen, with all three outcomes.
   - Tests: each button; a save that fails while closing; reopening with the
     file unchanged, changed or gone.
3. **Drafts.**
   - Code: pinning; labels (read-only) replacing virtual folders, with the
     folder interface removed; *Save to folder…*.
   - Tests: pinning order; label filter and removal; *Save to folder…* never
     replacing a file, its Undo, and its history moving with it.
4. **Files opened on their own.**
   - Code: the **Recent files** list on the start page and its limit of 20,
     including *Open with* from the installed app.
   - Tests: the list, its limit, and that files with unsaved changes never
     drop out.

The README, `TESTING.md` and the in-app help (shortcuts panel, command titles)
are updated in the phase that changes them.

## Risks

| Risk | How it's handled |
|---|---|
| The migration loses text | It never deletes by itself. New records are confirmed before old copies go. Copies from closed folders are offered to the Trash (30 days), with *Export a backup first* |
| A file record without text is shown before its text is read | The editor shows a loading or *Allow access* state, never an empty document that could be autosaved over the file. An end-to-end test covers it |
| Sync between tabs sends a record without text | Messages between tabs keep the in-memory text; only IndexedDB writes leave it out. An end-to-end test covers it |
| A record with no text gets written to disk as empty | `saveDoc` refuses to write a file record whose text hasn't been read. A unit test covers it |
| People miss the virtual folders | They become labels, so nothing disappears. Pinning and search cover the everyday need, as the vision decided |

## Not in this plan

- Markdown as first-class (step 4 in the vision).
- Explaining platform differences in the interface (step 5). In Firefox and
  Safari only drafts and single-file downloads exist. This plan doesn't change
  that, apart from the Drafts name.

## Questions for the maintainer

1. **History of a closed folder's files.** Recommended: remove it when the
   folder is closed (after the dialog), since the files themselves are on disk.
   The alternative is to keep it for 30 days and reattach it if the same folder
   is opened again. That keeps more, but needs a "closed folders" store and a
   cleanup.
2. **Recent files for files opened on their own.** Recommended: yes, the 20
   most recent, on the start page above Drafts. The alternative is to keep them
   only while their tab is open, which is simpler, but reopening means the
   picker again.
3. **After a reload, a file with no unsaved changes needs *Allow access* before
   its text shows.** Recommended: accept it. It's the honest result of keeping
   no copies, it matches *Private by construction*, and unsaved edits still
   show at once. The alternative is to keep a read-only copy for display only,
   which brings back the copies this plan removes.
4. **Copies from closed folders.** Recommended: the one-time banner offering to
   move them to the Trash, as above. The alternative is to leave them as
   ordinary drafts, which is safe but keeps the clutter.
