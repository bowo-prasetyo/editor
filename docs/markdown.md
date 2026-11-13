# Plan: Markdown as a first-class kind of document

> **Status: done.** This planned step 4 of
> [VISION.md](../VISION.md#next-steps), following the decision in the vision
> ([Markdown is first-class, within limits](../VISION.md#markdown-is-first-class-within-limits)).
> The [decisions](#decisions) are recorded at the end, and both
> [phases](#phases) are built.

## Why

Writers keeping Markdown notes are one of Plumb's core audiences, and drafts
are where notes start. Today a new draft is plain text (`Untitled.txt`), so a
note that starts with `# Meeting notes` is named `Meeting notes.txt`, gets no
Markdown highlighting, and has no preview. Most of the work is already built
(highlighting, a sanitised preview); what's missing is making it the default
and adding a few small helpers for writing.

## What exists today

| | Today |
|---|---|
| New drafts | Named `Untitled.txt`, then after their first line: `Meeting notes.txt` (`src/naming.js`). The quick switcher adds `.txt` to a name with no extension |
| Highlighting | Markdown is highlighted for `.md`, `.markdown` and `.mdown` names (CodeMirror's Markdown language) |
| Preview | A *Preview* button and a palette command for Markdown documents. Off by default, remembered per document (`doc.preview`). Side by side on wide screens. Rendered by `marked` and sanitised by DOMPurify (`src/markdown.js`); links open in a new tab |
| Enter | Keeps the current line's indentation in prose (`newlineKeepIndent` in `src/cm.js`). *Correction, found while building phase 2:* in Markdown documents, CodeMirror's own Markdown keymap (high priority) **already took Enter**: lists continued, but **renumbered the items after the cursor**. Since phase 1 made new drafts Markdown, every new draft did this |
| Ctrl/Cmd+B | Shows or hides the folder sidebar, from anywhere (`App.vue`). Doesn't mean bold |
| Ctrl/Cmd+I | Nothing |
| Pasting a URL | *Correction, found while building phase 2:* CodeMirror's Markdown support **already** made a link when a URL (`http(s)`, `mailto:`, `www.`) was pasted over selected plain text |
| Headings | No outline |

## Principles for this work

These come from the vision and decide the details below:

- **Standard Markdown only.** No wiki links, embeds, front-matter features or
  other syntax. A file written in Plumb reads the same in any other tool.
- **Never reformat.** A helper changes only the text at the cursor, in direct
  response to what the person typed. It never touches other lines, and
  nothing happens on save.
- **Calm.** No new panels and no toolbar of formatting buttons. Helpers live in
  the keyboard and the command palette.
- **No new browser clashes.** Many tempting shortcuts are already the
  browser's: Ctrl/Cmd+Shift+V pastes as plain text, Ctrl/Cmd+Shift+O opens
  Chrome's bookmark manager, and Ctrl/Cmd+Shift+B toggles the bookmarks bar.
  So this plan reuses existing entry points instead of adding shortcuts where
  it can.

## Design

### 1. New drafts are Markdown

- `DEFAULT_NAME` becomes `Untitled.md`, and a draft named after its first
  line keeps `.md`: `# Meeting notes` gives `Meeting notes.md`. Its extension
  follows the draft's current name, as today, so renaming a draft to `.txt`
  keeps it plain text.
- The quick switcher adds `.md`, not `.txt`, to a new draft's name that has no
  extension.
- **Nothing existing is renamed:** drafts keep their names and opened files
  are never touched. Only new drafts change.
- Plain text is valid Markdown, so nothing breaks. Prose settings still apply
  (wrap and spell check on), since `.md` is already treated as prose.
- In Firefox and Safari, *Download* saves `Meeting notes.md`.

### 2. The preview

The preview already exists. This plan only settles how it behaves:

- **It's a toggle, remembered per document**, as today. Whether new drafts
  start with it on is [question 3](#questions-for-the-maintainer).
- **It's side by side on wide screens**, as today. On narrow screens it
  replaces the text, so the toggle switches between writing and reading.
- **It keeps sanitising** everything it renders (DOMPurify), since documents
  can come from anywhere.

### 3. Writing helpers (Markdown documents only)

All of these apply to any Markdown document, draft or file, and nowhere else.
Each is one undoable step.

**Lists continue on Enter.**

| Line | Enter gives |
|---|---|
| `- item` (also `*` and `+`) | a new line `- ` |
| `1. item` (also `1)`) | `2. ` |
| `- [ ] task` or `- [x] done` | `- [ ] ` (a new unchecked task) |
| `> quote` | `> ` |
| An empty item such as `- ` | ends the list: the marker is removed, leaving an empty line |

Indentation and the marker's style are copied from the line, including the
spacing after the marker.

**Ordered lists aren't renumbered.** CodeMirror's own command
(`insertNewlineContinueMarkup`) renumbers the items after the cursor. That
changes lines the person didn't touch, which breaks *Never reformat*. Plumb
uses a small continuation of its own instead (in `src/cm.js`, next to
`newlineKeepIndent`), so only the new line is written. Markdown renders
`1. 2. 2. 3.` as a correct list anyway.

**Bold and italic:** **Ctrl/Cmd+B** and **Ctrl/Cmd+I**.

- With text selected: wrap it in `**…**` or `*…*`. If it's already wrapped,
  unwrap it.
- With nothing selected: insert the pair and put the cursor between them.
- This needs Ctrl/Cmd+B to stop toggling the sidebar in Markdown
  ([question 1](#questions-for-the-maintainer)).

**Pasting a URL over selected text makes a link.** Select `the report`, paste
`https://…`, and you get `[the report](https://…)`.

- Only when the pasted text is a single `http(s)` URL and text is selected.
  Anything else pastes as usual.
- CodeMirror's Markdown package has a similar option (`pasteURLAsLink`). The
  first step is to check whether it already works in Plumb, and whether it
  matches this rule.

**Go to a heading.** Type `#` in the quick switcher (Ctrl/Cmd+P) to list the
current document's headings, indented by level. Pick one to jump to it. The
palette gets a *Go to heading…* command too.

- This is the outline the vision asks for, without a permanent panel or a new
  shortcut (Ctrl/Cmd+Shift+O is the browser's).
- Headings come from the syntax tree, so `#` inside a code block isn't
  mistaken for a heading.

### 4. The sidebar shortcut

With Ctrl/Cmd+B meaning bold in Markdown, the sidebar needs a way that
doesn't clash. The choice is [question 1](#questions-for-the-maintainer).
Either way:

- the folder sidebar gets a visible **toggle button**, next to the folder's
  name, when a folder is open;
- the palette command *Show or hide the folder sidebar* stays;
- the shortcuts panel (F1) and the README say what Ctrl/Cmd+B does where.

## Not in this plan

- **WYSIWYG** editing, or hiding Markdown syntax while typing.
- **Syntax beyond standard Markdown:** wiki links, embeds, front matter, math,
  diagrams, footnote tooling.
- **Formatting toolbars,** or reformatting on save (tables, list numbers,
  wrapping).
- **Export to HTML or PDF.** Printing already prints the preview.
- **Smart quotes** or any other automatic text replacement.

## Phases

Each phase is one PR that ships on its own, with its tests.

1. **Markdown by default, and the shortcut change.**
   - `.md` names for new drafts and quick-switcher drafts.
   - Bold and italic shortcuts.
   - The sidebar shortcut and button.
   - The preview default, as decided.
   - Tests: naming (unit); new drafts are `.md` and get highlighting and the
     preview button; Ctrl/Cmd+B and Ctrl/Cmd+I wrap and unwrap, and do nothing
     in code files; the sidebar opens and closes by its new route (end to end).
2. **Writing helpers.**
   - List continuation (no renumbering), pasting links, and *Go to heading*.
   - Tests:
     - every row of the list table, plus ending a list (unit, on CodeMirror states);
     - other lines are never changed, and an ordered list isn't renumbered;
     - paste only links when there's a selection and a single URL;
     - headings ignore code blocks;
     - typing a list, pasting a link, and jumping to a heading (end to end).

The README, `TESTING.md`, the shortcuts panel and the plan's status are
updated in the phase that changes them.

**Phase 1 is done** (`src/mdedit.js`, `markdownKeys` in `src/cm.js`).
Details settled while building it:

- **The Markdown keys** are added when the loaded language is Markdown,
  whatever the file's name. If the person picks *Plain text* for a `.md`
  file, there are no helpers. They sit above the default keymap, where
  Ctrl/Cmd+I would otherwise select the enclosing syntax.
- **Ctrl/Cmd+B outside Markdown** works as before: `App.vue` toggles the
  sidebar only when the editor hasn't handled the key.
- **The Folders button** sits in the header, not next to the folder's name: a
  hidden sidebar couldn't show its own button. It appears while a folder is
  open and shows whether the sidebar is on (`aria-pressed`).
- **Toggling emphasis** counts stars, so italic on `**bold**` gives
  `***bold***` and back, and bold never takes an italic's star.

## Risks

| Risk | How it's handled |
|---|---|
| People who type plain notes get `.md` names they didn't ask for | Plain text is valid Markdown and the preview stays off by default (if decided so); renaming to `.txt` makes it plain again. Existing drafts keep their names |
| Ctrl/Cmd+B changes meaning for people used to the sidebar | The sidebar gets a visible button, and the shortcuts panel says what changed. With option A of question 1, nothing changes outside Markdown |
| A helper changes text the person didn't mean to | Each helper acts only on the cursor's line or the selection, in response to a key, and is one undo step. Tests check that other lines are untouched |
| The preview renders something unsafe from an opened file | Unchanged: everything is sanitised by DOMPurify, and links open in a new tab |

**Phase 2 is done** (`continueList` and `headings` in `src/mdedit.js`, the
quick switcher's `#`). Details settled while building it:

- **Plumb's Enter wins in Markdown.** Its keys are placed before
  CodeMirror's Markdown support (same precedence: earlier wins), so
  CodeMirror's renumbering Enter never runs. When Plumb's continuation
  declines (outside lists, in a code block, with the cursor inside a marker,
  or with a selection), Enter goes to Plumb's usual Enter.
- **Pasting links** turned out to be CodeMirror's existing `pasteURLAsLink`,
  which matches the plan's rule (selected plain text plus a single URL) and
  also takes `mailto:` and `www.` links. It's kept, with tests.
- **Go to heading** is `#` in the quick switcher, and *Go to heading…* in the
  palette for Markdown documents with headings. The list is indented by
  level and filtered by fuzzy match. Headings come from the fully parsed
  syntax tree, so underlined (setext) headings count and `#` in code blocks
  doesn't.

## Decisions

Settled by the maintainer, as recommended:

1. **Ctrl/Cmd+B** means bold inside Markdown documents, and shows or hides
   the sidebar everywhere else. A visible sidebar button is added.
2. **Markers:** `**bold**` and `*italic*`.
3. **The preview** doesn't start on for new drafts. It's one click away and
   remembered per document.
4. **No shortcut for the preview** for now: Ctrl/Cmd+Shift+V is the browser's
   "paste as plain text".

## The questions as asked

1. **What happens to Ctrl/Cmd+B?**
   - **A (recommended): bold in Markdown, the sidebar everywhere else.** In a
     Markdown document Ctrl/Cmd+B means bold. Anywhere else (the start page,
     code files) it keeps showing or hiding the sidebar, and the sidebar gets a
     visible button. This adds no new shortcut to learn and clashes with no
     browser shortcut. Markdown extensions for VS Code behave the same way.
   - **B: one meaning everywhere.** Ctrl/Cmd+B only ever means bold, and the
     sidebar moves to the button and the palette with no shortcut. Simpler to
     explain, but people lose a shortcut they may use.
   - (Moving the sidebar to a new shortcut was considered. The common
     candidates, Ctrl/Cmd+Shift+B and Ctrl/Cmd+Shift+E, are taken by browsers.)
2. **Bold and italic markers.** Recommended: `**bold**` and `*italic*`, the
   most common forms; editors and renderers all accept them. The alternative,
   `__bold__` and `_italic_`, is equally standard. Plumb only *writes* the
   markers when asked, and reads both.
3. **Should the preview start on for new drafts?** Recommended: **no**. Writing
   comes first and the editor stays calm; one click (or the palette) shows it,
   and it's remembered per document. The alternative is to start new drafts
   with the preview on beside the text on wide screens. That shows Markdown at
   work, but halves the writing space for people who just jot notes.
4. **A shortcut for the preview?** Recommended: **none for now.** The obvious
   one, Ctrl/Cmd+Shift+V as in VS Code, is "paste as plain text" in browsers,
   and that matters when writing. The button and the palette are enough.
