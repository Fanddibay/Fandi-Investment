import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// Kick off session detection before the first navigation lands
const auth = useAuthStore()
auth.init()

app.mount('#app')
