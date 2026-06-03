import { getRouterBasename } from '@/lib/env'

/**
 * Magic-link return URL must include the GitHub Pages project path.
 * `window.location.origin` alone yields https://user.github.io/auth/callback
 * but the app lives at https://user.github.io/World-Cup-2026---Cooper/
 */
export function getAuthRedirectUrl(): string {
  const basename = getRouterBasename()
  if (basename === '/') {
    return `${window.location.origin}/auth/callback`
  }
  return `${window.location.origin}${basename}/auth/callback`
}
