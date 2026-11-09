import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { FileReadResult } from '@shared/ipc'

const MAX_READ_BYTES = 1024 * 1024

export class FileAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileAccessError'
  }
}

/** target 是否位于 root 目录内部（含子目录） */
export function isInsideDirectory(root: string, target: string): boolean {
  const rootPath = resolve(root)
  const targetPath = resolve(target)
  const diff = relative(rootPath, targetPath)
  return diff !== '' && !diff.startsWith('..') && !isAbsolute(diff)
}

/**
 * 读取白名单目录内的文本文件。
 * 不管渲染进程传什么，主进程都会重新校验路径、类型与大小。
 */
export async function readTextFileWithin(
  root: string,
  requestedPath: string,
  maxBytes = MAX_READ_BYTES
): Promise<FileReadResult> {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    throw new FileAccessError('路径不能为空')
  }
  if (requestedPath.includes('\0')) {
    throw new FileAccessError('路径包含非法字符')
  }

  const target = resolve(root, requestedPath)
  if (!isInsideDirectory(root, target)) {
    throw new FileAccessError(`拒绝访问工作目录之外的路径：${requestedPath}`)
  }

  let info
  try {
    info = await stat(target)
  } catch {
    throw new FileAccessError(`文件不存在：${requestedPath}`)
  }

  if (!info.isFile()) {
    throw new FileAccessError(`不是普通文件：${requestedPath}`)
  }
  if (info.size > maxBytes) {
    throw new FileAccessError(`文件超过 ${Math.floor(maxBytes / 1024)}KB 限制`)
  }

  const content = await readFile(target, 'utf8')
  return { path: target, content, size: info.size }
}
