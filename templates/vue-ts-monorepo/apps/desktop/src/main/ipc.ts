import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import log from 'electron-log/main'
import {
  HANDLE_CHANNEL_SET,
  type IpcArgs,
  type IpcHandleChannel,
  type IpcResult,
  type Platform,
  type RendererLogEntry,
  type RendererLogLevel
} from '@shared/ipc'
import { isSettingsPatch } from '@shared/config'
import type { WindowManager } from './window-manager'
import type { SettingsStore } from './store'
import { FileAccessError, readTextFileWithin } from './safe-file'
import { checkForUpdatesNow } from './updater'

const LOG_LEVELS: readonly RendererLogLevel[] = ['info', 'warn', 'error']

export interface IpcDependencies {
  windowManager: WindowManager
  store: SettingsStore
}

/**
 * 类型安全的 ipcMain.handle 包装：
 * 通道必须是合同里的 invoke 通道，handler 的参数与返回值由合同推导。
 */
export function typedHandle<C extends IpcHandleChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcArgs<C>
  ) => IpcResult<C> | Promise<IpcResult<C>>
): void {
  if (!HANDLE_CHANNEL_SET.has(channel)) {
    throw new Error(`[evora] 未在合同白名单中声明的 IPC 通道：${channel}`)
  }
  ipcMain.handle(channel, (event, ...args) =>
    handler(event, ...(args as unknown as IpcArgs<C>))
  )
}

function mapPlatform(platform: NodeJS.Platform): Platform {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') return platform
  return 'other'
}

function isRendererLogEntry(value: unknown): value is RendererLogEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.message === 'string' &&
    entry.message.length > 0 &&
    entry.message.length <= 2000 &&
    LOG_LEVELS.includes(entry.level as RendererLogLevel)
  )
}

export function registerIpcHandlers({ windowManager, store }: IpcDependencies): void {
  /* ------------------------------ invoke 通道 ------------------------------ */

  typedHandle('app:get-version', () => app.getVersion())

  typedHandle('app:get-platform', () => mapPlatform(process.platform))

  typedHandle('app:get-log-path', () => log.transports.file.getFile().path)

  typedHandle('file:read', async (_event, requestPath) => {
    const workspace = join(app.getPath('userData'), 'workspace')
    try {
      return await readTextFileWithin(workspace, requestPath)
    } catch (error) {
      if (error instanceof FileAccessError) {
        throw new Error(`[evora] ${error.message}`)
      }
      throw error
    }
  })

  typedHandle('settings:get-all', () => store.store)

  typedHandle('settings:set', (_event, patch) => {
    if (!isSettingsPatch(patch)) {
      throw new Error('[evora] settings:set 收到非法配置')
    }
    store.set(patch)
    return store.store
  })

  typedHandle('window:is-maximized', () => windowManager.getWindow()?.isMaximized() ?? false)

  typedHandle('update:check', () => checkForUpdatesNow())

  /* -------------------------------- send 通道 ------------------------------- */

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('log:write', (_event, entry: unknown) => {
    if (!isRendererLogEntry(entry)) {
      log.warn('[ipc] 忽略非法的渲染进程日志载荷')
      return
    }
    const scope = entry.scope === 'preload' ? 'preload' : 'renderer'
    const message = `[${scope}] ${entry.message}`
    if (entry.level === 'error') log.error(message)
    else if (entry.level === 'warn') log.warn(message)
    else log.info(message)
  })
}
