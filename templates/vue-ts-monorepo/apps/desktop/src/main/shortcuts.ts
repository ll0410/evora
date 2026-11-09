import { globalShortcut } from 'electron'
import log from 'electron-log/main'

const TOGGLE_ACCELERATOR = 'CommandOrControl+Shift+E'

/**
 * 全局快捷键：显示 / 隐藏主窗口。
 * 注册失败（被其他应用占用）时只记录警告，不阻塞启动。
 */
export function registerGlobalShortcuts(toggleWindow: () => void): void {
  const registered = globalShortcut.register(TOGGLE_ACCELERATOR, toggleWindow)
  if (registered) {
    log.info(`[shortcut] 已注册全局快捷键 ${TOGGLE_ACCELERATOR}`)
  } else {
    log.warn(`[shortcut] 全局快捷键 ${TOGGLE_ACCELERATOR} 注册失败（可能已被占用）`)
  }
}

/** 退出前统一注销，避免快捷键残留 */
export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}
