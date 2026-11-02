import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import App from './App.svelte'
import './app.css'

// Installs and updates the service worker, so the app opens offline and can be installed.
registerSW({ immediate: true })

export default mount(App, { target: document.getElementById('app')! })
