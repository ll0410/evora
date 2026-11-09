# Evora 架构设计方案

> 版本：1.0 · 日期：2026-11-09 · 适用范围：仓库根 + 三个模板变体

---

## 目录

1. [设计目标与约束](#1-设计目标与约束)
2. [总体架构](#2-总体架构)
3. [进程模型与安全边界](#3-进程模型与安全边界)
4. [IPC 合同系统](#4-ipc-合同系统)
5. [模块详解](#5-模块详解)
6. [构建与工具链](#6-构建与工具链)
7. [模板变体](#7-模板变体)
8. [数据流全景](#8-数据流全景)
9. [扩展性设计](#9-扩展性设计)
10. [已知限制与演进方向](#10-已知限制与演进方向)

---

## 1. 设计目标与约束

### 1.1 目标

Evora 把 Electron 桌面应用的"安全 + 类型安全 + 可维护"固化为默认值，让开发者一条命令获得生产级起点：

- **安全默认值**：渲染进程不触 Node，Preload 只暴露白名单 API，CSP 禁止 eval
- **端到端类型安全**：IPC 合同单一来源，三端从同一份定义推导
- **系统能力就位**：窗口管理、托盘、快捷键、日志、配置存储、更新
- **模板矩阵**：单仓、Turborepo 多仓、Element Plus 三套起点

### 1.2 硬约束（不可降级）

| 约束 | 理由 |
| --- | --- |
| `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false` | 窗口级安全基线，降低渲染进程 RCE 风险 |
| Preload 只暴露 `window.evora`，绝不暴露 `require` / `ipcRenderer` / `process` | 白名单原则：渲染进程只能通过合同约定的 API 与主进程交互 |
| IPC 合同必须单一来源（`shared/ipc.ts`） | 禁止三端各自手写通道名字符串，避免漂移 |
| 主进程对所有 IPC 参数做二次校验 | 不信任渲染进程输入，类型推导只是开发期保护 |
| 主进程 `ipcMain` 用 Typed Handler 注册 | 与合同对齐，避免漏掉通道 |
| 渲染进程禁止直接 import Node 模块 | Vite + electron-vite 构建期约束 |
| 模板中不得注释掉安全配置 | 安全基线是默认值，不是可选特性 |

### 1.3 技术基线

| 组件 | 版本 | 选型理由 |
| --- | --- | --- |
| Electron | 45.2.3 | 稳定支持 sandbox Preload、现代 API |
| electron-vite | 6.0.0 | 三端（main / preload / renderer）统一 Vite 构建 |
| Vue | 3.5.45 | Composition API + `<script setup>` |
| TypeScript | ~5.9.3 | 5.9 稳定分支，不追 TS7 |
| electron-store | 8.2.0 | 10+ 为 ESM-only，与 sandbox 下 CJS 主进程不兼容 |
| electron-updater | 6.8.11 | 自动更新，接入点骨架 |
| electron-builder | 26.18.0 | 跨平台打包 |
| Vitest | 5.1.0 | 单元测试 |
| Playwright | 1.65.0 | Electron 启动冒烟测试 |
| Turborepo | 2.11.10 | monorepo 任务编排 |

---

## 2. 总体架构

### 2.1 仓库分层

```
evora/
├── packages/                     # CLI 工具层
│   └── create-evora/             #   脚手架生成器（tsup 构建）
├── templates/                    # 应用模板层
│   ├── vue-ts/                   #   单仓 electron-vite（默认）
│   ├── vue-ts-element/           #   单仓 + Element Plus
│   └── vue-ts-monorepo/          #   pnpm Workspaces + Turborepo
├── tests/                        # 验证层
│   ├── cli.test.ts               #   CLI 单元测试
│   ├── smoke.test.ts             #   模板静态检查
│   └── e2e/app.spec.ts           #   Playwright Electron 启动测试
└── .github/workflows/ci.yml      # CI 流水线
```

根 workspace 只包含 `packages/*`，**templates 独立安装**。每个模板自带 `pnpm-workspace.yaml`（`packages: ['.']` 或 monorepo 的 `apps/* + packages/*`），避免在仓库内误用上层 workspace。

### 2.2 模板内部分层（vue-ts 单仓为例）

```
templates/vue-ts/
├── src/
│   ├── main/                     # 主进程（Node.js 能力边界）
│   ├── preload/                  # 桥接层（CJS，sandbox 安全）
│   ├── renderer/                 # 渲染进程（Vue 3 SPA）
│   └── shared/                   # 共享合同（三端共用的 TS 类型）
├── electron.vite.config.ts      # 三端统一构建配置
├── electron-builder.yml          # 打包配置
└── tsconfig.json                 # 路径别名 @shared / @renderer
```

monorepo 变体把 `shared/` 提升为 `packages/shared`（workspace 包 `@app/shared`），apps/desktop 通过 `externalizeDepsPlugin({ exclude: ['@app/shared'] })` 将其源码打包进主 / preload / renderer 三端产物。

---

## 3. 进程模型与安全边界

### 3.1 三进程职责

```
┌─────────────────────────────────────────────────────────────────┐
│                         Electron App                            │
│                                                                 │
│  ┌─────────────────────────────┐                               │
│  │    Main Process (CJS)       │  electron-log / electron-store │
│  │   Node.js + Electron API    │  electron-updater / Menu       │
│  │  文件系统 / 网络 / 系统集成 │  Tray / Shortcuts / WindowMgr  │
│  └─────────────┬───────────────┘                               │
│                │ ipcMain.handle / ipcMain.on                    │
│                │ + 运行时白名单校验                              │
│                ▼                                                │
│  ┌─────────────────────────────┐                               │
│  │  Preload (CJS, sandbox)     │  contextBridge.exposeInMainWorld│
│  │   ipcRenderer.invoke/send   │  只暴露 window.evora           │
│  │   不暴露 require/Node       │  运行时通道白名单 assertAllowed │
│  └─────────────┬───────────────┘                               │
│                │ contextBridge（无 ipcRenderer 暴露）            │
│                ▼                                                │
│  ┌─────────────────────────────┐                               │
│  │  Renderer (Vite + Vue SPA)  │  CSP script-src 'self'        │
│  │  无 Node API / 无 ipcRender │  无 unsafe-eval                │
│  │  只能 window.evora.*()      │  window.onerror → log:write   │
│  └─────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 安全基线清单

| 项目 | 值 | 位置 |
| --- | --- | --- |
| `contextIsolation` | `true` | `main/window-manager.ts` |
| `nodeIntegration` | `false` | `main/window-manager.ts` |
| `sandbox` | `true` | `main/window-manager.ts` |
| `webSecurity` | `true`（默认） | 未覆盖 |
| `loadFile` | 仅加载本地构建产物 | 开发期特殊分支 |
| `Content-Security-Policy` | `script-src 'self'`，禁 `unsafe-eval` | `renderer/index.html` |
| Preload 暴露 | `window.evora`（仅白名单 API） | `preload/index.ts` |
| 外链拦截 | `will-navigate` + `setWindowOpenHandler` | `main/window-manager.ts` |
| 主进程参数校验 | 每个 handler 内二次校验 | `main/ipc.ts` |
| 文件读取边界 | 只能 `userData/workspace` 内 | `main/safe-file.ts` |

### 3.3 为什么 Preload 必须 CJS

Electron 的 `sandbox: true` 要求 Preload 必须输出 CommonJS（Electron 自身使用 Node.js 的 CJS 加载器加载 Preload，ESM 在 sandbox 下不可用）。electron-vite 的 Preload 构建默认就是 CJS，无需额外配置。

### 3.4 为什么 Preload 里要写初始化日志

`preload/index.ts` 最后主动发送一条 `log:write`（scope: 'preload'）。这是因为 Preload 也在 sandbox 内跑，无法直接 import electron-log。日志经 `log:write` 通道交给主进程统一落盘。主进程 IPC 注册必须早于 `createMainWindow()`，否则 Preload 的初始化日志会丢失。

---

## 4. IPC 合同系统

IPC 合同是 Evora 的核心设计，文件位置：

- 单仓：`src/shared/ipc.ts`
- monorepo：`packages/shared/src/ipc.ts`

### 4.1 三层通道定义

```ts
// 1) invoke/handle 型：渲染进程发起，主进程返回结果
interface IpcHandleChannels {
  'app:get-version': { args: []; result: string }
  'file:read':       { args: [path: string]; result: FileReadResult }
  // ...
}

// 2) send/on 型：渲染进程发起，主进程不返回值
interface IpcSendChannels {
  'window:minimize':     { args: [] }
  'log:write':           { args: [entry: RendererLogEntry] }
  // ...
}

// 3) 主进程推送型：主进程主动推送给渲染进程
interface IpcMainToRendererChannels {
  'update:available':      { payload: UpdateInfoPayload }
  'window:maximized-changed': { payload: { maximized: boolean } }
}
```

### 4.2 白名单 + 编译期校验

```ts
// 运行时白名单（作为数组，转 SET 用于运行时校验）
export const IPC_HANDLE_CHANNELS = ['app:get-version', ...]
  as const satisfies readonly IpcHandleChannel[]

// 编译期完整性校验
export type HandleWhitelistCheck = MustBeNever<
  Exclude<IpcHandleChannel, (typeof IPC_HANDLE_CHANNELS)[number]>
>
// ↑ 若合同新增通道却忘记加入白名单，这里立即报错
```

两套保护同时工作：

1. **`satisfies`** 保证白名单中的通道 **必须** 在合同里存在（反向约束：不能有假通道）
2. **`MustBeNever<Exclude<...>>`** 保证合同里的每个通道 **必须** 在白名单里（正向约束：不能漏通道）

### 4.3 各端使用方式

| 端 | API | 类型推导 |
| --- | --- | --- |
| 主进程 | `typedHandle('file:read', handler)` | handler 的 args / return 从合同推导 |
| 主进程 | `ipcMain.on('log:write', handler)` | 主进程 send 侧 handler 的参数类型由合同提供 |
| Preload | `invoke('file:read', path)` | 参数 path 类型 + 返回值 Promise 类型自动推导 |
| Preload | `send('window:minimize')` | 参数类型自动推导 |
| Preload | `subscribe('update:available', listener)` | listener 的 payload 类型自动推导 |
| 渲染进程 | `window.evora.file.read(path)` | 完全继承 Preload 的 API 类型 |

### 4.4 运行时二次校验

主进程对每个通道的参数做独立校验：

```ts
// log:write 示例
function isRendererLogEntry(value: unknown): value is RendererLogEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.message === 'string' &&
    entry.message.length > 0 &&
    entry.message.length <= 2000 &&
    LOG_LEVELS.includes(entry.level as RendererLogLevel)
  )
}
```

类型推导只是开发期保护；真正的防线是主进程的运行时校验。

### 4.5 扩展一个新通道（5 步）

```
① shared/ipc.ts        — 合同里加通道
② shared/api.ts        — EvoraApi 里加方法
③ main/ipc.ts          — typedHandle / ipcMain.on 实现 + 参数校验
④ preload/index.ts     — invoke / send / subscribe 桥接
⑤ renderer/组件        — window.evora.yourMethod() 直接调用
```

**合同文件自身就是文档**。不允许在主进程 handler 里出现字符串字面量通道名。

---

## 5. 模块详解

### 5.1 主进程模块

#### window-manager.ts — 窗口管理

| 能力 | 实现 |
| --- | --- |
| 安全窗口 | `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` |
| 无边框 | `frame: false`，标题栏由渲染进程自绘 |
| 位置/大小持久化 | `electron-store` 保存 bounds；每次 resize/move 防抖写入 |
| 多显示器校验 | 启动时校验保存的 bounds 是否在显示器内 |
| 外链拦截 | `setWindowOpenHandler` 交给系统浏览器；`will-navigate` 阻止非 dev URL |
| loadFile | 生产加载 `out/renderer/index.html`，开发加载 Vite dev server |

#### logger.ts — 日志

- 文件路径：`app.getPath('logs')/evora.log`
- 上限 5MB，超过轮转 `.old`
- 捕获 `uncaughtException` / `unhandledRejection`
- 三进程日志统一落盘（主进程直接写、Preload + 渲染进程走 `log:write` IPC）

#### store.ts — 配置存储

- `electron-store` + JSON Schema 双重校验
- 主进程与渲染进程（经 IPC）共享同一 schema 类型

#### safe-file.ts — 文件读取

- 只能读 `userData/workspace` 内的文本文件
- 限制 1MB；禁止目录穿越（`../` 与绝对路径都会被拒绝）
- 合同里的 `file:read` 通道实际调这个模块

#### push.ts — 主进程推送给渲染进程

- 白名单校验：`PUSH_CHANNEL_SET.has(channel)`
- 目标窗口通过 `BrowserWindow.fromWebContents` 查找

#### tray.ts — 系统托盘

- 托盘图标（`resources/trayTemplate.png`）
- 右键菜单：显示主窗口 / 退出
- 点击显示/隐藏主窗口

#### shortcuts.ts — 全局快捷键

- 示例：`CommandOrControl+Shift+E` 切换主窗口可见性
- `registerGlobalShortcuts` / `unregisterGlobalShortcuts` 成对调用

#### updater.ts — 自动更新

- 仅在 `app.isPackaged` 且检测到 `app-update.yml`（即配置了 publish 并完成打包）时初始化
- 推送通道：`update:available` / `update:progress` / `update:downloaded`
- 渲染进程内置 `UpdatePrompt.vue` 提示组件（不依赖真实服务器）

#### integrations.ts — 系统集成骨架

- 自定义协议（`evora://`）
- 文件关联
- 开机自启（通过 electron-settings 或原生 API）
- 注释清晰，只提供骨架，具体实现由开发者按平台补齐

#### menu.ts — 应用菜单

- 基础菜单示例，含"帮助 → 打开日志目录"

#### index.ts — 启动流程

```
1. app.requestSingleInstanceLock()  — 单实例锁
2. app.whenReady()
   ├─ initLogger()                 — 日志先就绪
   ├─ createSettingsStore()
   ├─ ensureDemoWorkspace()       — 受控 workspace
   ├─ registerProtocolClient()
   ├─ registerFileAssociations()
   ├─ applyAutoLaunch()
   ├─ new WindowManager(store)
   ├─ registerIpcHandlers()        — 先注册 IPC
   ├─ windowManager.createMainWindow()
   ├─ buildApplicationMenu()
   ├─ createTray()
   ├─ registerGlobalShortcuts()
   └─ initAutoUpdater()
3. second-instance / activate / window-all-closed / will-quit 事件
```

**关键顺序**：`registerIpcHandlers` 必须早于 `createMainWindow()`，否则 Preload 的初始化日志会丢失。

### 5.2 Preload 模块

只有一个文件 `preload/index.ts`，职责非常单一：

1. 从 `shared/ipc.ts` 导入通道白名单 Set
2. 实现三个封装函数 `invoke / send / subscribe`，每个都先 `assertAllowed` 再调 `ipcRenderer`
3. 实现 `EvoraApi` 接口（来自 `shared/api.ts`），保证 API 形状与类型定义一致
4. `contextBridge.exposeInMainWorld('evora', api)`
5. 发送一条 scope: 'preload' 的初始化日志

### 5.3 渲染进程模块

- `App.vue` — 自绘无边框标题栏、能力列表、示例 IPC 调用
- `components/UpdatePrompt.vue` — 更新提示组件壳
- `main.ts` — 全局错误经 `log:write` 上报主进程
- `env.d.ts` — 声明 `Window.evora` 类型
- `shims-vue.d.ts` — 无顶层 import/export 的 `declare module '*.vue'`（避免污染 ambient namespace）

### 5.4 CLI 模块（create-evora）

```
packages/create-evora/src/
├── index.ts       # argv 解析 + 入口
├── prompts.ts     # 交互模式 prompts
├── generator.ts   # generateProject() — 编排复制/替换/安装/git
└── utils.ts       # 校验、占位符替换、运行命令、git、detectPackageManager
```

关键行为：

- 模板复制跳过 `node_modules` / `.git` / `dist` / `out` / lock 文件
- 占位符 `{{projectName}}` / `{{description}}` / `{{packageManager}}` 文本替换（含 `.vue` 等二进制检查）
- 非空目录默认拒绝；`--force` 才允许覆盖
- 任何写入阶段失败都清理半成品目录（`rmSync(targetDir, { recursive: true })`）
- 发布到 npm 时把 `templates/` 一并打包（`resolveTemplatesRoot` 支持 `packageRoot/templates` 与仓库根两种布局）

---

## 6. 构建与工具链

### 6.1 electron-vite 三端构建

```ts
// electron.vite.config.ts
export default defineConfig({
  main:    { plugins: [externalizeDepsPlugin({ exclude: ['@app/shared'] })], resolve: { alias } },
  preload: { plugins: [externalizeDepsPlugin({ exclude: ['@app/shared'] })], resolve: { alias } },
  renderer:{ plugins: [vue()], resolve: { alias } }
})
```

三个 Vite config 共享同一份 alias，确保主/Preload/渲染进程从相同位置导入 `@shared`（单仓指向 `src/shared`，monorepo 指向 `../../packages/shared/src`）。

monorepo 变体需要 **把 `@app/shared` 从 externalize 里排除**：因为它是 TS 源码而非预编译包，必须被打包进三端产物。

### 6.2 pnpm 10 与构建脚本放行

pnpm 10 默认阻止依赖的 `postinstall` 等构建脚本（安全策略），Electron 二进制下载需要放通：

```yaml
# pnpm-workspace.yaml
onlyBuiltDependencies:
  - electron
  - esbuild
  - electron-winstaller
```

模板自身的 pnpm-workspace.yaml 都包含这个配置；若 Electron 二进制仍未下载，可手动执行 `node node_modules/electron/install.js`。

### 6.3 electron-builder

```yaml
# electron-builder.yml 关键配置
appId: com.evora.desktop
productName: '{{projectName}}'    # 生成项目时替换
directories:
  buildResources: build
win:   { target: nsis }
mac:   { target: dmg }
linux: { target: AppImage }
publish: null                      # 默认关闭，开发者按需开启
```

开发者首次发布前：
1. 在 `electron-builder.yml` 配置 `publish`（github / generic / s3 等）
2. 替换 `build/icon.png`（macOS 需 `.icns`，Windows 需 `.ico`）
3. macOS 需 Developer ID + notarization
4. Windows 需 Authenticode 证书

### 6.4 CI 流水线（`.github/workflows/ci.yml`）

三个 Job：

| Job | 内容 |
| --- | --- |
| quality | 根仓库 install → lint → typecheck → test → build:cli → 用 CLI 生成三个模板 |
| templates | 矩阵 [vue-ts / vue-ts-element / vue-ts-monorepo] 分别 install → lint → typecheck → test → build → package |
| e2e | vue-ts install → build → `xvfb-run playwright test` |

### 6.5 代码质量工具

| 工具 | 位置 | 说明 |
| --- | --- | --- |
| ESLint 9 + typescript-eslint + eslint-plugin-vue | `eslint.config.mjs` | flat config，忽略 templates |
| Prettier | `.prettierrc.json` | 单文件配置 |
| simple-git-hooks | `prepare` 脚本 + `simple-git-hooks` 字段 | pre-commit 执行 `pnpm lint && pnpm typecheck` |
| Vitest | `vitest.config.ts` | 根仓库 CLI 单测 + 模板内 IPC 合同测试 |
| Playwright | `playwright.config.ts` | Electron 启动冒烟（验证安全基线） |

---

## 7. 模板变体

### 7.1 差异对比

| 维度 | vue-ts（默认） | vue-ts-element | vue-ts-monorepo |
| --- | --- | --- | --- |
| 场景 | 中小型桌面应用 | 后台管理型 | 多窗口 / 多渲染端 / 团队 |
| Workspace | 独立单包 | 独立单包 | pnpm Workspaces |
| 共享代码 | `src/shared/` 源码 | 同 vue-ts | `packages/shared` workspace 包 |
| 构建 | electron-vite | electron-vite | Turborepo 编排 |
| UI 框架 | Vue 3 原生 | Vue 3 + Element Plus | Vue 3 原生 |
| 额外依赖 | — | `element-plus ^2.14.8` | `turbo ^2.11.10` |
| CLI 复制规模 | ~41 文件 | ~41 文件 | ~45 文件 |
| 模板包名 | `@evora/template-vue-ts` | `@evora/template-vue-ts-element` | `@evora/template-vue-ts-monorepo` |
| 应用包名 | 模板内直接生成 | 模板内直接生成 | `@app/desktop`（workspace 包） |

### 7.2 代码复用策略

三套模板通过"先实现 vue-ts → 再 rsync 派生变体 + 定点修改"的方式保持一致：

- vue-ts-element 在 vue-ts 基础上：`main.ts` 增加 Element Plus 引入、`App.vue` 改用 `<el-tag>` / `<el-button>`、`index.html` 加 `<html class="dark">`、`package.json` 增 element-plus 依赖
- vue-ts-monorepo 把 `src/shared/` 上提到 `packages/shared/`（workspace 包），apps/desktop 通过 alias 和 externalizeDepsPlugin 接入；Turborepo 编排 build / lint / typecheck / test

**公共代码不通过运行时 package 依赖共享**，而是通过模板复制保持源文件一致。这样避免了三个版本的独立构建和发布，CLI 生成时是纯文件复制，无额外运行时开销。

---

## 8. 数据流全景

### 8.1 应用启动数据流

```
主进程 bootstrap()
  │
  ├─ initLogger() ──→ electron-log 写 evora.log（轮转 5MB）
  │
  ├─ createSettingsStore() ──→ electron-store JSON 读写
  │
  ├─ ensureDemoWorkspace() ──→ 写 welcome.txt 到 userData/workspace
  │
  ├─ registerIpcHandlers()  ←── 合同驱动的 typedHandle/on 注册
  │
  ├─ createMainWindow()
  │   ├─ 从 store 读取上次保存的 bounds
  │   ├─ BrowserWindow({ sandbox:true, contextIsolation:true, nodeIntegration:false })
  │   ├─ 加载 Preload（electron-vite 的 CJS 产物）
  │   │   └─ Preload send('log:write', {scope:'preload'})
  │   └─ 加载 renderer（Vite build 产物 / dev server）
  │       └─ Vue createApp → App.vue 自绘标题栏
  │
  ├─ createTray() / registerGlobalShortcuts() / buildApplicationMenu()
  │
  └─ initAutoUpdater()  ←── 仅打包后且检测到 app-update.yml 才初始化
```

### 8.2 渲染进程调用 IPC 数据流（以 `file:read` 为例）

```
Vue 组件 window.evora.file.read('welcome.txt')
  │
  ▼
Preload invoke('file:read', 'welcome.txt')
  ├─ assertAllowed('file:read', HANDLE_CHANNEL_SET) ✅
  └─ ipcRenderer.invoke('file:read', 'welcome.txt')
  │
  ▼
主进程 typedHandle('file:read', handler)
  ├─ handler 内部运行时校验
  │   ├─ isInsideDirectory(path, userData/workspace) 目录穿越检查
  │   └─ readTextFileWithin(path, 1MB) 大小/存在性检查
  └─ 返回 FileReadResult
  │
  ▼
Preload invoke 的 Promise resolve(FileReadResult)
  │
  ▼
Vue 组件拿到完整类型推导的结果，渲染到 <pre>
```

### 8.3 日志数据流（三进程统一）

```
主进程:  log.info('[main] ...')           ──→ electron-log 文件传输
Preload: send('log:write', {scope:'preload'})  ──→ ipcMain.on('log:write')
渲染进程: window.evora.log.write({...})      ──→ ipcMain.on('log:write')
          window.onerror 也经 log:write       ──→
                                                       │
                                                       ▼
                                          主进程 log:write handler
                                          ├─ isRendererLogEntry 校验
                                          └─ electron-log 统一写入 evora.log
```

### 8.4 更新推送数据流

```
主进程 autoUpdater.on('update-available', info)
  └─ pushToRenderer(window, 'update:available', { version, releaseNotes })
       ├─ assertAllowed('update:available', PUSH_CHANNEL_SET) ✅
       └─ BrowserWindow.webContents.send('update:available', payload)
            │
            ▼
Preload subscribe('update:available', listener) 返回 unsubscribe
            │
            ▼
Vue 组件 const unsub = window.evora.update.onAvailable(info => ...)
  └─ UpdatePrompt.vue 显示发现新版本
```

---

## 9. 扩展性设计

### 9.1 加一个新 IPC 通道（invoke 型）

```
步骤 1: shared/ipc.ts
  export interface IpcHandleChannels {
    'your:method': { args: [a: string]; result: { ok: boolean } }
  }
  // 自动触发 MustBeNever 校验，提醒你加入 IPC_HANDLE_CHANNELS

步骤 2: shared/api.ts
  export interface EvoraApi {
    your: { method: (a: string) => Promise<{ ok: boolean }> }
  }

步骤 3: main/ipc.ts
  typedHandle('your:method', (a) => {
    // 参数校验
    return { ok: true }
  })

步骤 4: preload/index.ts
  const api: EvoraApi = {
    your: { method: (a) => invoke('your:method', a) },
    // ...
  }

步骤 5: renderer 直接用
  const res = await window.evora.your.method('hello')
```

### 9.2 加一个新主进程模块

1. 新建 `main/your-module.ts`，纯函数 + 类型
2. 在 `bootstrap()` 里按顺序初始化（先日志、再 store、再业务模块）
3. 需要对外暴露能力则通过 IPC 合同 → 不走模块直接 import

### 9.3 模板变体新增

复制 vue-ts 为新目录，然后：
- 修改 `package.json` 的 name / devDependencies
- 修改 `README.md` 的说明
- 定点修改 renderer 代码和样式

公共代码（IPC 合同、主进程模块）应保持与 vue-ts 一致，避免三版本漂移。

### 9.4 原生模块接入（better-sqlite3 等）

模板默认不引入原生模块。若需要：

1. `electron.vite.config.ts` 中保持该依赖被 `externalizeDepsPlugin` 外部化
2. `electron-builder.yml` 添加 `asarUnpack: ["**/*.node"]`
3. 安装 `@electron/rebuild`，`postinstall` 中按 Electron ABI 重建
4. 主进程用动态 `import()` 加载，避免打包器静态分析

---

## 10. 已知限制与演进方向

### 10.1 当前限制

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 真实自动更新服务器 | 未实现 | 接入点就位（electron-updater + 推送通道 + UI 壳），publish 配置 `null` |
| macOS 代码签名 / notarization | 未实现 | 占位配置 + 文档说明 |
| Windows `.ico` / 签名证书 | 未实现 | 占位图标 |
| linux `.deb` 目标 | 未启用 | builder 配置已包含 AppImage |
| 原生模块示例 | 未提供 | better-sqlite3 接入说明在 README |
| 运行时单测 + 构建冒烟 | 默认跳过 | `EVORA_SMOKE_BUILD=1` 启用 |
| e2e 覆盖 | 仅 1 个启动测试 | 只验证安全基线和启动，未覆盖所有能力 |

### 10.2 演进方向（非阻塞）

| 方向 | 说明 |
| --- | --- |
| CLI 发布到 npm | 需要把 templates/ 打包进 create-evora 包，配合 `resolveTemplatesRoot` 的 `packageRoot/templates` 分支 |
| 多渲染端模板 | 在 monorepo 基础上再开一个窗口（如 Settings Window），演示 WindowManager 多实例 |
| 运行时 IPC 参数 Zod schema | 当前参数校验是手写函数，可统一换成 Zod schema，合同文件同时导出 schema |
| electron-store 升级 10+ | 主进程需要切 ESM，与 electron-vite 的 CJS 主进程产物兼容性待评估 |
| 预加载层插件化 | 提供 registerBridge() 让开发者增量暴露白名单 API，而不是每次复制整个 preload/index.ts |
| 模板代码生成脚本 | 目前三套模板源文件独立维护，可引入代码生成器保持同步 |

### 10.3 技术债登记

| 债 | 位置 | 风险 | 建议处理 |
| --- | --- | --- | --- |
| vitest.config.ts 触发 Vite "ESM in CJS" 警告 | monorepo apps/desktop | 无实际影响，未来 Vite 默认 configLoader: native 时可能需要调整 | 给 apps/desktop 的 package.json 加 `"type": "module"` 或把 vitest.config.ts 改名 `.mjs` |
| electron-store 8.x 锁定 | template package.json | 错过 10+ 的 ESM-only 功能 | 评估主进程切 ESM 后升级 |
| 图标为占位资源 | `build/icon.png` + `resources/*.png` | 正式发布时会被审查拒绝 | 开发者按平台要求替换 |
| 协议 / 文件关联 / 自启骨架 | `main/integrations.ts` | 只是示例代码 | 按目标平台补齐实现 |

---

*Evora 脚手架 —— 安全 + 类型安全 + 可维护的 Electron 起点*
