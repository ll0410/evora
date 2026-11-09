/// <reference types="vite/client" />

import type { EvoraApi } from '@shared/api'

declare global {
  interface Window {
    /** 由 Preload 通过 contextBridge 暴露的白名单 API */
    evora: EvoraApi
  }
}

export {}
