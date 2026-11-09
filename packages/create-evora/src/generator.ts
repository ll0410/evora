import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  EvoraError,
  assertTemplateAvailable,
  copyTemplate,
  defaultTargetDir,
  detectPackageManagerVersion,
  initializeGit,
  installArgs,
  isPackageManager,
  PACKAGE_MANAGERS,
  prepareTargetDir,
  runCommand,
  updatePackageJson,
  validateProjectName,
  type PackageManager,
  type TemplateName
} from './utils'

export interface GenerateOptions {
  projectName: string
  template: TemplateName
  /** 模板根目录（templates/ 所在目录） */
  templatesRoot: string
  targetDir?: string
  packageManager?: PackageManager
  description?: string
  git?: boolean
  install?: boolean
  force?: boolean
  onProgress?: (message: string) => void
}

export interface GenerateResult {
  projectName: string
  template: TemplateName
  targetDir: string
  packageManager: PackageManager
  packageManagerField?: string
  fileCount: number
  installed: boolean
  gitInitialized: boolean
  gitCommitted: boolean
  warnings: string[]
}

/**
 * 生成项目：
 * 1. 校验项目名与模板
 * 2. 准备（并保护）目标目录
 * 3. 复制模板 + 替换占位符 + 修正 package.json
 * 4. 可选安装依赖、git init
 * 任何写入阶段的失败都会清理半成品目录后抛出可操作错误。
 */
export async function generateProject(options: GenerateOptions): Promise<GenerateResult> {
  const projectName = validateProjectName(options.projectName)
  const template = assertTemplateAvailable(options.templatesRoot, options.template)
  if (options.packageManager !== undefined && !isPackageManager(options.packageManager)) {
    throw new EvoraError(
      `未知包管理器 "${options.packageManager}"`,
      `可选值：${PACKAGE_MANAGERS.join('、')}`
    )
  }
  const packageManager: PackageManager = options.packageManager ?? 'pnpm'
  const targetDir = resolve(options.targetDir ?? defaultTargetDir(projectName))
  const description =
    options.description?.trim() || '基于 Evora 的 Electron + Vue 桌面应用'
  const onProgress = options.onProgress ?? (() => {})
  const warnings: string[] = []

  // 目录冲突检查必须在写入之前完成，避免误删用户已有内容
  prepareTargetDir(targetDir, Boolean(options.force))

  const pmVersion = detectPackageManagerVersion(packageManager)
  const packageManagerField = pmVersion ? `${packageManager}@${pmVersion}` : undefined
  if (!packageManagerField) {
    warnings.push(`未能检测到 ${packageManager} 版本，已跳过 package.json 的 packageManager 字段`)
  }

  try {
    onProgress(`复制模板 ${template} -> ${targetDir}`)
    const fileCount = copyTemplate(join(options.templatesRoot, template), targetDir, {
      projectName,
      description,
      packageManager
    })

    updatePackageJson(targetDir, { name: projectName, description, packageManagerField })

    let installed = false
    if (options.install) {
      onProgress(`使用 ${packageManager} 安装依赖（可能需要几分钟）`)
      await runCommand(packageManager, installArgs(packageManager), targetDir)
      installed = true
    }

    let gitInitialized = false
    let gitCommitted = false
    if (options.git) {
      onProgress('初始化 git 仓库')
      const gitResult = await initializeGit(targetDir)
      gitInitialized = gitResult.initialized
      gitCommitted = gitResult.committed
      if (gitResult.warning) warnings.push(gitResult.warning)
    }

    return {
      projectName,
      template,
      targetDir,
      packageManager,
      packageManagerField,
      fileCount,
      installed,
      gitInitialized,
      gitCommitted,
      warnings
    }
  } catch (error) {
    // 清理半成品目录；prepareTargetDir 已确保该目录由本次生成创建或清空
    rmSync(targetDir, { recursive: true, force: true })
    if (error instanceof EvoraError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new EvoraError(
      `生成项目失败：${message}`,
      '半成品目录已清理。请检查网络与包管理器后重试；若需保留现场请使用 --no-install 并手动安装依赖'
    )
  }
}
