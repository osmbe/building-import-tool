import crypto from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_FILE_AGE_MS = 60 * 60 * 1000 // 1 hour

async function cleanupOldExports(exportsDir: string): Promise<void> {
  try {
    const files = await fs.readdir(exportsDir)
    const now = Date.now()
    for (const file of files) {
      if (!/^[a-f0-9]+\.osm$/.test(file)) continue
      const filePath = join(exportsDir, file)
      const stat = await fs.stat(filePath)
      if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
        await fs.unlink(filePath).catch(() => {})
      }
    }
  } catch {
    // Directory may not exist yet — ignore
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate that we have OSM-XML data
  if (!body || typeof body !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body. Expected OSM-XML string.'
    })
  }

  // Reject oversized payloads
  if (body.length > MAX_BODY_SIZE) {
    throw createError({
      statusCode: 413,
      message: 'Payload too large. Maximum size is 10 MB.'
    })
  }

  // Basic validation that it looks like OSM-XML
  if (!body.includes('<osm') && !body.includes('<?xml')) {
    throw createError({
      statusCode: 400,
      message: 'Invalid OSM-XML format. Must contain OSM XML data.'
    })
  }

  // Generate random token for filename
  const token = crypto.randomBytes(16).toString('hex')
  const filename = `${token}.osm`

  const exportsDir = process.env.NODE_ENV === 'production'
    ? join(process.cwd(), '.output', 'public', 'exports')
    : join(process.cwd(), 'public', 'exports')

  const filePath = join(exportsDir, filename)

  // Ensure directory exists
  await fs.mkdir(exportsDir, { recursive: true })

  // Clean up old export files (fire-and-forget)
  cleanupOldExports(exportsDir).catch(() => {})

  try {
    // Save file
    await fs.writeFile(filePath, body, 'utf-8')
  } catch (error) {
    console.error('Error writing OSM export file:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to upload OSM file'
    })
  }

  const protocol = getRequestHeader(event, 'x-forwarded-proto') ||
                   (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const host = getRequestHeader(event, 'host') || 'localhost:3000'
  const baseUrl = `${protocol}://${host}`

  return {
    status: 'stored',
    fname: filename,
    url: `${baseUrl}/exports/${filename}`
  }
})
