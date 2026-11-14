import { createApp } from 'vue'

// The site now serves the diabetes education assistant (ADR-0005..0012). Harness v1,
// the general OpenRouter chat client (ADR-0001..0003), stays reachable at #/harness.
// Each app loads only its own global stylesheet so their tokens never clash.
if (location.hash === '#/harness') {
  document.body.classList.add('harness') // hides the diabetes app's help button (index.html)
  void Promise.all([import('./App.vue'), import('./style.css')]).then(([m]) =>
    createApp(m.default).mount('#app'),
  )
} else {
  void Promise.all([import('./app/DiabetesApp.vue'), import('./app/app.css')]).then(([m]) =>
    createApp(m.default).mount('#app'),
  )
}
