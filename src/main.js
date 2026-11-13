import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import './appearance'
import { ready } from './store'
import { migrate } from './migrate'

// Documents load from IndexedDB asynchronously; show the app once they're in
// (and once documents from earlier versions are brought up to date).
ready.then(() => {
  migrate()
  createApp(App).use(router).mount('#app')
})
