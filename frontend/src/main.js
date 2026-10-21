import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import './styles.css';
import App from './App.vue';

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'attendanceTheme',
    themes: {
      attendanceTheme: {
        dark: false,
        colors: {
          primary: '#385e52',
          secondary: '#718278',
          surface: '#ffffff',
          background: '#f5f7f3',
        },
      },
    },
  },
});

createApp(App)
  .use(createPinia())
  .use(vuetify)
  .mount('#app');
