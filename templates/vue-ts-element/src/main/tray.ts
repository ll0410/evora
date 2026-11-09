import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'

let tray: Tray | null = null

export interface TrayActions {
  toggleWindow(): void
  showWindow(): void
  quit(): void
}

/** 系统托盘：左键切换窗口，右键菜单提供显示/退出 */
export function createTray(actions: TrayActions): Tray {
  if (tray) return tray
  const image = nativeImage.createFromPath(icon)
  const size = process.platform === 'darwin' ? 18 : 24
  tray = new Tray(image.resize({ width: size, height: size }))
  tray.setToolTip('Evora')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 / 隐藏主窗口', click: () => actions.toggleWindow() },
      { label: '显示主窗口', click: () => actions.showWindow() },
      { type: 'separator' },
      { label: '退出', click: () => actions.quit() }
    ])
  )
  tray.on('click', () => actions.toggleWindow())
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
