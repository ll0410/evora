# Evora

Evora 是一个 **Electron + Vue 3 + TypeScript** 桌面应用脚手架，把安全窗口配置、端到端类型安全的 IPC 合同、日志与持久化等最佳实践固化为默认值，并提供一个可直接使用的 CLI 生成器。

```bash
npm create evora@latest my-app
# 或
pnpm create evora my-app
```

## 特性

- 安全基线：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、白名单 Preload、CSP 禁止 eval
- 类型安全 IPC：合同单一来源，主进程 / Preload / 渲染进程三端共享同一份类型定义
- 桌面系统集成：无边框窗口、窗口位置/大小持久化、系统托盘、全局快捷键、单实例锁、应用菜单
- 可观测性：electron-log 统一日志（主进程 / Preload / 渲染进程），5MB 自动轮转，异常捕获
- 类型安全配置：electron-store + JSON Schema 双重校验
- 打包与更新：electron-builder 配置、electron-updater 接入点与更新交互组件
- 工程化：electron-vite、ESLint、Prettier、simple-git-hooks、Vitest、Playwright、GitHub Actions

## 环境要求

- Node.js >= 20.19.0（Vite 8 要求）
- pnpm >= 9（推荐 10）
- macOS / Windows / Linux

## 快速开始

### 使用 CLI 生成项目

```bash
# 在仓库内构建 CLI
pnpm install
pnpm build:cli

# 交互式生成
node packages/create-evora/dist/index.js my-app

# 非交互
node packages/create-evora/dist/index.js my-app \
  --template vue-ts --pm pnpm --no-git --no-install
```

发布到 npm 后即可使用 `npm create evora@latest my-app`（包名 `create-evora`）。

CLI 参数：

| 参数 | 说明 |
| --- | --- |
| `--template <name>` | `vue-ts` / `vue-ts-element` / `vue-ts-monorepo`，默认 `vue-ts` |
| `--pm <name>` | `pnpm` / `npm` / `yarn` / `bun`，默认自动检测 |
| `--description <text>` | 项目描述，写入 README 与 package.json |
| `--no-git` | 跳过 `git init` 与初始提交 |
| `--no-install` | 跳过依赖安装 |
| `--force` | 允许覆盖非空目标目录（会清空该目录） |
| `-y, --yes` | 非交互，使用默认值 |
| `-h, --help` / `-v, --version` | 帮助 / 版本 |

生成规则：

- 复制 `templates/<template>` 到目标目录，替换 `{{projectName}}`、`{{description}}`、`{{packageManager}}`
- 重写生成项目 `package.json` 的 `name`、`description`、`packageManager`
- 不复制模板中的 lock 文件、`node_modules`、`dist`、`out`
- 非空目录默认拒绝；任何写入阶段失败都会清理半成品目录并给出可操作提示

### 直接运行某个模板

```bash
cd templates/vue-ts
pnpm install
pnpm dev
```

> 模板使用自带的 `pnpm-workspace.yaml` 作为独立项目根，避免在仓库内误用上层 workspace。
> pnpm 10 默认阻止依赖构建脚本，模板已通过 `onlyBuiltDependencies` 放行 `electron`；
> 若 Electron 二进制未下载，可执行 `node node_modules/electron/install.js`。

## 模板矩阵

| 模板 | 适用场景 | 关键差异 |
| --- | --- | --- |
| `vue-ts` | 大多数中小型桌面应用 | 单仓 electron-vite，最小依赖 |
| `vue-ts-element` | 后台管理型桌面端 | 集成 Element Plus（完整引入 + 暗色主题） |
| `vue-ts-monorepo` | 多窗口 / 多渲染端 / 团队协作 | pnpm Workspaces + Turborepo，`packages/shared` 独立类型包 |

三个模板均提供 `dev` / `build` / `preview` / `lint` / `typecheck` / `test` / `package` 脚本。
模板只包含示例首页与 IPC 示例，不含具体业务页面。

## 仓库结构

```text
evora/
├── packages/create-evora/          # CLI 生成器（tsup 构建）
│   └── src/{index,prompts,generator,utils}.ts
├── templates/
│   ├── vue-ts/
│   │   ├── src/main/               # 窗口管理、IPC、托盘、快捷键、日志、更新
│   │   ├── src/preload/            # contextBridge 白名单 API
│   │   ├── src/renderer/           # Vue 3 应用
│   │   └── src/shared/             # IPC 合同 + API 类型 + 配置 schema
│   ├── vue-ts-element/
│   └── vue-ts-monorepo/
│       ├── apps/desktop/
│       └── packages/shared/
├── tests/{cli,smoke}.test.ts       # CLI 单测 + 模板静态/构建冒烟
├── tests/e2e/app.spec.ts           # Playwright Electron 启动测试
├── .github/workflows/ci.yml
├── playwright.config.ts
├── vitest.config.ts
└── package.json                    # 根 workspace（仅包含 packages/*）
```

## IPC 合同工作流

合同定义在 `src/shared/ipc.ts`（monorepo 为 `packages/shared/src/ipc.ts`）：

```ts
export interface IpcHandleChannels {
  'app:get-version': { args: []; result: string }
  'file:read': { args: [path: string]; result: FileReadResult }
}

export const IPC_HANDLE_CHANNELS = ['app:get-version', 'file:read'] as const
  satisfies readonly IpcHandleChannel[]
```

