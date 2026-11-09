import type { SettingsSchema } from './config'

/**
 * IPC 合同的唯一来源。
 *
 * 主进程 / Preload / 渲染进程都必须从这里推导通道名、参数与返回值，
 * 禁止在任意一端手写字符串通道名。
 */

export type Platform = 'darwin' | 'win32' | 'linux' | 'other'

export interface FileReadResult {
  path: string
  content: string
  size: number
}

export type RendererLogLevel = 'info' | 'warn' | 'error'

export interface RendererLogEntry {
  level: RendererLogLevel
  message: string
  /** 日志来源，便于区分渲染进程与 Preload；默认 renderer */
  scope?: 'renderer' | 'preload'
}

export interface UpdateInfoPayload {
  version: string
  releaseNotes?: string
}

export interface UpdateProgressPayload {
  percent: number
  transferred: number
  total: number
}

export interface UpdateDownloadedPayload {
  version: string
}

export type UpdateCheckStatus = 'checked' | 'skipped' | 'error'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  message?: string
}

/** invoke / handle 型通道 */
export interface IpcHandleChannels {
  'app:get-version': { args: []; result: string }
  'app:get-platform': { args: []; result: Platform }
  'app:get-log-path': { args: []; result: string }
  'file:read': { args: [path: string]; result: FileReadResult }
  'settings:get-all': { args: []; result: SettingsSchema }
  'settings:set': { args: [patch: Partial<SettingsSchema>]; result: SettingsSchema }
  'window:is-maximized': { args: []; result: boolean }
  'update:check': { args: []; result: UpdateCheckResult }
}

/** send / on 型通道（渲染进程 -> 主进程，无需返回值） */
export interface IpcSendChannels {
  'window:minimize': { args: [] }
  'window:toggle-maximize': { args: [] }
  'window:close': { args: [] }
  'log:write': { args: [entry: RendererLogEntry] }
}

/** 主进程推送型通道（主进程 -> 渲染进程） */
export interface IpcMainToRendererChannels {
  'update:available': { payload: UpdateInfoPayload }
  'update:progress': { payload: UpdateProgressPayload }
  'update:downloaded': { payload: UpdateDownloadedPayload }
  'window:maximized-changed': { payload: { maximized: boolean } }
}

/* -------------------------------------------------------------------------- */
/* 类型工具                                                                    */
/* -------------------------------------------------------------------------- */

export type IpcArgs<C extends keyof IpcHandleChannels> = IpcHandleChannels[C]['args']
export type IpcResult<C extends keyof IpcHandleChannels> = IpcHandleChannels[C]['result']
export type SendArgs<C extends keyof IpcSendChannels> = IpcSendChannels[C]['args']
export type PushPayload<C extends keyof IpcMainToRendererChannels> =
  IpcMainToRendererChannels[C]['payload']

export type IpcHandleChannel = keyof IpcHandleChannels
export type IpcSendChannel = keyof IpcSendChannels
export type IpcPushChannel = keyof IpcMainToRendererChannels

/* -------------------------------------------------------------------------- */
/* 运行时白名单：必须与合同完全一致                                             */
/* -------------------------------------------------------------------------- */

export const IPC_HANDLE_CHANNELS = [
  'app:get-version',
  'app:get-platform',
  'app:get-log-path',
  'file:read',
  'settings:get-all',
  'settings:set',
  'window:is-maximized',
  'update:check'
] as const satisfies readonly IpcHandleChannel[]

export const IPC_SEND_CHANNELS = [
  'window:minimize',
  'window:toggle-maximize',
  'window:close',
  'log:write'
] as const satisfies readonly IpcSendChannel[]

export const IPC_PUSH_CHANNELS = [
  'update:available',
  'update:progress',
  'update:downloaded',
  'window:maximized-changed'
] as const satisfies readonly IpcPushChannel[]

/** 白名单通道的口径类型，用于约束调用方只能使用白名单内的字符串 */
export type WhitelistedHandleChannel = (typeof IPC_HANDLE_CHANNELS)[number]
export type WhitelistedSendChannel = (typeof IPC_SEND_CHANNELS)[number]
export type WhitelistedPushChannel = (typeof IPC_PUSH_CHANNELS)[number]

/**
 * 编译期完整性校验：
 * 若合同新增了通道却没有加入白名单，Exclude 的结果将不是 never，
 * 下面的类型别名会立即报错。
 */
export type MustBeNever<T extends never> = T
export type UnlistedHandleChannels = Exclude<IpcHandleChannel, WhitelistedHandleChannel>
export type UnlistedSendChannels = Exclude<IpcSendChannel, WhitelistedSendChannel>
export type UnlistedPushChannels = Exclude<IpcPushChannel, WhitelistedPushChannel>
export type HandleWhitelistCheck = MustBeNever<UnlistedHandleChannels>
export type SendWhitelistCheck = MustBeNever<UnlistedSendChannels>
export type PushWhitelistCheck = MustBeNever<UnlistedPushChannels>

export const HANDLE_CHANNEL_SET: ReadonlySet<string> = new Set(IPC_HANDLE_CHANNELS)
export const SEND_CHANNEL_SET: ReadonlySet<string> = new Set(IPC_SEND_CHANNELS)
export const PUSH_CHANNEL_SET: ReadonlySet<string> = new Set(IPC_PUSH_CHANNELS)

export function isHandleChannel(value: unknown): value is WhitelistedHandleChannel {
  return typeof value === 'string' && HANDLE_CHANNEL_SET.has(value)
}

export function isSendChannel(value: unknown): value is WhitelistedSendChannel {
  return typeof value === 'string' && SEND_CHANNEL_SET.has(value)
}

export function isPushChannel(value: unknown): value is WhitelistedPushChannel {
  return typeof value === 'string' && PUSH_CHANNEL_SET.has(value)
}
