import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Read HSL CSS variable and return color string for OpenLayers
export function hslVar(name: string, alpha: number): string {
  const hsl = getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  return `hsl(${hsl} / ${alpha})`
}

// Helper function to format area
export function formatArea(area: number): string {
  if (!area) return '—'

  if (area >= 10000) return `${(area / 10000).toFixed(2)} ha`

  return `${area.toFixed(2)} m²`
}

// Helper to parse semicolon-separated lists
export function parseSemicolonList(value: string | undefined): string[] {
  if (!value) return []

  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}
