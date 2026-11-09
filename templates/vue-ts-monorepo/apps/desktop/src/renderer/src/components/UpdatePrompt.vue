<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const availableVersion = ref('')
const releaseNotes = ref('')
const progress = ref(0)
const downloadedVersion = ref('')
const message = ref('')
const checking = ref(false)

const unsubscribers: Array<() => void> = [
  window.evora.update.onAvailable((payload) => {
    availableVersion.value = payload.version
    releaseNotes.value = payload.releaseNotes ?? ''
    progress.value = 0
  }),
  window.evora.update.onProgress((payload) => {
    progress.value = Math.round(payload.percent)
  }),
  window.evora.update.onDownloaded((payload) => {
    downloadedVersion.value = payload.version
    progress.value = 100
  })
]

async function checkForUpdates(): Promise<void> {
  checking.value = true
  message.value = ''
  try {
    const result = await window.evora.update.check()
    message.value = result.message ?? (result.status === 'checked' ? '已发起更新检查' : '已跳过')
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    checking.value = false
  }
}

onBeforeUnmount(() => {
  unsubscribers.forEach((unsubscribe) => unsubscribe())
})
</script>

<template>
  <section class="update-panel">
    <div class="update-panel__head">
      <h2>自动更新</h2>
      <button type="button" class="ghost" :disabled="checking" @click="checkForUpdates">
        {{ checking ? '检查中…' : '检查更新' }}
      </button>
    </div>

    <p v-if="!availableVersion && !message" class="muted">
      开发环境不启用 electron-updater；打包并配置 publish 后可在此收到
      <code>update:available</code> 推送。
    </p>

    <div v-if="availableVersion" class="update-panel__body">
      <p>发现新版本 <strong>{{ availableVersion }}</strong></p>
      <p v-if="releaseNotes" class="muted">{{ releaseNotes }}</p>
      <progress v-if="progress > 0" :value="progress" max="100">{{ progress }}%</progress>
      <p v-if="downloadedVersion">版本 {{ downloadedVersion }} 已下载完成，重启后生效。</p>
    </div>

    <p v-if="message" class="muted">{{ message }}</p>
  </section>
</template>