- `satisfies` 保证白名单中的通道必须存在。
- `HandleWhitelistCheck` 等类型别名在编译期反向校验：合同新增通道却忘记加入白名单会直接编译失败。
- 主进程 `typedHandle`、Preload `invoke/send/subscribe` 均基于合同推导参数与返回值。
- Preload 暴露给渲染进程的 `window.evora` 类型定义在 `shared/api.ts`，Preload 实现该接口以保证一致。

### 扩展一个新的 invoke 通道

1. `shared/ipc.ts`：在 `IpcHandleChannels` 添加合同，并把通道名加入 `IPC_HANDLE_CHANNELS`。
2. `shared/api.ts`：在 `EvoraApi` 添加方法。
3. `main/ipc.ts`：用 `typedHandle('your:channel', handler)` 实现，并在 handler 内校验参数。
4. `preload/index.ts`：用 `invoke('your:channel', ...)` 实现该方法。
5. 渲染进程直接调用 `window.evora.yourMethod()`，参数与返回值自动推导。

新增主进程推送通道同理：合同 → `IPC_PUSH_CHANNELS` → `pushToRenderer` → `EvoraApi` 订阅方法。

## 安全边界

- 渲染进程不能访问 `require`、`ipcRenderer`、`process` 或任何 Node.js API（Playwright 测试已断言）。
- Preload 只暴露白名单 API；未在白名单中的通道在运行时也会被拒绝。
- 所有 IPC 参数在主进程二次校验（类型、路径、大小、字段合法性）。
- `file:read` 只能读取 `userData/workspace` 内的文本文件，限制 1MB，禁止目录穿越。
- CSP：`script-src 'self'`，禁止 `unsafe-eval` 与内联脚本；`style-src` 因 Vite 注入样式保留 `'unsafe-inline'`。
- 外链统一交给系统浏览器，`will-navigate` 阻止导航到非开发服务器地址。
- 不要为了调试关闭 `sandbox` / `contextIsolation`；如需关闭，必须在你的项目 README 中说明风险与替代方案。

## 日志与异常

- 日志文件：`app.getPath('logs')/evora.log`，可通过 `window.evora.app.getLogPath()` 获取，菜单「帮助 → 打开日志目录」可直接打开。
- 单文件超过 5MB 轮转为 `evora.log.old`（保留一份历史）。
- 主进程捕获 `uncaughtException` / `unhandledRejection`；渲染进程通过 `window.onerror` 与 `unhandledrejection` 经 `log:write` 通道写入同一文件；Preload 的初始化日志也经该通道落盘。
- 渲染进程不能直接写文件，所有日志都经过主进程校验后落盘。

## 打包与自动更新

```bash
pnpm package    # electron-builder --dir，用于本地验证配置
pnpm release    # 生成安装包
```

配置见模板内 `electron-builder.yml`：

- Windows：NSIS，生产建议提供 `.ico` 与代码签名证书。
- macOS：DMG，正式发布需 Developer ID + notarization，并补充 hardened runtime / entitlements。
- Linux：AppImage，可按需添加 deb。
- 图标为占位资源（`build/icon.png`），正式发布请替换为符合平台要求的图标。

自动更新使用 `electron-updater`，更新推送通道为 `update:available`、`update:progress`、`update:downloaded`，渲染进程内置 `UpdatePrompt` 提示组件。开发环境（未打包）会跳过更新检查。启用前需在 `electron-builder.yml` 配置 `publish`（github 或 generic server）。

### 原生模块（如 better-sqlite3）

模板默认不引入原生模块。若需要：

1. 在 `electron.vite.config.ts` 中保持该依赖被 `externalizeDepsPlugin` 外部化；
2. 在 `electron-builder.yml` 中添加 `asarUnpack: ["**/*.node"]`，必要时使用 `extraResources`；
3. 安装 `@electron/rebuild`，在 `postinstall` 中按 Electron ABI 重建；
4. 主进程使用动态 `import()` 加载，避免打包器静态分析。

## 测试与自动化

```bash
pnpm lint         # 根仓库 ESLint
pnpm typecheck    # 根仓库 tsc
pnpm test         # CLI 单测 + 模板静态检查
pnpm test:e2e     # Playwright 启动 vue-ts 模板（需先安装并构建该模板）
EVORA_SMOKE_BUILD=1 pnpm test   # 额外执行三个模板的构建冒烟
```

CI（`.github/workflows/ci.yml`）包含：

1. 根仓库 lint / typecheck / test / CLI 构建，并用 CLI 生成三个模板项目；
2. 三个模板分别 install / lint / typecheck / test / build / `electron-builder --dir`；
3. Playwright Electron 启动测试（Linux 下使用 xvfb）。

## 版本策略与已知限制

- 依赖选择当前稳定版本：Electron 45、electron-vite 6、Vite 8、Vue 3.5、TypeScript 5.9、Vitest 5、electron-builder 26。
- `electron-store` 固定为 `8.x`：`10+` 为 ESM-only，与 sandbox 下 CJS 主进程打包产物不兼容；升级前需同时调整主进程模块格式。
- 未使用 `electron-vue` / webpack 旧方案。
- 三套模板的公共代码通过“先实现 `vue-ts`、再派生变体”的方式保持一致；派生变体目前以文件形式提交，未引入额外的代码生成脚本。
- CLI 发布到 npm 时需要把 `templates/` 一并打包进 `create-evora` 包（`resolveTemplatesRoot` 支持 `packageRoot/templates` 与仓库根 `templates` 两种布局）。
- 代码签名、公证、真实更新服务器、应用图标不包含在仓库中，仅提供接入点与占位资源。
