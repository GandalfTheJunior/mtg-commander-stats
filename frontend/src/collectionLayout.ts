/**
 * Whether the complete, unfiltered collection would overflow the initially available viewport area (#201).
 * `listBottom` is the document offset of the rendered list end; `hiddenCards` collapsed archived cards are
 * estimated with the measured height of a rendered card. The fixed phone navigation reduces the area.
 */
export function collectionOverflows(list: HTMLElement, hiddenCards: number): boolean {
  const rect = list.getBoundingClientRect()
  const card = list.querySelector('li')?.getBoundingClientRect().height || 140
  const navigation = document.querySelector('nav[aria-label="Main navigation"]')
  const fixedNavigation = navigation && getComputedStyle(navigation).position === 'fixed' ? navigation.getBoundingClientRect().height : 0
  const viewport = window.visualViewport?.height ?? window.innerHeight
  const bottom = rect.bottom + window.scrollY + hiddenCards * (card + 16)
  return bottom > viewport - fixedNavigation
}
