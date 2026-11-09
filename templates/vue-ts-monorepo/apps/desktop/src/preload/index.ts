import { contextBridge, ipcRenderer } from 'electron'
import {
  HANDLE_CHANNEL_SET,
  PUSH_CHANNEL_SET,
  SEND_CHANNEL_SET,
  type IpcArgs,
  type IpcHandleChannel,
  type IpcMainToRendererChannels,
  type IpcResult,
  type IpcSendChannel,
  type SendArgs
} from '@shared/ipc'
import type { EvoraApi } from '@shared/api'

/**
 * Preload 只暴露窗口白名单 API，绝不暴露 require / ipcRenderer / process。
 * sandbox: true 时该文件被 electron-vite 打包为 CommonJS。
 */

function assertAllowed(channel: string, allowed: ReadonlySet<string>): void {
  if (!allowed.has(channel)) {
    throw new Error(`[evora] 拒绝未在合同白名单中的 IPC 通道：${channel}`)
  }
}

function invoke<C extends IpcHandleChannel>(
  channel: C,
  ...args: IpcArgs<C>
): Promise<IpcResult<C>> {
  assertAllowed(channel, HANDLE_CHANNEL_SET)
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<C>>
}

function send<C extends IpcSendChannel>(channel: C, ...args: SendArgs<C>): void {
  assertAllowed(channel, SEND_CHANNEL_SET)
  ipcRenderer.send(channel, ...args)
}

function subscribe<C extends keyof IpcMainToRendererChannels>(
  channel: C,
  listener: (payload: IpcMainToRendererChannels[C]['payload']) => void
): () => void {
  assertAllowed(channel, PUSH_CHANNEL_SET)
  const handler = (
    _event: Electron.IpcRendererEvent,
    payload: IpcMainToRendererChannels[C]['payload']
  ): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: EvoraApi = {
  app: {
    getVersion: () => invoke('app:get-version'),
    getPlatform: () => invoke('app:get-platform'),
    getLogPath: () => invoke('app:get-log-path')
  },
  file: {
    read: (path) => invoke('file:read', path)
  },
  settings: {
    getAll: () => invoke('settings:get-all'),
    set: (patch) => invoke('settings:set', patch)
  },
  window: {
    minimize: () => send('window:minimize'),
    toggleMaximize: () => send('window:toggle-maximize'),
    close: () => send('window:close'),
    isMaximized: () => invoke('window:is-maximized'),
    onMaximizedChanged: (listener) => subscribe('window:maximized-changed', listener)
  },
  update: {
    check: () => invoke('update:check'),
    onAvailable: (listener) => subscribe('update:available', listener),
    onProgress: (listener) => subscribe('update:progress', listener),
    onDownloaded: (listener) => subscribe('update:downloaded', listener)
  },
  log: {
    write: (entry) => send('log:write', entry)
  }
}

contextBridge.exposeInMainWorld('evora', api)

// sandbox 中无法直接使用 electron-log，Preload 日志经白名单通道交给主进程写入同一文件
send('log:write', {
  level: 'info',
  message: 'contextBridge 白名单 API 已就绪',
  scope: 'preload'
})
