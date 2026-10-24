import { join } from 'path'
import { readFile } from 'fs/promises'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')

  if (!filename || !/^[a-f0-9]+\.osm$/.test(filename))
    throw createError({
      message: 'Invalid filename',
      statusCode: 400
    })

  try {
    // In production, files are in .output/public/exports
    // In development, files are in public/exports
    const filePath =
      process.env.NODE_ENV === 'production'
        ? join(process.cwd(), '.output', 'public', 'exports', filename)
        : join(process.cwd(), 'public', 'exports', filename)

    const content = await readFile(filePath, 'utf-8')

    // Set appropriate headers for OSM XML
    setResponseHeaders(event, {
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Type': 'application/xml'
    })

    return content
  } catch (error: any) {
    if (error.code === 'ENOENT')
      throw createError({
        message: 'File not found',
        statusCode: 404
      })

    throw createError({
      message: 'Failed to read file',
      statusCode: 500
    })
  }
})
