# {{projectName}}

{{description}}

Evora monorepo 模板：pnpm Workspaces + Turborepo + `@app/shared` 共享类型包。

## 快速开始

```bash
{{packageManager}} install
{{packageManager}} dev       # turbo 启动 apps/desktop 的开发环境
{{packageManager}} build     # 构建所有包
{{packageManager}} lint
{{packageManager}} typecheck
{{packageManager}} test
```

## 结构

```text
apps/desktop/            Electron 应用（main / preload / renderer）
packages/shared/src/     IPC 合同与配置 schema（三端共享）
```

`@app/shared` 作为 devDependency 以源码形式被 electron-vite 打包进产物，
避免运行时解析 workspace 包；新增共享类型时直接修改
`packages/shared/src/ipc.ts` 即可。

## IPC / 安全 / 打包

与单仓模板一致，详见根目录说明与 `apps/desktop/README.md`。
