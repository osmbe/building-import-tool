import crypto from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate that we have OSM-XML data
    if (!body || typeof body !== 'string') {
      console.error('Invalid request body type:', typeof body)
      throw createError({
        statusCode: 400,
        message: 'Invalid request body. Expected OSM-XML string.'
      })
    }

    // Basic validation that it looks like OSM-XML
    // Check for XML content (more lenient - some generators don't include declaration)
    if (!body.includes('<osm') && !body.includes('<?xml')) {
      console.error('Invalid XML format. First 500 chars:', body.substring(0, 500))
      throw createError({
        statusCode: 400,
        message: 'Invalid OSM-XML format. Must contain OSM XML data.'
      })
    }

    // Generate random token for filename
    const token = crypto.randomBytes(16).toString('hex')
    const filename = `${token}.osm`

    // In production, write to .output/public/exports (served as static files)
    // In development, write to public/exports
    const exportsDir = process.env.NODE_ENV === 'production'
      ? join(process.cwd(), '.output', 'public', 'exports')
      : join(process.cwd(), 'public', 'exports')

    const filePath = join(exportsDir, filename)

    // Ensure directory exists
    await fs.mkdir(exportsDir, { recursive: true })

    // Save file
    await fs.writeFile(filePath, body, 'utf-8')

    // Get the base URL from the request headers
    // This automatically works in both development and production
    const protocol = getRequestHeader(event, 'x-forwarded-proto') ||
                     (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    const host = getRequestHeader(event, 'host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`

    return {
      status: 'stored',
      fname: filename,
      url: `${baseUrl}/exports/${filename}`
    }
  } catch (error: any) {
    console.error('Error uploading OSM file:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to upload OSM file'
    })
  }
})
