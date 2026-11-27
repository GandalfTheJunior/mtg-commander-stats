import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { CommanderArtwork } from './CommanderArtwork'

const source = 'https://cards.scryfall.io/art_crop/front/a.jpg'
test('source and Commander changes reset failed images; missing sources remove old images', () => {
  const { rerender } = render(<CommanderArtwork commander={{ name: 'First', artCropUrl: source }} />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveAccessibleName('Keine Illustration für First verfügbar')
  rerender(<CommanderArtwork commander={{ name: 'First', artCropUrl: source + '?new' }} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', source + '?new')
  rerender(<CommanderArtwork commander={{ name: 'New', artCropUrl: source }} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', source)
  fireEvent.error(screen.getByRole('img'))
  rerender(<CommanderArtwork commander={{ name: 'Other', artCropUrl: source }} />)
  expect(screen.getByRole('img')).toHaveAccessibleName('Illustration für Other')
  rerender(<CommanderArtwork commander={{ name: 'Other', artCropUrl: null }} />)
  expect(screen.getByRole('img')).not.toHaveAttribute('src')
})
test.each(['http://cards.scryfall.io/a.jpg', 'https://scryfall.io.evil.test/a.jpg', 'https://evil.test/a.jpg', 'https://user:pass@cards.scryfall.io/a.jpg', 'https://cards.scryfall.io:8443/a.jpg', 'javascript:alert(1)'])('unsafe source falls back: %s', artCropUrl => {
  render(<CommanderArtwork commander={{ name: 'Safe', artCropUrl }} />)
  expect(screen.getByRole('img')).not.toHaveAttribute('src')
})
