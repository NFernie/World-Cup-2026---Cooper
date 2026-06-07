import { getRouterBasename } from '@/lib/env'

/** Absolute app URL including GitHub Pages repo path. */
export function getAppUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const basename = getRouterBasename()
  const prefix = basename === '/' ? '' : basename
  return `${window.location.origin}${prefix}${normalized}`
}

/** Share link: opens join page with group code and name pre-filled after sign-in. */
export function getGroupJoinUrl(inviteCode: string, groupName?: string): string {
  const path = groupName
    ? `/join/${inviteCode}?name=${encodeURIComponent(groupName)}`
    : `/join/${inviteCode}`
  return getAppUrl(path)
}

/** @deprecated Use getGroupJoinUrl */
export function getInviteUrl(inviteCode: string): string {
  return getGroupJoinUrl(inviteCode)
}
