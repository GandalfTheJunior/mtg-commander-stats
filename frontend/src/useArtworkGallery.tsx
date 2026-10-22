import { useState } from 'react'
import type { Deck, SavedCommander } from './api'
import ArtworkGallery from './ArtworkGallery'

// Keep the dialog alive when reconciliation removes its original card or slot.
export function useArtworkGallery({ onUnauthorized, onUpdated, onReconciled, fallbackId }: {
  onUnauthorized: () => void; onUpdated: (deck: Deck) => void; onReconciled: (decks: Deck[]) => void; fallbackId: string
}) {
  const [selection, setSelection] = useState<{ deck: Deck; commander: SavedCommander; trigger: HTMLButtonElement } | null>(null)
  const close = () => {
    const trigger = selection?.trigger
    setSelection(null)
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
      else document.getElementById(fallbackId)?.focus()
    })
  }
  return {
    openArtwork: (deck: Deck, commander: SavedCommander, trigger: HTMLButtonElement) => setSelection({ deck, commander, trigger }),
    gallery: selection && <ArtworkGallery deck={selection.deck} commander={selection.commander} onClose={close}
      onUpdated={onUpdated} onReconciled={onReconciled} onUnauthorized={onUnauthorized} />,
  }
}
