# Translating Plumb

Every word Plumb shows comes from one file: [`src/locales/en.json`](../src/locales/en.json).
A translation is a copy of that file in another language, next to it. Once
it's there, Plumb offers the language in Settings and picks it for people
whose browser asks for it.

## Languages

| Language | File | State |
|---|---|---|
| English | `en.json` | The source |
| Indonesian (Bahasa Indonesia) | `id.json` | Complete; needs review by native speakers |

A test checks that Indonesian has every message, so a new English message
must be translated before it can be merged. Send corrections as a pull request,
or open an issue quoting the key (for example `home.welcome.drafts`).

### Indonesian

Indonesian has one plural form, so it has only the `_other` keys: "1 berkas",
"3 berkas". Where English says something different for one and for many
("delete it" and "delete them"), the Indonesian is written to fit both.
Words used throughout:

| English | Indonesian | Why |
|---|---|---|
| file | berkas | The standard term (KBBI), as in Firefox and GNOME |
| folder | folder | What everyone says; "map" reads as a geographic map |
| draft | draf | |
| browser | peramban | The standard term, as in Firefox |
| Trash | Tempat Sampah | |
| save / download | Simpan / Unduh | |
| undo / redo | Urungkan / Ulangi | |
| open / go to | Buka / Lompat ke | Kept apart: "Buka…" for Go to would read as Open |
| edit (noun) | suntingan | "perubahan" for changes in general |
| wrap long lines | bungkus baris panjang | "Lipat" is fold, in the editor |
| fold / unfold | lipat / buka lipatan | |
| shortcut | pintasan | |
| command palette | palet perintah | |
| heading | judul bagian | "Judul" alone is a title |
| match case | peka huruf besar/kecil | |
| offline | luring / tanpa internet | "tanpa internet" in sentences, "Luring" in the header |

The second person is the polite *Anda*, as in most Indonesian software.

## Adding a language

1. **Copy** `src/locales/en.json` to `src/locales/<language>.json`, named by
   its [language tag](https://www.w3.org/International/articles/language-tags/):
   `de.json`, `fr.json`, `pt-BR.json`.
2. **Translate the values,** never the keys. A message you leave out is shown
   in English, so a translation can be finished bit by bit.
3. **Try it:** `npm run dev`, then choose the language in Settings. Check the
   screens you translated, on a narrow window too: some languages take a third
   more room than English.
4. **Run the tests** (`npm test`). They check every translation's messages
   take the same placeholders as the English ones.

Nothing else needs changing: the build finds the new file, and only people who
use that language download it (the app keeps it for offline use).

The file is in the **i18next JSON v4** format, which translation tools such as
Weblate, Crowdin and Lokalise read and write directly.

## What's in a message

- **Placeholders** in double braces, `{{name}}`, are filled in by Plumb: a
  file's name, a number, a key like `Ctrl+S`. Keep them as they are, and move
  them wherever your language needs them. Numbers come already written the way
  your language writes them (`1.234` in German).
- **Plural forms** are separate keys that end in the plural category:
  `_one`, `_other` in English, and the forms your language has, from
  [Unicode's list](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html).
  Russian, for example, needs `_one`, `_few`, `_many` and `_other`:

  ```json
  "words_one": "{{count}} слово",
  "words_few": "{{count}} слова",
  "words_many": "{{count}} слов",
  "words_other": "{{count}} слова"
  ```

  Always give `_other`; it's used when nothing more specific fits. Languages
  with one form (Japanese, Chinese…) need only `_other`.
- **Markup:** `<strong>`, `<em>`, `<kbd>` and `<code>`, only around plain text
  and never inside each other. Keep the tags; translate what's between them.
- **Quotation marks** are part of the message (`“{{name}}”`), so use your
  language's own: `„{{name}}“`, `« {{name}} »`, `「{{name}}」`.
- **`codemirror`** holds the editor's own words (its panels and folding),
  keyed by their English text. `$` in them stands for a number.
- **Keys and file names stay in English** where they're names: `Ctrl`, `Shift`,
  `.editorconfig`, `UTF-8`, `LF`.

## Voice

Plumb is calm, plain and specific (see [the brand note](brand.md#voice)):
everyday words over technical ones ("Save", not "Persist"), short sentences,
and saying what happened and what to do next. Keep that voice in your
language rather than translating word for word.

## For developers

- In code, `t('save.saved', { name })` gives a message
  ([`src/i18n.js`](../src/i18n.js)); in a template, `{{ t('…') }}`, or
  `<T k="…" :p="{ … }" />` for a message with markup. Never build a sentence
  from pieces: give translators the whole sentence, with placeholders.
- Pass `count` for anything with a number of things, and give the message
  `_one` and `_other` forms. Never test `n === 1` in code.
- Numbers, dates, sizes and sorting come from [`src/locale.js`](../src/locale.js),
  which follows the language.
- Don't store words: store what something is (a version's kind, a sort order)
  and look up its words when it's shown.
- **The pseudo-language** checks nothing was missed. In a development build,
  choose *Pseudo (testing)* in Settings: every message shows accented, a third
  longer and in ⟦brackets⟧, so English text without brackets wasn't
  translatable, and text that's cut off will be in other languages too. The
  end-to-end tests do the same on every screen (`e2e/i18n.spec.js`), and
  `test/i18n.test.js` fails if the code asks for a message the catalog lacks,
  or the catalog has one nothing uses.

## Not translated yet

- These docs, the README and the web app manifest (its name and description).
- Right-to-left languages (Arabic, Hebrew, Persian) also need the layout
  mirrored; that's still to do.
