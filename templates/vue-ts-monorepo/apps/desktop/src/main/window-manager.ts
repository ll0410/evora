import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import type { WindowBounds } from '@shared/config'
import type { SettingsStore } from './store'
import { pushToRenderer } from './push'

const MIN_WIDTH = 880
const MIN_HEIGHT = 600
const DEFAULT_WIDTH = 1120
const DEFAULT_HEIGHT = 760
const SAVE_DEBOUNCE_MS = 300

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * 窗口管理：
 * - 创建无边框主窗口（渲染进程自绘标题栏）
 * - 持久化窗口位置、大小与最大化状态
 * - 恢复时校验窗口是否仍位于可见显示器内
 * - 拦截新窗口/外部导航，外链交给系统浏览器
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly store: SettingsStore) {}

  createMainWindow(): BrowserWindow {
    const existing = this.mainWindow
    if (existing && !existing.isDestroyed()) return existing

    const bounds = this.normalizeBounds(this.store.get('windowBounds'))
    const window = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      title: 'Evora',
      backgroundColor: '#0d1117',
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        // 安全基线：三项不可在同一次改动中被单独降级
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false
      }
    })

    this.mainWindow = window

    window.on('ready-to-show', () => {
      if (bounds.maximized) window.maximize()
      window.show()
    })
    window.on('resize', () => this.scheduleSaveBounds())
    window.on('move', () => this.scheduleSaveBounds())
    window.on('maximize', () => {
      this.saveBounds()
      pushToRenderer(window, 'window:maximized-changed', { maximized: true })
    })
    window.on('unmaximize', () => {
      this.saveBounds()
      pushToRenderer(window, 'window:maximized-changed', { maximized: false })
    })
    window.on('close', () => this.flushBounds())
    window.on('closed', () => {
      this.mainWindow = null
      if (this.saveTimer) {
        clearTimeout(this.saveTimer)
        this.saveTimer = null
      }
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      const devUrl = process.env['ELECTRON_RENDERER_URL']
      if (devUrl && url.startsWith(devUrl)) return
      event.preventDefault()
    })

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) {
      void window.loadURL(devUrl)
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
  }

  getWindow(): BrowserWindow | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null
    return this.mainWindow
  }

  showAndFocus(): void {
    const window = this.getWindow() ?? this.createMainWindow()
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  toggleVisibility(): void {
    const window = this.getWindow()
    if (!window) {
      this.showAndFocus()
      return
    }
    if (window.isVisible()) window.hide()
    else this.showAndFocus()
  }

  flushBounds(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.saveBounds()
  }

  private scheduleSaveBounds(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveBounds()
    }, SAVE_DEBOUNCE_MS)
  }

  private saveBounds(): void {
    const window = this.getWindow()
    if (!window) return
    const normal = window.getNormalBounds()
    this.store.set('windowBounds', {
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: window.isMaximized()
    })
  }

  private normalizeBounds(stored: WindowBounds): WindowBounds {
    const width = Math.max(MIN_WIDTH, Math.round(stored.width || DEFAULT_WIDTH))
    const height = Math.max(MIN_HEIGHT, Math.round(stored.height || DEFAULT_HEIGHT))
    const hasPosition = typeof stored.x === 'number' && typeof stored.y === 'number'
    const visible =
      hasPosition &&
      screen.getAllDisplays().some(({ workArea }) => {
        const x = stored.x as number
        const y = stored.y as number
        return (
          x < workArea.x + workArea.width &&
          x + width > workArea.x &&
          y < workArea.y + workArea.height &&
          y + height > workArea.y
        )
      })

    return {
      width,
      height,
      x: visible ? stored.x : undefined,
      y: visible ? stored.y : undefined,
      maximized: Boolean(stored.maximized)
    }
  }
}
