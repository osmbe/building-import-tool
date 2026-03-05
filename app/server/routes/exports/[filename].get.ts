import { join } from 'path'
import { readFile } from 'fs/promises'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')

  if (!filename || !filename.endsWith('.osm')) {
    throw createError({
      statusCode: 400,
      message: 'Invalid filename'
    })
  }

  try {
    // In production, files are in .output/public/exports
    // In development, files are in public/exports
    const filePath = process.env.NODE_ENV === 'production'
      ? join(process.cwd(), '.output', 'public', 'exports', filename)
      : join(process.cwd(), 'public', 'exports', filename)

    const content = await readFile(filePath, 'utf-8')

    // Set appropriate headers for OSM XML
    setResponseHeaders(event, {
      'Content-Type': 'application/xml',
      'Content-Disposition': `inline; filename="${filename}"`
    })

    return content
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw createError({
        statusCode: 404,
        message: 'File not found'
      })
    }
    throw createError({
      statusCode: 500,
      message: 'Failed to read file'
    })
  }
})
