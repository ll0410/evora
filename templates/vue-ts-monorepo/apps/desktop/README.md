# @app/desktop

Electron 应用（main / preload / renderer），由根目录 Turborepo 调度。

## 命令

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm typecheck
pnpm test
pnpm package
```

## 共享类型

IPC 合同位于 `../../packages/shared/src/ipc.ts`，通过别名 `@shared` 引用：

```ts
import { IPC_HANDLE_CHANNELS } from '@shared/ipc'
```

扩展通道的步骤与单仓模板一致：先改合同与白名单，再在主进程 `typedHandle`、
Preload、`EvoraApi` 中补齐实现。

## 安全基线

窗口保持 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，
渲染进程只能访问 `window.evora` 白名单 API。
