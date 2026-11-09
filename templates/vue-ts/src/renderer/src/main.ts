import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

/**
 * 渲染进程全局错误统一经白名单 IPC 写入主进程日志文件。
 * 渲染进程没有 Node 能力，因此不能直接使用 electron-log。
 */
function reportError(level: 'warn' | 'error', message: string): void {
  if (!window.evora?.log) return
  window.evora.log.write({ level, message })
}

window.addEventListener('error', (event) => {
  reportError('error', `window.error: ${event.message} @ ${event.filename}:${event.lineno}`)
})

window.addEventListener('unhandledrejection', (event) => {
  reportError('error', `unhandledrejection: ${String(event.reason)}`)
})

createApp(App).mount('#app')
