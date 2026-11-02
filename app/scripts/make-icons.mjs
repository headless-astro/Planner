// Renders public/icon.svg into the PNG icons the app manifest needs.
// Run with: npm run icons
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const svg = await readFile(path.join(publicDir, 'icon.svg'))

// The icon is full-bleed with the mark inside the safe zone, so one image works as
// both a normal and a maskable icon.
const outputs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of outputs) {
  await sharp(svg).resize(size, size).png().toFile(path.join(publicDir, name))
  console.log(`wrote public/${name}`)
}
