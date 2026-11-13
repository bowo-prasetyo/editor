<script setup>
// The version, from package.json (see vite.config.js).
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
import { computed } from 'vue'
import { prefs, FONT_SIZES } from '../prefs'
import { FONTS, THEMES } from '../appearance'
import { SIZES } from '../indentation'

// Settings for this browser. Changes apply at once and are kept here.
const fontChoice = computed({
  get: () => (FONTS.some(([v]) => v === prefs.font) ? prefs.font : 'custom'),
  set: (v) => {
    if (v !== 'custom') prefs.font = v
    else if (FONTS.some(([f]) => f === prefs.font)) prefs.font = 'monospace'
  },
})
const indentDefault = computed({
  get: () => `${prefs.indentDefault.type}:${prefs.indentDefault.size}`,
  set: (v) => {
    const [type, size] = v.split(':')
    prefs.indentDefault = { type, size: +size }
  },
})
const sample = 'function hello(name) {\n\treturn `Hello, ${name}!` // 0O1lI|\n}'
</script>

<template>
  <section class="settings-page">
    <h1 class="search-title">Settings</h1>
    <p class="hint">Settings apply at once and are kept in this browser. A document's own choices (from its status bar) come first.</p>

    <fieldset class="settings-group">
      <legend>Appearance</legend>
      <label class="setting">
        <span>Theme</span>
        <select v-model="prefs.theme">
          <option v-for="(label, key) in THEMES" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="setting">
        <span>Font</span>
        <select v-model="fontChoice">
          <option v-for="[value, label] in FONTS" :key="label" :value="value">{{ label }}</option>
          <option value="custom">Another font…</option>
        </select>
      </label>
      <label v-if="fontChoice === 'custom'" class="setting">
        <span>Font name</span>
        <input v-model.lazy="prefs.font" type="text" spellcheck="false" placeholder="e.g. Iosevka" />
      </label>
      <label class="setting">
        <span>Text size</span>
        <select v-model.number="prefs.fontSize">
          <option v-for="n in FONT_SIZES" :key="n" :value="n">{{ n }} px</option>
        </select>
      </label>
      <pre class="font-sample" :style="{ fontSize: prefs.fontSize + 'px' }" aria-label="Font sample">{{ sample }}</pre>
      <p class="hint setting-note">A font must be installed on this computer; if it isn't, the system's monospace font is used.</p>
    </fieldset>

    <fieldset class="settings-group">
      <legend>Editing</legend>
      <label class="setting">
        <span>Keyboard</span>
        <select v-model="prefs.keymap">
          <option value="standard">Standard</option>
          <option value="vim">Vim</option>
        </select>
      </label>
      <p v-if="prefs.keymap === 'vim'" class="hint setting-note">
        Normal, insert and visual modes, motions, operators, registers, <code>:w</code> to save… The mode shows under the text.
        Shortcuts with Ctrl/Cmd still work.
      </p>
      <label class="setting">
        <span>Indentation for new files</span>
        <select v-model="indentDefault">
          <option v-for="n in SIZES" :key="'s' + n" :value="`spaces:${n}`">{{ n }} spaces</option>
          <option v-for="n in SIZES" :key="'t' + n" :value="`tabs:${n}`">Tabs ({{ n }} wide)</option>
        </select>
      </label>
      <p class="hint setting-note">
        For files whose indentation can't be detected and whose type has no convention (Python uses 4 spaces, Go and Makefiles tabs).
      </p>
      <label class="setting check"><input v-model="prefs.wrapProse" type="checkbox" /> Wrap long lines in prose (text, Markdown)</label>
      <label class="setting check"><input v-model="prefs.wrapCode" type="checkbox" /> Wrap long lines in code</label>
      <label class="setting check"><input v-model="prefs.closeBrackets" type="checkbox" /> Close brackets and quotes in code</label>
      <label class="setting check"><input v-model="prefs.autocomplete" type="checkbox" /> Suggestions while typing in code (Ctrl+Space always works)</label>
      <label class="setting check"><input v-model="prefs.indentGuides" type="checkbox" /> Indentation guides in code</label>
      <label class="setting check"><input v-model="prefs.lint" type="checkbox" /> Check JSON and YAML for mistakes</label>
    </fieldset>

    <fieldset class="settings-group">
      <legend>Saving to files</legend>
      <label class="setting check"><input v-model="prefs.trimOnSave" type="checkbox" /> Trim trailing whitespace (not in Markdown)</label>
      <label class="setting check"><input v-model="prefs.finalNewline" type="checkbox" /> Add a final newline</label>
      <label class="setting check"><input v-model="prefs.editorConfig" type="checkbox" /> Follow the project's <code>.editorconfig</code></label>
      <label class="setting check"><input v-model="prefs.liveReload" type="checkbox" /> Reload files changed on disk</label>
      <p class="hint setting-note">
        When a file changes outside Plumb, its document takes the new text, unless you have changes not saved to it:
        then you choose. Off: you're asked each time.
      </p>
      <p class="hint setting-note">
        For files opened from a folder, <code>.editorconfig</code> files decide indentation, trailing whitespace and the final newline
        (<code>indent_style</code>, <code>indent_size</code>, <code>tab_width</code>, <code>trim_trailing_whitespace</code>,
        <code>insert_final_newline</code>), ahead of the settings above.
      </p>
    </fieldset>

    <p class="hint app-version">
      Plumb {{ version }} ·
      <a href="https://github.com/bowo-prasetyo/plumb/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">What’s new</a>
    </p>
  </section>
</template>
