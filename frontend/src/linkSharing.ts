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
 * and a selected read-only fallback field. Share and copy always use the exact `url` given.
 */
export function useLinkSharing(url: string | null, title: string) {
  const [copy, setCopy] = useState<CopyState>('idle')
  const [shareFailed, setShareFailed] = useState(false)
  const manualField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (copy === 'manual') { manualField.current?.focus(); manualField.current?.select() }
  }, [copy])
  const shareable = url !== null && canShare(url)

  async function share() {
    if (!url) return
    setShareFailed(false)
    try {
      await navigator.share({ title, url })
    } catch (error) {
      // Dismissing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareFailed(true)
    }
  }

  async function copyLink() {
    if (!url) return
    setCopy('idle')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopy('copied')
    } catch {
      setCopy('manual')
    }
  }
  return { url, shareable, share, copyLink, copy, shareFailed, manualField }
}

