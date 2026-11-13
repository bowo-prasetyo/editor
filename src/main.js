import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import './appearance'
import { ready } from './store'
import { migrate } from './migrate'
import { prefs } from './prefs'
import { registerCatalogs, useLanguage } from './i18n'
import { watch } from 'vue'

// Translations other than English (built in) load when chosen.
registerCatalogs(
  Object.fromEntries(
    Object.entries(import.meta.glob(['./locales/*.json', '!./locales/en.json'], { import: 'default' })).map(
      ([path, load]) => [path.match(/([^/]+)\.json$/)[1], load],
    ),
  ),
)

// Documents load from IndexedDB asynchronously; show the app once they're in
// (and once documents from earlier versions are brought up to date), in the
// user's language.
Promise.all([ready, useLanguage(prefs.language)]).then(() => {
  migrate()
  createApp(App).use(router).mount('#app')
  watch(() => prefs.language, (choice) => useLanguage(choice))
})
