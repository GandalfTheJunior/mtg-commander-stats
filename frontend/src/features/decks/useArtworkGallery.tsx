import { useState } from 'react'
import type { Deck } from './api'
import ArtworkGallery, { type ArtworkSlot } from './ArtworkGallery'

// Keep the dialog alive when reconciliation removes its original card or slot.
export function useArtworkGallery({ onUnauthorized, onUpdated, onReconciled, fallbackId }: {
  onUnauthorized: () => void; onUpdated: (deck: Deck) => void; onReconciled: (decks: Deck[]) => void; fallbackId: string
}) {
  const [selection, setSelection] = useState<{ deck: Deck; slot: ArtworkSlot; trigger: HTMLButtonElement } | null>(null)
  const close = () => {
    const trigger = selection?.trigger
    setSelection(null)
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
      else document.getElementById(fallbackId)?.focus()
    })
  }
  return {
    openArtwork: (deck: Deck, slot: ArtworkSlot, trigger: HTMLButtonElement) => setSelection({ deck, slot, trigger }),
    gallery: selection && <ArtworkGallery deck={selection.deck} slot={selection.slot} onClose={close}
      onUpdated={onUpdated} onReconciled={onReconciled} onUnauthorized={onUnauthorized} />,
  }
}
