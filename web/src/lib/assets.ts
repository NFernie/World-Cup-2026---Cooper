/** Static files under public/ with Vite base path (GitHub Pages). */
export function staticAsset(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${base}${clean}`
}
