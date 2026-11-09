import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron'

/** 本地应用菜单示例，同时提供日志目录入口，方便用户反馈问题 */
export function buildApplicationMenu(toggleWindow: () => void): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push(
    {
      label: '文件',
      submenu: [
        {
          label: '显示 / 隐藏主窗口',
          accelerator: 'CommandOrControl+Shift+E',
          click: () => toggleWindow()
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开日志目录',
          click: () => {
            void shell.openPath(app.getPath('logs'))
          }
        },
        {
          label: 'Electron 文档',
          click: () => {
            void shell.openExternal('https://www.electronjs.org/docs/latest')
          }
        }
      ]
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
