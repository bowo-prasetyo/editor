import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import EditorView from './views/EditorView.vue'

// Hash history (#/edit/123) needs no server-side rewrites, so the app
// runs from any static host or local folder.
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/edit/:id', name: 'edit', component: EditorView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
