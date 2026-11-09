import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateProject } from '../packages/create-evora/src/generator'
import {
  EvoraError,
  applyPlaceholders,
  validateProjectName
} from '../packages/create-evora/src/utils'

const templatesRoot = fileURLToPath(new URL('../templates', import.meta.url))
const baseOptions = {
  templatesRoot,
  packageManager: 'pnpm' as const,
  install: false,
  git: false
}

let workDir = ''

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'evora-cli-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('validateProjectName', () => {
  it('接受合法名称（含 scoped 包名）', () => {
    expect(validateProjectName('my-app')).toBe('my-app')
    expect(validateProjectName('app_2')).toBe('app_2')
    expect(validateProjectName('@scope/my-app')).toBe('@scope/my-app')
  })

  it.each(['', '  ', 'MyApp', 'my app', '../evil', 'app/sub', '.hidden', '_private'])(
    '拒绝非法名称 %s',
    (name) => {
      expect(() => validateProjectName(name)).toThrow(EvoraError)
    }
  )
})

describe('applyPlaceholders', () => {
  it('替换已知变量并保留未知变量', () => {
    const output = applyPlaceholders('{{projectName}} / {{description}} / {{unknown}}', {
      projectName: 'demo',
      description: '示例',
      packageManager: 'pnpm'
    })
    expect(output).toBe('demo / 示例 / {{unknown}}')
  })
})

describe('generateProject', () => {
  it('生成 vue-ts 项目并完成变量替换', async () => {
    const targetDir = join(workDir, 'my-app')
    const result = await generateProject({
      ...baseOptions,
      projectName: 'my-app',
      template: 'vue-ts',
      targetDir,
      description: '测试项目描述'
    })

    expect(result.fileCount).toBeGreaterThan(20)
    expect(result.installed).toBe(false)
    expect(result.gitInitialized).toBe(false)

    const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(pkg.name).toBe('my-app')
    expect(pkg.description).toBe('测试项目描述')
    expect(String(pkg.packageManager)).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(pkg.scripts).toMatchObject({
      dev: 'electron-vite dev',
      build: 'electron-vite build',
      typecheck: 'tsc --noEmit',
      test: 'vitest run'
    })

    const readme = readFileSync(join(targetDir, 'README.md'), 'utf8')
    expect(readme).toContain('# my-app')
    expect(readme).toContain('测试项目描述')
    expect(readme).not.toContain('{{projectName}}')

    const html = readFileSync(join(targetDir, 'src/renderer/index.html'), 'utf8')
    expect(html).toContain('<title>my-app</title>')

    const builder = readFileSync(join(targetDir, 'electron-builder.yml'), 'utf8')
    expect(builder).toContain("productName: 'my-app'")

    expect(existsSync(join(targetDir, 'src/main/index.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'src/preload/index.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'src/shared/ipc.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'build/icon.png'))).toBe(true)

    // 模板自带的 lock / node_modules 不会被复制
    expect(existsSync(join(targetDir, 'pnpm-lock.yaml'))).toBe(false)
    expect(existsSync(join(targetDir, 'node_modules'))).toBe(false)
    expect(existsSync(join(targetDir, '.git'))).toBe(false)
  })

  it('支持三个模板变体', async () => {
    for (const template of ['vue-ts', 'vue-ts-element', 'vue-ts-monorepo'] as const) {
      const targetDir = join(workDir, template)
      const result = await generateProject({
        ...baseOptions,
        projectName: template,
        template,
        targetDir
      })
      expect(result.template).toBe(template)
      expect(existsSync(join(targetDir, 'package.json'))).toBe(true)
    }
  })

  it('默认描述可用', async () => {
    const targetDir = join(workDir, 'default-desc')
    await generateProject({
      ...baseOptions,
      projectName: 'default-desc',
      template: 'vue-ts',
      targetDir
    })
    const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf8')) as {
      description: string
    }
    expect(pkg.description).toContain('Evora')
  })

  it('拒绝覆盖非空目录且不破坏原有文件', async () => {
    const targetDir = join(workDir, 'occupied')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'keep.txt'), 'important', 'utf8')

    await expect(
      generateProject({
        ...baseOptions,
        projectName: 'occupied',
        template: 'vue-ts',
        targetDir
      })
    ).rejects.toThrow(/目标目录非空/)

    expect(readFileSync(join(targetDir, 'keep.txt'), 'utf8')).toBe('important')
  })

  it('--force 时允许覆盖非空目录', async () => {
    const targetDir = join(workDir, 'forced')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'stale.txt'), 'old', 'utf8')

    await generateProject({
      ...baseOptions,
      projectName: 'forced',
      template: 'vue-ts',
      targetDir,
      force: true
    })

    expect(existsSync(join(targetDir, 'stale.txt'))).toBe(false)
    expect(existsSync(join(targetDir, 'package.json'))).toBe(true)
  })

  it('拒绝非法模板名', async () => {
    await expect(
      generateProject({
        ...baseOptions,
        projectName: 'bad-template',
        template: 'vue-ts-unknown' as never,
        targetDir: join(workDir, 'bad-template')
      })
    ).rejects.toThrow(/未知模板/)
    expect(existsSync(join(workDir, 'bad-template'))).toBe(false)
  })

  it('拒绝非法包管理器', async () => {
    await expect(
      generateProject({
        ...baseOptions,
        projectName: 'bad-pm',
        template: 'vue-ts',
        targetDir: join(workDir, 'bad-pm'),
        packageManager: 'cnpm' as never
      })
    ).rejects.toThrow(/未知包管理器/)
  })

  it('可选执行 git init', async () => {
    const targetDir = join(workDir, 'git-app')
    const result = await generateProject({
      ...baseOptions,
      projectName: 'git-app',
      template: 'vue-ts',
      targetDir,
      git: true
    })
    expect(result.gitInitialized).toBe(true)
    expect(existsSync(join(targetDir, '.git'))).toBe(true)
  })
})
