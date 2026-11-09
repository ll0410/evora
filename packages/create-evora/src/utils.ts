import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEMPLATES = ['vue-ts', 'vue-ts-monorepo', 'vue-ts-element'] as const
export type TemplateName = (typeof TEMPLATES)[number]

export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

/** 需要跳过的模板产物目录 / 文件 */
const SKIPPED_ENTRIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.turbo',
  '.DS_Store',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock'
])

/** 用于替换模板占位符的变量集合 */
export interface TemplateVars {
  projectName: string
  description: string
  packageManager: string
  [key: string]: string
}

export class EvoraError extends Error {
  readonly hint?: string

  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'EvoraError'
    this.hint = hint
  }
}

export function isTemplateName(value: string): value is TemplateName {
  return (TEMPLATES as readonly string[]).includes(value)
}

export function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value)
}

/**
 * 校验 npm 包名 / 项目名。
 * 允许 scoped 包名（@scope/name），统一要求小写，禁止路径分隔符与空白。
 */
export function validateProjectName(rawName: string): string {
  const name = rawName.trim()
  if (!name) {
    throw new EvoraError('项目名不能为空', '请传入项目名，例如：create-evora my-app')
  }
  if (name.length > 214) {
    throw new EvoraError('项目名过长（最多 214 个字符）')
  }
  if (name.startsWith('.') || name.startsWith('_')) {
    throw new EvoraError(`非法的项目名 "${name}"`, '项目名不能以 "." 或 "_" 开头')
  }
  if (name !== name.toLowerCase()) {
    throw new EvoraError(`非法的项目名 "${name}"`, '项目名必须全部小写')
  }
  const pattern = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
  if (!pattern.test(name)) {
    throw new EvoraError(
      `非法的项目名 "${name}"`,
      '项目名只能包含小写字母、数字、"-"、"_"、"."，且不能包含空格或路径分隔符'
    )
  }
  return name
}

/** 由项目名推导默认创建目录（scoped 包名只取最后一段） */
export function defaultTargetDir(projectName: string, cwd = process.cwd()): string {
  const segment = projectName.includes('/') ? projectName.split('/')[1] : projectName
  return resolve(cwd, segment)
}

export function isDirectoryEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true
  return readdirSync(dir).length === 0
}

/** 创建目标目录；非空目录必须显式 --force */
export function prepareTargetDir(targetDir: string, force: boolean): void {
  if (existsSync(targetDir)) {
    if (!isDirectoryEmpty(targetDir) && !force) {
      throw new EvoraError(
        `目标目录非空：${targetDir}`,
        '请更换项目名/目录，或显式传入 --force 覆盖（该目录内容会被清空）'
      )
    }
    if (force) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  }
  mkdirSync(targetDir, { recursive: true })
}

function isTextBuffer(buffer: Buffer): boolean {
  // 含 NUL 字节视为二进制（模板中的 png/ico 等资源）
  return !buffer.includes(0)
}

export function applyPlaceholders(content: string, vars: TemplateVars): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key]
    return value === undefined ? match : value
  })
}

/**
 * 递归复制模板，替换文本文件中的占位符，跳过产物目录与 lock 文件。
 * 返回复制的文件数量。
 */
export function copyTemplate(templateDir: string, targetDir: string, vars: TemplateVars): number {
  let fileCount = 0

  const walk = (sourceDir: string, destDir: string): void => {
    mkdirSync(destDir, { recursive: true })
    for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
      if (SKIPPED_ENTRIES.has(entry.name)) continue
      const sourcePath = join(sourceDir, entry.name)
      const destPath = join(destDir, entry.name)
      if (entry.isDirectory()) {
        walk(sourcePath, destPath)
        continue
      }
      if (!entry.isFile()) continue
      const buffer = readFileSync(sourcePath)
      if (isTextBuffer(buffer)) {
        const replaced = applyPlaceholders(buffer.toString('utf8'), vars)
        writeFileSync(destPath, replaced, 'utf8')
      } else {
        copyFileSync(sourcePath, destPath)
      }
      fileCount += 1
    }
  }

  walk(templateDir, targetDir)
  return fileCount
}

