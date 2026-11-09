import { app } from 'electron'
import log from 'electron-log/main'
import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/** 单个日志文件上限，超过后轮转为 .old（仅保留一份历史） */
const MAX_LOG_BYTES = 5 * 1024 * 1024

export function resolveLogFilePath(): string {
  return join(app.getPath('logs'), 'evora.log')
}

function rotateIfNeeded(filePath: string): void {
  try {
    if (!existsSync(filePath)) return
    const { size } = statSync(filePath)
    if (size < MAX_LOG_BYTES) return
    const archivePath = `${filePath}.old`
    if (existsSync(archivePath)) unlinkSync(archivePath)
    renameSync(filePath, archivePath)
  } catch {
    // 轮转失败不应阻塞应用启动，electron-log 仍会追加写入
  }
}

/**
 * 初始化主进程日志：
 * - 文件输出到 app.getPath('logs')/evora.log
 * - 5MB 轮转，避免无限膨胀
 * - 捕获主进程未处理异常与 Promise 拒绝
 * - 渲染进程日志经 log:write 通道写入同一文件
 */
export function initLogger(): typeof log {
  const filePath = resolveLogFilePath()
  rotateIfNeeded(filePath)

  log.transports.file.resolvePathFn = () => filePath
  log.transports.file.maxSize = MAX_LOG_BYTES
  log.transports.file.level = 'info'
  log.transports.console.level = app.isPackaged ? 'info' : 'debug'

  process.on('uncaughtException', (error) => {
    log.error('[main] uncaughtException', error)
  })
  process.on('unhandledRejection', (reason) => {
    log.error('[main] unhandledRejection', reason)
  })

  log.info(`[main] 日志初始化完成，文件路径：${filePath}`)
  return log
}
