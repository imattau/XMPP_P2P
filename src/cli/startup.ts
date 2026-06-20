import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'

export type CliStartupOptions = {
  port?: number
  host?: string
  sqlitePath?: string
  helpRequested: boolean
  versionRequested: boolean
  errors: string[]
}

const parseInteger = (value: string) => {
  if (!/^\d+$/.test(value)) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

const resolvePackageJsonPath = () => new URL('../../package.json', import.meta.url)

export const getPackageVersion = async () => {
  const packageJson = JSON.parse(await readFile(fileURLToPath(resolvePackageJsonPath()), 'utf8')) as { version?: string }
  return packageJson.version ?? '0.0.0'
}

export const parseCliStartupArgs = (args: string[]): CliStartupOptions => {
  const options: CliStartupOptions = {
    helpRequested: false,
    versionRequested: false,
    errors: []
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      options.helpRequested = true
      continue
    }

    if (arg === '--version' || arg === '-v') {
      options.versionRequested = true
      continue
    }

    const [key, inlineValue] = arg.split('=', 2)
    const takeValue = () => {
      if (inlineValue !== undefined) {
        return inlineValue
      }
      const nextValue = args[index + 1]
      if (nextValue === undefined || nextValue.startsWith('--')) {
        options.errors.push(`Missing value for ${key}`)
        return undefined
      }
      index += 1
      return nextValue
    }

    switch (key) {
      case '--port': {
        const value = takeValue()
        if (!value) {
          break
        }
        const parsed = parseInteger(value)
        if (parsed === undefined || parsed < 0 || parsed > 65535) {
          options.errors.push(`Invalid port value: ${value}`)
          break
        }
        options.port = parsed
        break
      }
      case '--host': {
        const value = takeValue()
        if (value) {
          options.host = value
        }
        break
      }
      case '--sqlite-path': {
        const value = takeValue()
        if (value) {
          options.sqlitePath = value
        }
        break
      }
      default:
        if (arg.startsWith('--')) {
          options.errors.push(`Unknown option: ${arg}`)
          break
        }
        options.errors.push(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

export const printStartupUsage = (title: string, launchCommand: string, footer: string) => {
  console.log(title)
  console.log('')
  console.log('Usage:')
  console.log(`  ${launchCommand}`)
  console.log('')
  console.log('Options:')
  console.log('  --port=<port>         Bind libp2p to a specific TCP port')
  console.log('  --host=<host>         Bind libp2p to a specific host')
  console.log('  --sqlite-path=<path>  Load and persist all XMPP state from a SQLite database file')
  console.log('  --help, -h            Show this message and exit')
  console.log('  --version, -v         Print the CLI version and exit')
  console.log('')
  console.log(footer)
}

export const printCliUsage = () => {
  printStartupUsage(
    'XMPP over libp2p CLI',
    'npm start -- [--port=<port>] [--host=<host>] [--sqlite-path=<path>]',
    'Start the CLI, then type `help` for interactive commands.'
  )
}

export const printMcpUsage = () => {
  printStartupUsage(
    'XMPP over libp2p MCP server',
    'npm run mcp -- [--port=<port>] [--host=<host>] [--sqlite-path=<path>]',
    'Start the MCP server, then connect through a JSON-RPC client.'
  )
}
