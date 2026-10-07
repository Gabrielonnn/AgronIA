import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './style.css'
import App from './App.vue'
import { useMainStore } from './stores'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 🚀 Inicializa el store ANTES de montar
const store = useMainStore(pinia)
store.init().then(() => {
  app.mount('#app')
})