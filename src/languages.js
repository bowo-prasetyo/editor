// Syntax highlighting: which language a document is in, and loading its
// support. CodeMirror's language list knows about 140+ languages by file
// name; each one is downloaded only when a document needs it.
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

export const AUTO = 'auto'
export const PLAIN = 'plain'

// File names the list doesn't know, mapped to a language it does.
const BY_NAME = {
  makefile: 'Shell',
  gnumakefile: 'Shell',
  '.gitignore': 'Properties files',
  '.dockerignore': 'Properties files',
  '.env': 'Properties files',
  '.bashrc': 'Shell',
  '.zshrc': 'Shell',
  '.profile': 'Shell',
  '.editorconfig': 'Properties files',
}

// Names for the language picker, A to Z.
export const languageNames = languages.map((l) => l.name).sort((a, b) => a.localeCompare(b))

const byName = (n) => languages.find((l) => l.name === n) ?? null

// The language for a document: the one the user picked, or else the one its
// file name suggests. Null means plain text.
export function findLanguage(fileName = '', choice = AUTO) {
  if (choice === PLAIN) return null
  if (choice && choice !== AUTO) return byName(choice) ?? LanguageDescription.matchLanguageName(languages, choice, false)
  const base = fileName.trim().split(/[\\/]/).pop()
  const special = BY_NAME[base.toLowerCase()]
  if (special) return byName(special)
  // Extensions are matched case-sensitively, so also try "SCRIPT.PY" as
  // "script.py" (after the exact name, which keeps "Dockerfile" working).
  return LanguageDescription.matchFilename(languages, base) ?? LanguageDescription.matchFilename(languages, base.toLowerCase())
}

// Load a language's support (cached after the first time). Null if it fails,
// e.g. offline before that language was ever downloaded.
export async function loadLanguage(desc) {
  if (!desc) return null
  try {
    return desc.support ?? (await desc.load())
  } catch (e) {
    console.error(`Couldn't load ${desc.name} highlighting`, e)
    return null
  }
}
