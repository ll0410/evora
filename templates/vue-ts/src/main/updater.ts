import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdateCheckResult } from '@shared/ipc'
import { pushToRenderer } from './push'

let initialized = false

/** 只有配置了 publish 并完成打包时，electron-builder 才会生成 app-update.yml */
function hasUpdateConfig(): boolean {
  return existsSync(join(process.resourcesPath, 'app-update.yml'))
}

function normalizeReleaseNotes(
  notes: string | Array<{ note: string | null }> | null | undefined
): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  return notes
    .map((item) => item.note)
    .filter((note): note is string => Boolean(note))
    .join('\n')
}

/**
 * electron-updater 接入点。
 * 开发环境（未打包）不初始化，避免出现无意义的更新请求。
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    log.info('[updater] 开发环境跳过自动更新初始化')
    return
  }
  if (!hasUpdateConfig()) {
    log.info('[updater] 未检测到 app-update.yml，跳过自动更新（请先在 electron-builder.yml 配置 publish）')
    return
  }
  if (initialized) return
  initialized = true

  autoUpdater.logger = log
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    log.info(`[updater] 发现新版本 ${info.version}`)
    pushToRenderer(getWindow(), 'update:available', {
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    pushToRenderer(getWindow(), 'update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[updater] 新版本已下载 ${info.version}`)
    pushToRenderer(getWindow(), 'update:downloaded', { version: info.version })
  })
  autoUpdater.on('error', (error) => {
    log.error('[updater] 更新检查失败', error)
  })

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    log.warn('[updater] 启动时检查更新失败', error)
  })
}

export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    return { status: 'skipped', message: '开发环境未启用自动更新（需打包后生效）' }
  }
  if (!hasUpdateConfig()) {
    return { status: 'skipped', message: '未配置更新源（需在 electron-builder.yml 中设置 publish）' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { status: 'checked', message: result?.updateInfo.version }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('[updater] 手动检查更新失败', error)
    return { status: 'error', message }
  }
}
