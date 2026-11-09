import Store from 'electron-store'
import { DEFAULT_SETTINGS, type SettingsSchema } from '@shared/config'

export type SettingsStore = Store<SettingsSchema>

/**
 * 类型安全的本地配置存储。
 * schema 同时用于 electron-store 的运行时校验与 TS 类型约束。
 */
export function createSettingsStore(): SettingsStore {
  return new Store<SettingsSchema>({
    name: 'settings',
    defaults: DEFAULT_SETTINGS,
    schema: {
      windowBounds: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number', minimum: 400 },
          height: { type: 'number', minimum: 300 },
          maximized: { type: 'boolean' }
        },
        required: ['width', 'height', 'maximized'],
        additionalProperties: false
      },
      theme: { type: 'string', enum: ['system', 'light', 'dark'] },
      autoLaunch: { type: 'boolean' }
    }
  })
}
