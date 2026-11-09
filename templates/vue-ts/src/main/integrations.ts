import { app } from 'electron'
import log from 'electron-log/main'
import { resolve } from 'node:path'

/** 自定义协议 scheme，需与 electron-builder.yml 的 protocols 配置保持一致 */
export const PROTOCOL_SCHEME = 'evora'

/**
 * 自定义协议注册（骨架）。
 * - 打包后由操作系统直接传递 evora://xxx
 * - 开发模式下需要把 Electron 可执行文件与入口脚本作为参数注册
 */
export function registerProtocolClient(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [resolve(process.argv[1])])
    return
  }
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
}

/** 在这里解析并分发协议请求（deep link / OAuth 回调等） */
export function handleProtocolUrl(url: string): void {
  log.info(`[protocol] 收到自定义协议请求：${url}`)
}

/**
 * 开机自启接入点。
 * 对应设置项 settings.autoLaunch，用户可在业务侧提供开关。
 */
export function applyAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
    log.info(`[auto-launch] 开机自启：${enabled ? '开启' : '关闭'}`)
  } catch (error) {
    log.warn('[auto-launch] 当前平台设置失败', error)
  }
}

/**
 * 文件关联接入点（骨架）。
 *
 * 1. 在 electron-builder.yml 中声明：
 *    fileAssociations:
 *      - ext: evora
 *        name: Evora Document
 *        role: Editor
 * 2. macOS 通过 open-file 事件接收双击文件：
 *    app.on('open-file', (event, path) => { event.preventDefault(); ... })
 * 3. Windows / Linux 从 process.argv 中解析文件路径（需处理单实例二次启动）。
 */
export function registerFileAssociations(): void {
  log.info('[file-association] 文件关联为骨架实现，参考本函数注释进行扩展')
}
