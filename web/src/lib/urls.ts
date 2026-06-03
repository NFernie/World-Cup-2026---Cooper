import { getRouterBasename } from '@/lib/env'

/** Absolute app URL including GitHub Pages repo path. */
export function getAppUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const basename = getRouterBasename()
  const prefix = basename === '/' ? '' : basename
  return `${window.location.origin}${prefix}${normalized}`
}

export function getInviteUrl(inviteCode: string): string {
  return getAppUrl(`/join/${inviteCode}`)
}
