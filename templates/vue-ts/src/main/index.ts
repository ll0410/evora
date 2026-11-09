import { BrowserWindow, app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { initLogger } from './logger'
import { createSettingsStore, type SettingsStore } from './store'
import { WindowManager } from './window-manager'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts'
import { buildApplicationMenu } from './menu'
import { initAutoUpdater } from './updater'
import {
  applyAutoLaunch,
  handleProtocolUrl,
  registerFileAssociations,
  registerProtocolClient
} from './integrations'

let windowManager: WindowManager | null = null
let store: SettingsStore | null = null

/** 主进程准备一个受控的演示目录，file:read 只能读取该目录内的文件 */
async function ensureDemoWorkspace(): Promise<void> {
  const workspace = join(app.getPath('userData'), 'workspace')
  await mkdir(workspace, { recursive: true })
  const demoFile = join(workspace, 'welcome.txt')
  if (!existsSync(demoFile)) {
    await writeFile(
      demoFile,
      [
        '这是 Evora 主进程写入的示例文件。',
        '',
        '渲染进程只能通过 window.evora.file.read() 读取它：',
        '主进程会校验路径必须位于 userData/workspace 内。'
      ].join('\n'),
      'utf8'
    )
  }
}

async function bootstrap(): Promise<void> {
  const log = initLogger()
  app.setAppUserModelId('com.evora.desktop')
  log.info(`[main] Evora ${app.getVersion()} 启动（Electron ${process.versions.electron}）`)

  store = createSettingsStore()
  await ensureDemoWorkspace()

  registerProtocolClient()
  registerFileAssociations()
  applyAutoLaunch(store.get('autoLaunch'))

  windowManager = new WindowManager(store)
  // 先注册 IPC，确保 Preload 在窗口加载时发送的日志不会丢失
  registerIpcHandlers({ windowManager, store })
  windowManager.createMainWindow()

  buildApplicationMenu(() => windowManager?.toggleVisibility())
  createTray({
    toggleWindow: () => windowManager?.toggleVisibility(),
    showWindow: () => windowManager?.showAndFocus(),
    quit: () => app.quit()
  })
  registerGlobalShortcuts(() => windowManager?.toggleVisibility())
  initAutoUpdater(() => windowManager?.getWindow() ?? null)

  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    log.info(`[open-file] 收到文件：${filePath}`)
  })

  log.info('[main] 应用初始化完成')
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  // 第二次启动：直接退出，由已运行实例接管
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    windowManager?.showAndFocus()
    const protocolUrl = argv.find((arg) => arg.startsWith('evora://'))
    if (protocolUrl) handleProtocolUrl(protocolUrl)
  })

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      console.error('[main] 启动失败', error)
      app.quit()
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager?.createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    // macOS 习惯：关闭窗口后应用继续驻留托盘
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    unregisterGlobalShortcuts()
    destroyTray()
  })
}
