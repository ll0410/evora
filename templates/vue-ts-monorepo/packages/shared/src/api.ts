import type { SettingsSchema } from './config'
import type {
  FileReadResult,
  Platform,
  RendererLogEntry,
  UpdateCheckResult,
  UpdateDownloadedPayload,
  UpdateInfoPayload,
  UpdateProgressPayload
} from './ipc'

export type Unsubscribe = () => void

/**
 * Preload 暴露给渲染进程的 window.evora 类型。
 * Preload 实现该接口，渲染进程通过 env.d.ts 声明获得完整推导。
 */
export interface EvoraApi {
  app: {
    getVersion(): Promise<string>
    getPlatform(): Promise<Platform>
    getLogPath(): Promise<string>
  }
  file: {
    read(path: string): Promise<FileReadResult>
  }
  settings: {
    getAll(): Promise<SettingsSchema>
    set(patch: Partial<SettingsSchema>): Promise<SettingsSchema>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChanged(listener: (payload: { maximized: boolean }) => void): Unsubscribe
  }
  update: {
    check(): Promise<UpdateCheckResult>
    onAvailable(listener: (payload: UpdateInfoPayload) => void): Unsubscribe
    onProgress(listener: (payload: UpdateProgressPayload) => void): Unsubscribe
    onDownloaded(listener: (payload: UpdateDownloadedPayload) => void): Unsubscribe
  }
  log: {
    write(entry: RendererLogEntry): void
  }
}
