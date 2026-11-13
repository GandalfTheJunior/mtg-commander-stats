import { useEffect, useRef, useState } from 'react'

type CopyState = 'idle' | 'copied' | 'manual'

/** Native share only where the browser offers it; never a dead placeholder (#200 §2.2). */
function canShare(url: string) {
  if (typeof navigator.share !== 'function') return false
  try {
    return typeof navigator.canShare === 'function' ? navigator.canShare({ url }) : true
  } catch {
    return false
  }
}

/**
 * #200 share behavior, reused by #247 claim links: native share only where available, truthful clipboard feedback
 * and a selected read-only fallback field. Share and copy always use the exact `url` given. Feedback belongs to the
 * URL it was produced for: when the URL changes (a link expires, is replaced or closed), earlier feedback and any
 * still pending share/copy completion for the retired URL are never shown for the new one.
 */
export function useLinkSharing(url: string | null, title: string) {
  const [feedback, setFeedback] = useState<{ url: string; copy: CopyState; shareFailed: boolean } | null>(null)
  const current = feedback !== null && feedback.url === url ? feedback : null
  const copy: CopyState = current?.copy ?? 'idle'
  const shareFailed = current?.shareFailed ?? false
  const manualField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (copy === 'manual') { manualField.current?.focus(); manualField.current?.select() }
  }, [copy])
  const shareable = url !== null && canShare(url)
  /** Records feedback for `target`; a completion for a URL that is no longer shown is simply never displayed. */
  const report = (target: string, change: { copy?: CopyState; shareFailed?: boolean }) => setFeedback(previous => ({
    url: target,
    copy: change.copy ?? (previous?.url === target ? previous.copy : 'idle'),
    shareFailed: change.shareFailed ?? (previous?.url === target ? previous.shareFailed : false),
  }))

  async function share() {
    if (!url) return
    const target = url
    report(target, { shareFailed: false })
    try {
      await navigator.share({ title, url: target })
    } catch (error) {
      // Dismissing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) report(target, { shareFailed: true })
    }
  }

  async function copyLink() {
    if (!url) return
    const target = url
    report(target, { copy: 'idle' })
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(target)
      report(target, { copy: 'copied' })
    } catch {
      report(target, { copy: 'manual' })
    }
  }
  return { url, shareable, share, copyLink, copy, shareFailed, manualField }
}
