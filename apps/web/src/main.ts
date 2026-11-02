import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import App from './App.vue';
import './style.css';

createApp(App)
  .use(PrimeVue, {
    license: import.meta.env.VITE_PRIMEUI_LICENSE,
    theme: { preset: Aura, options: { darkModeSelector: false } },
  })
  .mount('#app');
