import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import kleur from 'kleur'
import { generateProject } from './generator'
import { resolveCliOptions, type CliInput } from './prompts'
import {
  EvoraError,
  PACKAGE_MANAGERS,
  TEMPLATES,
  isPackageManager,
  isTemplateName,
  relativeFromCwd,
  resolveTemplatesRoot,
  type PackageManager
} from './utils'

export interface ParsedArgv {
  projectName?: string
  template?: string
  packageManager?: string
  description?: string
  git?: boolean
  install?: boolean
  force?: boolean
  yes?: boolean
  help?: boolean
  version?: boolean
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('-')) {
    throw new EvoraError(`参数 ${flag} 缺少取值`, `示例：${flag} vue-ts`)
  }
  return value
}

export function parseArgv(argv: string[]): ParsedArgv {
  const parsed: ParsedArgv = {}
  const positionals: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg === '--version' || arg === '-v') parsed.version = true
    else if (arg === '--yes' || arg === '-y') parsed.yes = true
    else if (arg === '--git') parsed.git = true
    else if (arg === '--no-git') parsed.git = false
    else if (arg === '--install') parsed.install = true
    else if (arg === '--no-install') parsed.install = false
    else if (arg === '--force') parsed.force = true
    else if (arg === '--template') parsed.template = readFlagValue(argv, ++index, '--template')
    else if (arg.startsWith('--template=')) parsed.template = arg.slice('--template='.length)
    else if (arg === '--pm') parsed.packageManager = readFlagValue(argv, ++index, '--pm')
    else if (arg.startsWith('--pm=')) parsed.packageManager = arg.slice('--pm='.length)
    else if (arg === '--description')
      parsed.description = readFlagValue(argv, ++index, '--description')
    else if (arg.startsWith('--description='))
      parsed.description = arg.slice('--description='.length)
    else if (arg.startsWith('-')) {
      throw new EvoraError(`未知参数 ${arg}`, '使用 create-evora --help 查看可用参数')
    } else positionals.push(arg)
  }

  if (positionals.length > 1) {
    throw new EvoraError('只能指定一个项目名', `收到：${positionals.join(' ')}`)
  }
  parsed.projectName = positionals[0]

  if (parsed.template && !isTemplateName(parsed.template)) {
    throw new EvoraError(`未知模板 "${parsed.template}"`, `可选模板：${TEMPLATES.join('、')}`)
  }
  if (parsed.packageManager && !isPackageManager(parsed.packageManager)) {
    throw new EvoraError(
      `未知包管理器 "${parsed.packageManager}"`,
      `可选：${PACKAGE_MANAGERS.join('、')}`
    )
  }

  return parsed
}

function readVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function printHelp(): void {
  console.log(`
${kleur.bold('create-evora')} —— Electron + Vue 3 桌面应用生成器

${kleur.bold('用法')}
  create-evora [项目名] [选项]

${kleur.bold('选项')}
  --template <name>   模板：${TEMPLATES.join(' | ')}（默认 vue-ts）
  --pm <name>         包管理器：${PACKAGE_MANAGERS.join(' | ')}（默认自动检测）
  --description <text> 项目描述
  --no-git            跳过 git init 与初始提交
  --no-install        跳过依赖安装
  --force             覆盖非空目标目录（危险）
  -y, --yes           使用默认值，跳过交互
  -h, --help          显示帮助
  -v, --version       显示版本

${kleur.bold('示例')}
  create-evora my-app
  create-evora my-app --template vue-ts --pm pnpm --no-git --no-install
  create-evora admin --template vue-ts-element --pm pnpm
`)
}

function devCommands(packageManager: PackageManager): string[] {
  const run = packageManager === 'npm' ? 'npm run' : packageManager
  return [`${packageManager} install`, `${run} dev`, `${run} build`]
}

async function run(): Promise<void> {
  const argv = parseArgv(process.argv.slice(2))
  if (argv.help) {
    printHelp()
    return
  }
  if (argv.version) {
    console.log(readVersion())
    return
  }

  const input: CliInput = {
    projectName: argv.projectName,
    template: argv.template,
    packageManager: argv.packageManager,
    description: argv.description,
    git: argv.git,
    install: argv.install,
    force: argv.force,
    yes: argv.yes
  }

  const options = await resolveCliOptions(input)
  const templatesRoot = resolveTemplatesRoot()

  console.log()
  console.log(`${kleur.cyan('◆')} 正在创建 ${kleur.bold(options.projectName)}`)
  console.log(`${kleur.gray('模板')} ${options.template}`)
  console.log(`${kleur.gray('包管理器')} ${options.packageManager}`)
  console.log()

  const result = await generateProject({
    projectName: options.projectName,
    template: options.template,
    packageManager: options.packageManager,
    description: options.description,
    git: options.git,
    install: options.install,
    force: options.force,
    templatesRoot,
    onProgress: (message) => console.log(`${kleur.gray('•')} ${message}`)
  })

  const target = relativeFromCwd(result.targetDir)
  console.log()
  console.log(`${kleur.green('✔')} 项目已创建：${kleur.bold(target)}（${result.fileCount} 个文件）`)
  for (const warning of result.warnings) {
    console.log(`${kleur.yellow('!')} ${warning}`)
  }

  console.log()
  console.log(kleur.bold('下一步'))
  console.log(`  cd ${target}`)
  const commands = devCommands(result.packageManager)
  const startIndex = result.installed ? 1 : 0
  for (const command of commands.slice(startIndex)) {
    console.log(`  ${command}`)
  }
  console.log()
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  run().catch((error: unknown) => {
    if (error instanceof EvoraError) {
      console.error(`${kleur.red('✖')} ${error.message}`)
      if (error.hint) console.error(`  ${kleur.gray(error.hint)}`)
    } else {
      console.error(`${kleur.red('✖')} 未知错误：`, error)
    }
    process.exitCode = 1
  })
}
