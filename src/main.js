import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { ready } from './store'

// Documents load from IndexedDB asynchronously; show the app once they're in.
ready.then(() => createApp(App).use(router).mount('#app'))
