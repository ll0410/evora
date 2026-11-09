import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isSettingsPatch } from '../config'
import {
  HANDLE_CHANNEL_SET,
  IPC_HANDLE_CHANNELS,
  IPC_PUSH_CHANNELS,
  IPC_SEND_CHANNELS,
  PUSH_CHANNEL_SET,
  SEND_CHANNEL_SET,
  type HandleWhitelistCheck,
  type PushWhitelistCheck,
  type SendWhitelistCheck
} from '../ipc'

// 这些类型别名在编译期保证「合同 = 白名单」，tsc 失败即代表三端合同不一致
export type WhitelistTypeChecks = [
  HandleWhitelistCheck,
  SendWhitelistCheck,
  PushWhitelistCheck
]

describe('IPC 白名单', () => {
  it('通道名唯一', () => {
    for (const channels of [IPC_HANDLE_CHANNELS, IPC_SEND_CHANNELS, IPC_PUSH_CHANNELS]) {
      expect(new Set(channels).size).toBe(channels.length)
    }
  })

  it('运行时集合与常量一致', () => {
    expect(HANDLE_CHANNEL_SET.size).toBe(IPC_HANDLE_CHANNELS.length)
    expect(SEND_CHANNEL_SET.size).toBe(IPC_SEND_CHANNELS.length)
    expect(PUSH_CHANNEL_SET.size).toBe(IPC_PUSH_CHANNELS.length)
  })

  it('至少包含示例通道', () => {
    expect(IPC_HANDLE_CHANNELS).toContain('app:get-version')
    expect(IPC_HANDLE_CHANNELS).toContain('file:read')
    expect(PUSH_CHANNEL_SET.has('update:available')).toBe(true)
  })
})

describe('isSettingsPatch', () => {
  it('接受合法 patch', () => {
    expect(isSettingsPatch({ theme: 'dark' })).toBe(true)
    expect(isSettingsPatch({ autoLaunch: true })).toBe(true)
    expect(isSettingsPatch({ windowBounds: { width: 1000, height: 700, maximized: false } })).toBe(
      true
    )
  })

  it('拒绝未知字段与非法取值', () => {
    expect(isSettingsPatch({})).toBe(false)
    expect(isSettingsPatch({ unknown: 1 })).toBe(false)
    expect(isSettingsPatch({ theme: 'blue' })).toBe(false)
    expect(isSettingsPatch({ autoLaunch: 'yes' })).toBe(false)
    expect(isSettingsPatch({ windowBounds: { width: 10, height: 10, maximized: false } })).toBe(
      false
    )
    expect(isSettingsPatch(DEFAULT_SETTINGS)).toBe(true)
  })
})
