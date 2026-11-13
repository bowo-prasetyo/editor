import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

// Hash history (#/edit/123) needs no server-side rewrites, so the app
// runs from any static host or local folder.
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    // The editor (with CodeMirror) loads on first use, keeping the list fast.
    { path: '/edit/:id', name: 'edit', component: () => import('./views/EditorView.vue'), props: true },
    // Search across every document and the files in open folders.
    { path: '/search', name: 'search', component: () => import('./views/SearchView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
