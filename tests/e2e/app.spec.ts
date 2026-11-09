import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// Playwright 以 CJS 转译测试文件，这里使用 __dirname 定位模板目录
const appDir = resolve(__dirname, '../../templates/vue-ts')

interface EvoraBridgeShape {
  app: { getVersion(): Promise<string> }
}

test('Electron 应用可启动，并且只暴露白名单 API', async () => {
  const requireFromApp = createRequire(join(appDir, 'package.json'))
  const executablePath = requireFromApp('electron') as unknown as string

  const app = await electron.launch({
    executablePath,
    args: [appDir],
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1')).toContainText('Evora')

    const bridge = await page.evaluate(async () => {
      const api = (window as unknown as { evora?: EvoraBridgeShape }).evora
      return {
        hasEvora: Boolean(api),
        version: api ? await api.app.getVersion() : null,
        hasRequire: 'require' in window,
        hasIpcRenderer: 'ipcRenderer' in window,
        hasProcess: 'process' in window
      }
    })

    expect(bridge.hasEvora).toBe(true)
    expect(bridge.version).toBeTruthy()
    expect(bridge.hasRequire).toBe(false)
    expect(bridge.hasIpcRenderer).toBe(false)
    expect(bridge.hasProcess).toBe(false)
  } finally {
    await app.close()
  }
})
