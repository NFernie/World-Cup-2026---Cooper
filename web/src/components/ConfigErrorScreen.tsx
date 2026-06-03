import { getConfigError } from '@/lib/env'

export function ConfigErrorScreen() {
  const message = getConfigError() ?? 'Unknown configuration error.'

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-bold text-red-600">App configuration error</h1>
      <p className="mt-3 text-sm text-[var(--foreground)]">{message}</p>
      <p className="mt-4 text-sm text-[var(--muted)]">
        GitHub Pages builds embed these values at deploy time. Add secrets under Settings →
        Secrets → Actions, then re-run <strong>Deploy Web (GitHub Pages)</strong>.
      </p>
    </div>
  )
}
