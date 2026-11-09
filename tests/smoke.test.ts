import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const templatesRoot = fileURLToPath(new URL('../templates', import.meta.url))
const TEMPLATES = ['vue-ts', 'vue-ts-element', 'vue-ts-monorepo'] as const

type TemplateName = (typeof TEMPLATES)[number]

/** monorepo 模板的应用位于 apps/desktop，其余模板即模板根目录 */
function appRoot(template: TemplateName): string {
  return template === 'vue-ts-monorepo'
    ? join(templatesRoot, template, 'apps/desktop')
    : join(templatesRoot, template)
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function readText(path: string): string {
  return readFileSync(path, 'utf8')
}

describe.each(TEMPLATES)('%s 模板静态检查', (template) => {
  const root = appRoot(template)

  it('包含标准的 dev/build/preview/lint/typecheck/test 脚本', () => {
    const pkg = readJson(join(root, 'package.json'))
    expect(pkg.scripts).toMatchObject({
      dev: expect.any(String),
      build: expect.any(String),
      preview: expect.any(String),
      lint: expect.any(String),
      typecheck: expect.any(String),
      test: expect.any(String)
    })
  })

  it('主窗口满足安全基线', () => {
    const source = readText(join(root, 'src/main/window-manager.ts'))
    expect(source).toContain('contextIsolation: true')
    expect(source).toContain('nodeIntegration: false')
    expect(source).toContain('sandbox: true')
    expect(source).toContain('loadFile')
    expect(source).toContain('setWindowOpenHandler')
  })

  it('Preload 只通过 contextBridge 暴露白名单 API', () => {
    const source = readText(join(root, 'src/preload/index.ts'))
    expect(source).toContain('contextBridge.exposeInMainWorld')
    expect(source).not.toContain("exposeInMainWorld('require'")
    expect(source).not.toContain("exposeInMainWorld('ipcRenderer'")
    expect(source).toBeTruthy()
  })

  it('IPC 合同为单一来源且包含示例通道', () => {
    const contractPath =
      template === 'vue-ts-monorepo'
        ? join(templatesRoot, template, 'packages/shared/src/ipc.ts')
        : join(root, 'src/shared/ipc.ts')
    const source = readText(contractPath)
    expect(source).toContain('IpcHandleChannels')
    expect(source).toContain('IpcSendChannels')
    expect(source).toContain('IpcMainToRendererChannels')
    expect(source).toContain("'app:get-version'")
    expect(source).toContain("'file:read'")
    expect(source).toContain('IPC_HANDLE_CHANNELS')
  })

  it('渲染进程启用 CSP 且禁止 eval', () => {
    const html = readText(join(root, 'src/renderer/index.html'))
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("script-src 'self'")
    expect(html).not.toContain("'unsafe-eval'")
  })

  it('electron-builder 配置与调试配置齐备', () => {
    const builder = readText(join(root, 'electron-builder.yml'))
    // monorepo 的调试配置位于模板根目录（路径指向 apps/desktop）
    const vscodeRoot = template === 'vue-ts-monorepo' ? join(templatesRoot, template) : root
    expect(builder).toContain('appId:')
    expect(builder).toContain('icon: build/icon.png')
    expect(existsSync(join(vscodeRoot, '.vscode/launch.json'))).toBe(true)
    expect(existsSync(join(root, 'build/icon.png'))).toBe(true)
  })

  it('包含 electron-store / electron-log / electron-updater 接入', () => {
    const pkg = readJson(join(root, 'package.json'))
    const deps = Object.keys((pkg.dependencies as Record<string, string>) ?? {})
    expect(deps).toEqual(
      expect.arrayContaining(['electron-store', 'electron-log', 'electron-updater'])
    )
  })

  const buildEnabled = process.env.EVORA_SMOKE_BUILD === '1'

  it.runIf(buildEnabled)(
    '安装依赖后可成功执行 pnpm build',
    () => {
      const result = spawnSync('pnpm', ['build'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10 * 60 * 1000
      })
      if (result.status !== 0) {
        throw new Error(`构建失败：\n${result.stdout}\n${result.stderr}`)
      }
      expect(existsSync(join(root, 'out/main/index.js'))).toBe(true)
    },
    10 * 60 * 1000
  )
})
