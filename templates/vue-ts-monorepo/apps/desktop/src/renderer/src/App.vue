<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import type { SettingsSchema } from '@shared/config'

const version = ref('—')
const platform = ref('—')
const logPath = ref('—')
const settings = ref<SettingsSchema | null>(null)
const maximized = ref(false)
const fileContent = ref('')
const errorMessage = ref('')
const loadingFile = ref(false)

let unsubscribeMaximized: (() => void) | null = null

async function loadRuntimeInfo(): Promise<void> {
  try {
    version.value = await window.evora.app.getVersion()
    platform.value = await window.evora.app.getPlatform()
    logPath.value = await window.evora.app.getLogPath()
    settings.value = await window.evora.settings.getAll()
    maximized.value = await window.evora.window.isMaximized()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function readDemoFile(): Promise<void> {
  loadingFile.value = true
  errorMessage.value = ''
  try {
    const result = await window.evora.file.read('welcome.txt')
    fileContent.value = result.content
  } catch (error) {
    fileContent.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingFile.value = false
  }
}

function minimizeWindow(): void {
  window.evora.window.minimize()
}

function toggleMaximizeWindow(): void {
  window.evora.window.toggleMaximize()
}

function closeWindow(): void {
  window.evora.window.close()
}

onMounted(() => {
  void loadRuntimeInfo()
  unsubscribeMaximized = window.evora.window.onMaximizedChanged((payload) => {
    maximized.value = payload.maximized
  })
})

onBeforeUnmount(() => {
  unsubscribeMaximized?.()
})
</script>

<template>
  <div class="app-shell">
    <header class="titlebar">
      <span class="titlebar__brand">Evora</span>
      <span class="titlebar__drag" />
      <div class="titlebar__actions">
        <button type="button" title="最小化" @click="minimizeWindow">─</button>
        <button type="button" title="最大化 / 还原" @click="toggleMaximizeWindow">
          {{ maximized ? '❐' : '□' }}
        </button>
        <button type="button" class="danger" title="关闭" @click="closeWindow">✕</button>
      </div>
    </header>

    <main class="content">
      <section class="hero">
        <p class="eyebrow">Electron + Vue 3 + TypeScript</p>
        <h1>Evora 桌面应用骨架</h1>
        <p class="subtitle">
          安全窗口配置、白名单 Preload、端到端类型安全 IPC、日志与持久化已默认就位。
        </p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>运行环境</h2>
          <dl>
            <div><dt>应用版本</dt><dd>{{ version }}</dd></div>
            <div><dt>平台</dt><dd>{{ platform }}</dd></div>
            <div><dt>主题</dt><dd>{{ settings?.theme ?? '—' }}</dd></div>
            <div class="full"><dt>日志文件</dt><dd class="mono">{{ logPath }}</dd></div>
          </dl>
        </article>

        <article class="card">
          <h2>类型安全 IPC 示例</h2>
          <p>
            主进程启动时会在 <code>userData/workspace</code> 写入示例文件，渲染进程通过
            <code>file:read</code> 通道读取，参数与返回值均有完整类型推导。
          </p>
          <button type="button" class="primary" :disabled="loadingFile" @click="readDemoFile">
            {{ loadingFile ? '读取中…' : '读取 welcome.txt' }}
          </button>
          <pre v-if="fileContent" class="output">{{ fileContent }}</pre>
          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        </article>

        <article class="card">
          <h2>已启用的系统能力</h2>
          <ul class="feature-list">
            <li>无边框窗口 + 自绘标题栏</li>
            <li>窗口位置/大小持久化</li>
            <li>系统托盘与全局快捷键 <code>⌘/Ctrl+Shift+E</code></li>
            <li>单实例锁 + 二次启动聚焦</li>
            <li>electron-log 文件日志（5MB 轮转）</li>
            <li>electron-store 类型安全配置</li>
          </ul>
        </article>
      </section>

      <UpdatePrompt />
    </main>
  </div>
</template>
