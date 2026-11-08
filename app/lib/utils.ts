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
