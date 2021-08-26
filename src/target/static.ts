import fs from 'fs/promises'
import hash from 'hasha'
import { Nuxt } from '@nuxt/kit'
import { join, resolve } from 'upath'
import { DocusOptions } from '../types'
import { updateNavigation } from '../navigation'
import { useStorage } from '../storage'
import getContent from '../server/api/get'

function isUrl(string: string) {
  try {
    // quick test if the string is an URL
    // eslint-disable-next-line no-new
    new URL(string)
  } catch (_) {
    return false
  }
  return true
}

export function generateStaticDatabaseFile(options: DocusOptions, nuxt: Nuxt) {
  let publicPath = nuxt.options.build.publicPath // can be an url
  let routerBasePath = nuxt.options.router.base

  /* istanbul ignore if */
  if (publicPath[publicPath.length - 1] !== '/') {
    publicPath += '/'
  }
  if (routerBasePath[routerBasePath.length - 1] === '/') {
    routerBasePath = routerBasePath.slice(0, -1)
  }
  nuxt.hook('generate:distRemoved', async () => {
    const storage = useStorage()!
    const keys = await storage.getKeys()
    const serial = await Promise.all(keys.map(async key => [key, await getContent({ url: key } as any)]))

    // Create a hash to fetch the database
    const dbHash = hash(String(serial)).substr(0, 8)
    if (nuxt.options.publicRuntimeConfig) {
      ;(nuxt.options.publicRuntimeConfig as any).docusDbHash = dbHash
    } else {
      nuxt.hook('vue-renderer:ssr:context', renderContext => {
        renderContext.nuxt.docusDbHash = dbHash
      })
    }

    const dir = resolve(nuxt.options.buildDir, 'dist', 'client', options.apiBase, dbHash)

    await fs.mkdir(dir, { recursive: true })
    await Promise.all(
      serial.map(async ([key, value]) => {
        await fs.writeFile(join(dir, key + '.json'), JSON.stringify(value), 'utf-8')
      })
    )
  })
  return isUrl(publicPath) ? `${publicPath}${options.apiBase}` : `${routerBasePath}${publicPath}${options.apiBase}`
}

export default function setupStaticTarget(options: DocusOptions, nuxt: Nuxt) {
  const dbPath = generateStaticDatabaseFile(options, nuxt)

  nuxt.hook('generate:before', async () => {
    await updateNavigation(nuxt)
  })

  options._dbPath = dbPath
}