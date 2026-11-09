/**
 * 应用配置（electron-store）schema
 *
 * 该文件被主进程与渲染进程共同引用：主进程负责读写，渲染进程只通过
 * 白名单 IPC 获取类型化结果，不直接接触 Node / 文件系统。
 */

export type ThemeMode = 'system' | 'light' | 'dark'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface SettingsSchema {
  windowBounds: WindowBounds
  theme: ThemeMode
  autoLaunch: boolean
}

export const DEFAULT_SETTINGS: SettingsSchema = {
  windowBounds: {
    width: 1120,
    height: 760,
    maximized: false
  },
  theme: 'system',
  autoLaunch: false
}

export const SETTINGS_KEYS = ['windowBounds', 'theme', 'autoLaunch'] as const

export type SettingsKey = (typeof SETTINGS_KEYS)[number]

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (!isRecord(value)) return false
  const { x, y, width, height, maximized } = value
  if (x !== undefined && !isFiniteNumber(x)) return false
  if (y !== undefined && !isFiniteNumber(y)) return false
  if (!isFiniteNumber(width) || width < 400) return false
  if (!isFiniteNumber(height) || height < 300) return false
  return typeof maximized === 'boolean'
}

/**
 * 主进程对渲染进程传入的 settings patch 做二次校验。
 * 只接受已知字段与合法取值，忽略未知字段。
 */
export function isSettingsPatch(value: unknown): value is Partial<SettingsSchema> {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (keys.length === 0) return false
  return keys.every((key) => {
    switch (key) {
      case 'windowBounds':
        return isWindowBounds(value[key])
      case 'theme':
        return THEME_MODES.includes(value[key] as ThemeMode)
      case 'autoLaunch':
        return typeof value[key] === 'boolean'
      default:
        return false
    }
  })
}
