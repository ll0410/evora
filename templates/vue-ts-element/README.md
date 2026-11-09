# {{projectName}}

{{description}}

由 [Evora](https://github.com/evora/evora) 生成的 Electron + Vue 3 + TypeScript 桌面应用。

该变体在基础模板上集成了 [Element Plus](https://element-plus.org/)（完整引入 + 暗色主题变量），
适合后台管理型桌面端。若需要按需引入，可自行接入 `unplugin-vue-components`。

## 快速开始

```bash
{{packageManager}} install
{{packageManager}} dev        # 启动开发环境（渲染进程 HMR，主进程/Preload 热重载）
{{packageManager}} build      # 构建生产产物到 out/
{{packageManager}} preview    # 预览已构建产物
{{packageManager}} package    # 生成未签名的本地安装包（electron-builder --dir）
```

> 默认 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`。
> 请勿为了省事关闭这三项；渲染进程需要的能力请通过 IPC 合同扩展。

## 目录结构

```text
src/
├── main/              # 主进程：窗口、IPC、托盘、快捷键、日志、更新
├── preload/           # Preload：白名单 contextBridge
├── renderer/          # Vue 3 渲染进程
│   ├── index.html
│   └── src/
└── shared/            # 三端共享：IPC 合同、API 类型、配置 schema
```

## 扩展一个 IPC 通道

1. 在 `src/shared/ipc.ts` 的 `IpcHandleChannels` 中添加合同，并把通道名加入
   `IPC_HANDLE_CHANNELS` 白名单（漏加会编译失败）。
2. 在 `src/main/ipc.ts` 用 `typedHandle('your:channel', handler)` 注册，并在
   handler 内校验参数（不信任渲染进程输入）。
3. 在 `src/shared/api.ts` 的 `EvoraApi` 中补充方法，并在 `src/preload/index.ts`
   用 `invoke('your:channel', ...)` 实现。
4. 渲染进程直接调用 `window.evora.yourMethod()`，参数与返回值自动推导。

## 日志

- 主进程、Preload、渲染进程统一写入 `app.getPath('logs')/evora.log`。
- 渲染进程通过 `window.evora.log.write()` 走 IPC 写入。
- 单文件超过 5MB 自动轮转为 `evora.log.old`。
- 菜单「帮助 → 打开日志目录」可快速定位日志文件。

## 安全边界

- 渲染进程没有任何 Node.js / Electron 原生能力，只有 `window.evora` 白名单 API。
- `file:read` 仅允许读取 `userData/workspace` 内的文本文件，且限制 1MB。
- 已设置 CSP：禁止 `eval` 与内联脚本；外链一律交给系统浏览器打开。
- 窗口外链通过 `setWindowOpenHandler` 拦截，`will-navigate` 拦截非开发服务器导航。

## 打包与签名

项目使用 electron-builder，配置见 `electron-builder.yml`：

```bash
{{packageManager}} package   # 本地目录包，用于验证配置
{{packageManager}} release   # 生成安装包
```

- Windows：生产需提供 `.ico`；NSIS 安装包签名需要代码签名证书。
- macOS：需要 Developer ID 证书与 notarization，`hardenedRuntime` 与 entitlements
  需按官方文档补充。
- Linux：AppImage 可直接运行，deb 需要维护者信息。

自动更新使用 electron-updater，需在 `electron-builder.yml` 中配置 `publish`
（github / generic server），打包后才会生效。

### 原生模块（如 better-sqlite3）

若引入原生模块，需要：

1. `electron.vite.config.ts` 中通过 `externalizeDepsPlugin({ exclude: [] })` 保持 external；
2. `electron-builder.yml` 增加 `asarUnpack: ["**/*.node"]`，必要时用 `extraResources`；
3. 安装 `@electron/rebuild` 并在 `postinstall` 中按 Electron ABI 重建；
4. 主进程通过动态 import 加载，避免打包器静态分析。

模板本身不包含原生模块。

## 调试

`.vscode/launch.json` 预置三种配置：

- `Debug Main Process`：electron-vite dev + `--inspect=5858`
- `Debug Renderer Process`：Chrome 调试器附加 `http://localhost:5173`
- `Attach Preload (5858)`：附加到同一调试端口

也可手动执行：

```bash
{{packageManager}} dev -- --inspect=5858
```
