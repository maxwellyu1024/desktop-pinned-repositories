import * as Path from 'path'
import { readdir, readFile } from 'fs/promises'

/** Product names for JetBrains configuration folder prefixes. */
const ProductNames: ReadonlyArray<[string, string]> = [
  ['IntelliJIdea', 'IntelliJ IDEA'],
  ['IdeaIC', 'IntelliJ IDEA Community Edition'],
  ['PyCharmCE', 'PyCharm Community Edition'],
  ['PyCharm', 'PyCharm'],
  ['WebStorm', 'WebStorm'],
  ['GoLand', 'GoLand'],
  ['PhpStorm', 'PhpStorm'],
  ['RubyMine', 'RubyMine'],
  ['CLion', 'CLion'],
  ['Rider', 'Rider'],
  ['DataSpell', 'DataSpell'],
  ['RustRover', 'RustRover'],
  ['AndroidStudio', 'Android Studio'],
]

/**
 * The product name for a configuration folder such as `GoLand2025.2`, or null
 * for folders that don't belong to an IDE.
 */
export function getJetBrainsProductName(folderName: string): string | null {
  const match = ProductNames.find(([prefix]) =>
    new RegExp(`^${prefix}\\d`).test(folderName)
  )
  return match === undefined ? null : match[1]
}

const unescapeXml = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * Get the project paths from a `recentProjects.xml` file, most recent first as
 * the IDE stores them. Paths relative to IDE folders other than the home
 * directory, such as the LightEdit project, are skipped.
 */
export function parseJetBrainsRecentProjects(
  xml: string,
  homeDirectory: string
): ReadonlyArray<string> {
  const keys = [
    ...[...xml.matchAll(/<entry key="([^"]*)"/g)].map(m => m[1]),
    // Older versions list the projects in a `recentPaths` option instead.
    ...[
      ...(
        /<option name="recentPaths">([\s\S]*?)<\/option>/.exec(xml)?.[1] ?? ''
      ).matchAll(/<option value="([^"]*)"/g),
    ].map(m => m[1]),
  ]

  return keys.flatMap(key => {
    const path = unescapeXml(key).replace('$USER_HOME$', homeDirectory)
    return path.includes('$') ? [] : [Path.normalize(path)]
  })
}

/**
 * Find the recent project lists of installed JetBrains IDEs, grouped by
 * product so that several versions of the same IDE are merged.
 *
 * @param appDataPath The application data directory, which holds `JetBrains`
 *                    and, for Android Studio, `Google`.
 */
export async function readJetBrainsProjects(
  appDataPath: string,
  homeDirectory: string
): Promise<ReadonlyMap<string, ReadonlyArray<string>>> {
  const configurationFolders = (
    await Promise.all(
      ['JetBrains', 'Google'].map(vendor =>
        readdir(Path.join(appDataPath, vendor)).then(
          names => names.map(name => Path.join(appDataPath, vendor, name)),
          () => []
        )
      )
    )
  ).flat()

  const products = new Map<string, Array<string>>()

  // Newer versions sort after older ones, and their projects come first.
  for (const folder of configurationFolders.sort().reverse()) {
    const product = getJetBrainsProductName(Path.basename(folder))
    if (product === null) {
      continue
    }

    const xml = await readFile(
      Path.join(folder, 'options', 'recentProjects.xml'),
      'utf8'
    ).catch(() => null)
    if (xml === null) {
      continue
    }

    const paths = products.get(product) ?? []
    paths.push(...parseJetBrainsRecentProjects(xml, homeDirectory))
    products.set(product, paths)
  }

  return products
}
