import type { BrowserWindow } from 'electron'
import {
  PUSH_CHANNEL_SET,
  type IpcMainToRendererChannels,
  type PushPayload
} from '@shared/ipc'

/**
 * 主进程推送消息到渲染进程。
 * 通道必须存在于白名单，避免误用未声明的通道名。
 */
export function pushToRenderer<C extends keyof IpcMainToRendererChannels>(
  window: BrowserWindow | null,
  channel: C,
  payload: PushPayload<C>
): void {
  if (!PUSH_CHANNEL_SET.has(channel)) {
    throw new Error(`[evora] 未声明的推送通道：${channel}`)
  }
  if (!window || window.isDestroyed()) return
  window.webContents.send(channel, payload)
}
