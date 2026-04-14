import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function versionPlugin() {
  return {
    name: 'version-json',
    writeBundle() {
      writeFileSync(
        resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ version: pkg.version })
      )
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    preact(),
    tailwindcss(),
    versionPlugin(),
  ],
  base: '/tune-editor/',
})
