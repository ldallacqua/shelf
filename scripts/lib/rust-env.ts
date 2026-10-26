import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * The environment the desktop app's tools run in (the desktop guide, section 6),
 * with PATH tidied. Windows reads a `"` in PATH as the start of a quoted part,
 * so one stray quote, as an installer can leave behind (the owner's computer
 * has one after dotnet's folder), hides every folder after it from cmd and
 * from Rust's own search, cargo's among them. Each folder is given without
 * quotes, and cargo's own comes first.
 */
export function rustEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH'
  const folders = (env[key] ?? '')
    .split(delimiter)
    .map((folder) => folder.replaceAll('"', '').trim())
    .filter((folder) => folder !== '')
  const cargo = join(env.CARGO_HOME ?? join(homedir(), '.cargo'), 'bin')
  return { ...env, [key]: [cargo, ...folders].join(delimiter) }
}
