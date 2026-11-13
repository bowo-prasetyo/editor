<script setup>
// The version, from package.json (see vite.config.js).
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
import { computed } from 'vue'
import { prefs, FONT_SIZES } from '../prefs'
import { FONTS, THEMES, fontName } from '../appearance'
import { SIZES } from '../indentation'
import { PSEUDO, bestLanguage, languageName, languages, t } from '../i18n'
import T from '../components/T'

// The languages to choose from; the pseudo-language (for testing
// translations) only in development, or once chosen.
const languageChoices = computed(() => {
  const list = languages()
  return import.meta.env.DEV || prefs.language === PSEUDO ? [...list, PSEUDO] : list
})
const browserLanguage = computed(() => languageName(bestLanguage(navigator.languages ?? [])))

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
    <h1 class="search-title">{{ t('app.settings') }}</h1>
    <p class="hint">{{ t('settings.intro') }}</p>

    <fieldset class="settings-group">
      <legend>{{ t('settings.appearance') }}</legend>
      <label class="setting">
        <span>{{ t('settings.language') }}</span>
        <select v-model="prefs.language">
          <option value="">{{ t('settings.languageAuto', { language: browserLanguage }) }}</option>
          <option v-for="l in languageChoices" :key="l" :value="l" :lang="l">{{ languageName(l) }}</option>
        </select>
      </label>
      <label class="setting">
        <span>{{ t('settings.theme') }}</span>
        <select v-model="prefs.theme">
          <option v-for="(label, key) in THEMES" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="setting">
        <span>{{ t('settings.font') }}</span>
        <select v-model="fontChoice">
          <option v-for="[value, label] in FONTS" :key="label" :value="value">{{ fontName(label) }}</option>
          <option value="custom">{{ t('settings.anotherFont') }}</option>
        </select>
      </label>
      <label v-if="fontChoice === 'custom'" class="setting">
        <span>{{ t('settings.fontName') }}</span>
        <input v-model.lazy="prefs.font" type="text" spellcheck="false" :placeholder="t('settings.fontNamePlaceholder')" />
      </label>
      <label class="setting">
        <span>{{ t('settings.textSize') }}</span>
        <select v-model.number="prefs.fontSize">
          <option v-for="n in FONT_SIZES" :key="n" :value="n">{{ t('settings.px', { size: n }) }}</option>
        </select>
      </label>
      <pre class="font-sample" :style="{ fontSize: prefs.fontSize + 'px' }" :aria-label="t('settings.fontSample')">{{ sample }}</pre>
      <p class="hint setting-note">{{ t('settings.fontNote') }}</p>
    </fieldset>

    <fieldset class="settings-group">
      <legend>{{ t('settings.editing') }}</legend>
      <label class="setting">
        <span>{{ t('settings.keyboard') }}</span>
        <select v-model="prefs.keymap">
          <option value="standard">{{ t('settings.keyboardStandard') }}</option>
          <option value="vim">Vim</option>
        </select>
      </label>
      <p v-if="prefs.keymap === 'vim'" class="hint setting-note">
        <T k="settings.vimNote" />
      </p>
      <label class="setting">
        <span>{{ t('settings.indentDefault') }}</span>
        <select v-model="indentDefault">
          <option v-for="n in SIZES" :key="'s' + n" :value="`spaces:${n}`">{{ t('indent.spaces', { count: n }) }}</option>
          <option v-for="n in SIZES" :key="'t' + n" :value="`tabs:${n}`">{{ t('indent.tabs', { count: n }) }}</option>
        </select>
      </label>
      <p class="hint setting-note">
        {{ t('settings.indentNote') }}
      </p>
      <label class="setting check"><input v-model="prefs.wrapProse" type="checkbox" /> {{ t('settings.wrapProse') }}</label>
      <label class="setting check"><input v-model="prefs.wrapCode" type="checkbox" /> {{ t('settings.wrapCode') }}</label>
      <label class="setting check"><input v-model="prefs.closeBrackets" type="checkbox" /> {{ t('settings.closeBrackets') }}</label>
      <label class="setting check"><input v-model="prefs.autocomplete" type="checkbox" /> {{ t('settings.autocomplete') }}</label>
      <label class="setting check"><input v-model="prefs.indentGuides" type="checkbox" /> {{ t('settings.indentGuides') }}</label>
      <label class="setting check"><input v-model="prefs.lint" type="checkbox" /> {{ t('settings.lint') }}</label>
    </fieldset>

    <fieldset class="settings-group">
      <legend>{{ t('settings.saving') }}</legend>
      <label class="setting check"><input v-model="prefs.trimOnSave" type="checkbox" /> {{ t('settings.trimOnSave') }}</label>
      <label class="setting check"><input v-model="prefs.finalNewline" type="checkbox" /> {{ t('settings.finalNewline') }}</label>
      <label class="setting check"><input v-model="prefs.editorConfig" type="checkbox" /> <T k="settings.editorConfig" /></label>
      <label class="setting check"><input v-model="prefs.liveReload" type="checkbox" /> {{ t('settings.liveReload') }}</label>
      <p class="hint setting-note">
        {{ t('settings.liveReloadNote') }}
      </p>
      <p class="hint setting-note">
        <T k="settings.editorConfigNote" />
      </p>
    </fieldset>

    <p class="hint app-version">
      {{ t('settings.version', { version }) }} ·
      <a href="https://github.com/bowo-prasetyo/plumb/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">{{ t('settings.whatsNew') }}</a>
    </p>
  </section>
</template>
