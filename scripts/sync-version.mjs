import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? process.env.BUILD_NUMBER ?? '1'

const gradlePath = path.join(root, 'android', 'app', 'build.gradle')
if (!existsSync(gradlePath)) {
  console.log(`No Android project at ${gradlePath}; nothing to sync.`)
  process.exit(0)
}

let gradle = await readFile(gradlePath, 'utf8')
const code = Number.parseInt(buildNumber, 10)
if (!Number.isFinite(code) || code < 1) {
  throw new Error(`Invalid Android versionCode: ${buildNumber}`)
}

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`)
gradle = gradle.replace(/versionName\s+["'][^"']*["']/, `versionName "${version}"`)

await writeFile(gradlePath, gradle)
console.log(`Android version: ${version} (code ${code})`)
