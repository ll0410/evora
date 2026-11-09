import prompts, { type PromptObject } from 'prompts'
import {
  EvoraError,
  PACKAGE_MANAGERS,
  TEMPLATES,
  detectPackageManager,
  isPackageManager,
  isTemplateName,
  templateDisplayName,
  validateProjectName,
  type PackageManager,
  type TemplateName
} from './utils'

export interface CliInput {
  projectName?: string
  template?: string
  packageManager?: string
  description?: string
  git?: boolean
  install?: boolean
  force?: boolean
  yes?: boolean
}

export interface ResolvedOptions {
  projectName: string
  template: TemplateName
  packageManager: PackageManager
  description: string
  git: boolean
  install: boolean
  force: boolean
}

function assertTemplate(value: string): TemplateName {
  if (!isTemplateName(value)) {
    throw new EvoraError(`未知模板 "${value}"`, `可选模板：${TEMPLATES.join('、')}`)
  }
  return value
}

function assertPackageManager(value: string): PackageManager {
  if (!isPackageManager(value)) {
    throw new EvoraError(`未知包管理器 "${value}"`, `可选：${PACKAGE_MANAGERS.join('、')}`)
  }
  return value
}

/** 交互模式：逐项询问；非交互模式（含 --yes 或非 TTY）使用参数与默认值 */
export async function resolveCliOptions(input: CliInput): Promise<ResolvedOptions> {
  const interactive = Boolean(process.stdin.isTTY) && !input.yes

  const template = assertTemplate(input.template ?? 'vue-ts')
  const packageManager = assertPackageManager(input.packageManager ?? detectPackageManager())
  const description = input.description ?? '基于 Evora 的 Electron + Vue 桌面应用'

  if (!interactive) {
    if (!input.projectName) {
      throw new EvoraError(
        '非交互模式下必须提供项目名',
        '示例：create-evora my-app --template vue-ts --pm pnpm --no-git --no-install'
      )
    }
    return {
      projectName: validateProjectName(input.projectName),
      template,
      packageManager,
      description,
      git: input.git ?? true,
      install: input.install ?? true,
      force: input.force ?? false
    }
  }

  const questions: PromptObject[] = []
  if (!input.projectName) {
    questions.push({
      type: 'text',
      name: 'projectName',
      message: '项目名称',
      initial: 'my-evora-app',
      validate: (value: string) => {
        try {
          validateProjectName(value)
          return true
        } catch (error) {
          return error instanceof Error ? error.message : '项目名非法'
        }
      }
    })
  }

  const answers = await prompts(
    [
      ...questions,
      {
        type: 'select',
        name: 'template',
        message: '选择模板',
        initial: Math.max(
          0,
          TEMPLATES.indexOf(template)
        ),
        choices: TEMPLATES.map((name) => ({
          title: name,
          description: templateDisplayName(name),
          value: name
        }))
      },
      {
        type: 'select',
        name: 'packageManager',
        message: '选择包管理器',
        initial: Math.max(
          0,
          PACKAGE_MANAGERS.indexOf(packageManager)
        ),
        choices: PACKAGE_MANAGERS.map((name) => ({ title: name, value: name }))
      },
      {
        type: 'text',
        name: 'description',
        message: '项目描述',
        initial: description
      },
      {
        type: 'toggle',
        name: 'git',
        message: '初始化 git 仓库？',
        initial: input.git ?? true,
        active: '是',
        inactive: '否'
      },
      {
        type: 'toggle',
        name: 'install',
        message: '安装依赖？',
        initial: input.install ?? true,
        active: '是',
        inactive: '否'
      }
    ],
    {
      onCancel: () => {
        throw new EvoraError('已取消创建')
      }
    }
  )

  const projectName = validateProjectName(
    input.projectName ?? (answers.projectName as string | undefined) ?? ''
  )

  return {
    projectName,
    template: (answers.template as TemplateName | undefined) ?? template,
    packageManager:
      (answers.packageManager as PackageManager | undefined) ?? packageManager,
    description: ((answers.description as string | undefined) ?? description).trim() ||
      description,
    git: (answers.git as boolean | undefined) ?? input.git ?? true,
    install: (answers.install as boolean | undefined) ?? input.install ?? true,
    force: input.force ?? false
  }
}
