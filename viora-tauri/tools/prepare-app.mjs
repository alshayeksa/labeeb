// Copies Viora's built interface into ../app without touching the original.
//
//   node tools/prepare-app.mjs D:\projects\Viora
//
// Viora's Electron main process decompresses its `.json.br` files when it serves
// them. The prototype host serves files as they are, so they are decompressed
// here once, keeping their names so the interface's requests still match.
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'

const source = resolve(process.argv[2] ?? 'D:/projects/Viora', 'dist')
const target = resolve(fileURLToPath(new URL('../app', import.meta.url)))

rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true, filter: path => !/[\\/]dist[\\/](web|main\.js|preload\.js)/.test(path) })
cpSync(resolve(source, '..', 'LICENSE'), join(target, 'LICENSE-AGPL-3.0.txt'))

let count = 0
const walk = folder => {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (name.endsWith('.json.br')) { writeFileSync(path, brotliDecompressSync(readFileSync(path))); count++ }
  }
}
walk(target)
console.log(`prepared ${target}: decompressed ${count} files`)