export interface PackageJsonUpdate {
  name: string
  description?: string
  packageManagerField?: string
}

/** 更新生成项目根 package.json 的 name / description / packageManager */
export function updatePackageJson(targetDir: string, update: PackageJsonUpdate): void {
  const pkgPath = join(targetDir, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new EvoraError(`模板缺少 package.json：${pkgPath}`, '模板可能已损坏，请重新安装 create-evora')
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
  pkg.name = update.name
  if (update.description) pkg.description = update.description
  if (update.packageManagerField) {
    pkg.packageManager = update.packageManagerField
  } else {
    delete pkg.packageManager
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

/** 解析模板根目录：环境变量 > 打包内置 templates > 仓库根 templates */
export function resolveTemplatesRoot(
  explicitRoot?: string,
  moduleUrl: string = import.meta.url
): string {
  const packageRoot = resolve(dirname(fileURLToPath(moduleUrl)), '..')
  const candidates = [
    explicitRoot,
    process.env.EVORA_TEMPLATES_DIR,
    join(packageRoot, 'templates'),
    join(packageRoot, '..', '..', 'templates')
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const root = resolve(candidate)
    if (TEMPLATES.every((template) => existsSync(join(root, template, 'package.json')))) {
      return root
    }
  }

  throw new EvoraError(
    '未找到模板目录',
    `已尝试：${candidates.join('、')}；可设置环境变量 EVORA_TEMPLATES_DIR 指向 templates 目录`
  )
}

export function assertTemplateAvailable(templatesRoot: string, template: string): TemplateName {
  if (!isTemplateName(template)) {
    throw new EvoraError(
      `未知模板 "${template}"`,
      `可选模板：${TEMPLATES.join('、')}`
    )
  }
  const templateDir = join(templatesRoot, template)
  if (!existsSync(join(templateDir, 'package.json'))) {
    throw new EvoraError(`模板目录缺失：${templateDir}`)
  }
  return template
}

export function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env
    })
    child.on('error', (error) => {
      rejectPromise(
        new EvoraError(
          `执行 ${command} 失败：${error.message}`,
          `请确认 ${command} 已安装并在 PATH 中可用`
        )
      )
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(
        new EvoraError(
          `${command} ${args.join(' ')} 退出码 ${code}`,
          `可进入目标目录手动执行：${command} ${args.join(' ')}`
        )
      )
    })
  })
}

export function detectPackageManagerVersion(packageManager: PackageManager): string | null {
  const result = spawnSync(packageManager, ['--version'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return null
  const version = result.stdout.trim()
  return /^\d+\.\d+\.\d+/.test(version) ? version : null
}

export function detectPackageManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent ?? ''
  for (const pm of PACKAGE_MANAGERS) {
    if (userAgent.startsWith(`${pm}/`)) return pm
  }
  return 'pnpm'
}

export interface GitResult {
  initialized: boolean
  committed: boolean
  warning?: string
}

export async function initializeGit(targetDir: string): Promise<GitResult> {
  await runCommand('git', ['init'], targetDir)
  await runCommand('git', ['add', '-A'], targetDir)
  try {
    await runCommand('git', ['commit', '-m', 'chore: initial commit from create-evora'], targetDir)
    return { initialized: true, committed: true }
  } catch {
    return {
      initialized: true,
      committed: false,
      warning:
        'git init 成功，但初始提交失败（通常是未配置 user.name / user.email）。请配置后手动执行 git commit。'
    }
  }
}

/** 安装依赖时使用的包管理器命令与参数 */
export function installArgs(packageManager: PackageManager): string[] {
  return packageManager === 'yarn' ? [] : ['install']
}

export function templateDisplayName(template: TemplateName): string {
  const names: Record<TemplateName, string> = {
    'vue-ts': 'Vue 3 + TypeScript（electron-vite 单仓）',
    'vue-ts-element': 'Vue 3 + TypeScript + Element Plus',
    'vue-ts-monorepo': 'Vue 3 + TypeScript（pnpm Workspaces + Turborepo）'
  }
  return names[template]
}

export function relativeFromCwd(targetDir: string): string {
  const relative = resolve(targetDir).replace(`${process.cwd()}/`, '')
  return relative || basename(targetDir)
}
