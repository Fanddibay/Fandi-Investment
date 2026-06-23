import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import Assets from '@/views/Assets.vue'
import AssetDetail from '@/views/AssetDetail.vue'
import News from '@/views/News.vue'
import Settings from '@/views/Settings.vue'
import Login from '@/views/Login.vue'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { public: true } },
  { path: '/', name: 'Dashboard', component: Dashboard },
  { path: '/assets', name: 'Assets', component: Assets },
  { path: '/asset/:id', name: 'AssetDetail', component: AssetDetail },
  { path: '/news', name: 'News', component: News },
  { path: '/settings', name: 'Settings', component: Settings },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (auth.loading) {
    await auth.init()
  }

  const isPublic = to.meta.public === true

  if (!isPublic && !auth.isAuthenticated) {
    return { name: 'Login' }
  }

  if (isPublic && auth.isAuthenticated) {
    return { name: 'Dashboard' }
  }
})
