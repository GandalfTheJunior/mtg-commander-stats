"""Browser layout regression for #104. Run against an already running Vite server.

Requires Python Playwright and Chromium; no live API, account or Scryfall traffic.
MTG_UI_URL, CHROMIUM_PATH and MTG_SCREENSHOTS optionally override defaults.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('MTG_UI_URL', 'http://127.0.0.1:5173')
OUTPUT = Path(os.environ.get('MTG_SCREENSHOTS', '/tmp/mtg-saved-art-screenshots'))
OUTPUT.mkdir(parents=True, exist_ok=True)


def uid(number):
    return f'00000000-0000-4000-8000-{number:012d}'


def commander(name, slot=1, image=True):
    return dict(position=slot, name=name, selectionRef=dict(scryfallCardId=uid(300 + slot)),
                scryfallCardId=uid(300 + slot), oracleId=uid(400 + slot),
                pairing=dict(roles=[], partnerWith=[], variants=[]),
                colorIdentity=[], effectiveColorIdentity=['G'] if slot == 1 else [],
                chosenColor='G' if slot == 1 else None, requiresChosenColor=slot == 1,
                canBeSoleCommander=True, artworkFaceIndex=1 if slot == 2 else None,
                artCropUrl=f'https://cards.scryfall.io/art_crop/test-{slot}.jpg' if image else None,
                illustrationId=uid(500 + slot), artist=f'Test artist {slot}' if image else None,
                scryfallUri=f'https://scryfall.com/card/test/{slot}')


DECKS = [
    dict(id=uid(101), name='Partner-Deck', commanders=[commander('The Prismatic Piper'),
         commander('Second Commander with a long name', 2)], colorIdentity=['G'], everUsed=True, archived=True),
    dict(id=uid(102), name='Ein Commander', commanders=[commander('Single Commander')],
         colorIdentity=['G'], everUsed=False, archived=False),
    dict(id=uid(103), name='Ohne Illustration', commanders=[commander('VeryLongCommanderName' * 6, image=False)],
         colorIdentity=[], everUsed=True, archived=False),
]


def verify_geometry(page, card, narrow):
    slots = card.locator('.deck-artwork-slot')
    first, second = [slots.nth(i).bounding_box() for i in range(2)]
    assert first['x'] < second['x'] and first['y'] < second['y'], (first, second)
    overlap = first['x'] + first['width'] - second['x']
    assert 0.18 < overlap / first['width'] < 0.22, overlap
    assert second['y'] < first['y'] + first['height']
    # The upper-left image must paint above the lower-right image in the overlap.
    front = slots.nth(0).evaluate('''(el, [x, y]) => document.elementFromPoint(x, y)?.closest('.deck-artwork-slot') === el''',
                          [second['x'] + 2, second['y'] + 2])
    assert front
    art = card.locator('.deck-artwork').bounding_box()
    text = card.get_by_role('button').bounding_box()
    if narrow:
        assert text['y'] >= art['y'] + art['height'], (text, art)
    else:
        assert text['x'] >= art['x'] + art['width'], (text, art)
    assert card.evaluate('(el) => el.scrollWidth <= el.clientWidth')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    # Long text must wrap rather than be clamped or scroll within its text area.
    for paragraph in page.locator('button p').all():
        assert paragraph.evaluate('(el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                         headless=True, args=['--no-sandbox'])
    for route_name in ['dashboard', 'decks']:
        for width in [1280, 600, 375, 320]:
            page = browser.new_page(viewport=dict(width=width, height=1000))
            requests = []
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))

            def api(route):
                path = route.request.url.split('/api/', 1)[1]
                requests.append(path)
                responses = {'me': dict(id=uid(1), username='UI test'), 'groups': [], 'decks': DECKS}
                assert path in responses, f'Unexpected API call: {path}'
                route.fulfill(json=responses[path])

            def art(route):
                # Deliberately synthetic image fixtures; verify rendering without provider access.
                number = 2 if 'test-2' in route.request.url else 1
                color = '#3b6778' if number == 2 else '#8f5367'
                svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="{color}"/><circle cx="200" cy="150" r="95" fill="#dbb977"/><text x="200" y="155" font-size="28" text-anchor="middle">Testbild {number}</text></svg>'
                route.fulfill(content_type='image/svg+xml', body=svg)

            page.route('**/api/**', api)
            page.route('https://cards.scryfall.io/**', art)
            page.goto(f'{BASE_URL}/{route_name}')
            pair = page.get_by_role('heading', name='Partner-Deck', exact=True).locator('xpath=ancestor::li[1]')
            expect(pair).to_be_visible()
            pair.scroll_into_view_if_needed()
            expect(pair.locator('img')).to_have_count(2)
            page.wait_for_function('Array.from(document.querySelectorAll(".deck-artwork img")).every(img => img.complete && img.naturalWidth > 0)')
            verify_geometry(page, pair, width < 600)
            single = page.get_by_role('heading', name='Ein Commander', exact=True).locator('xpath=ancestor::li[1]')
            expect(single.locator('.deck-artwork-slot')).to_have_count(1)
            expect(page.get_by_role('img', name='Keine Illustration für ' + DECKS[2]['commanders'][0]['name'] + ' verfügbar')).to_be_visible()
            assert pair.get_by_role('button').get_attribute('aria-describedby')
            assert not page.locator('button a, a button, button button, .deck-artwork button, .deck-artwork a').count()
            # Source links are independent keyboard targets; opening one keeps editor navigation untouched.
            source = pair.get_by_role('link', name='Quelle zu Commander 2:', exact=False)
            source.focus()
            expect(source).to_be_focused()
            page.route('https://scryfall.com/**', lambda route: route.fulfill(body='Source fixture'))
            with page.expect_popup() as popup:
                source.press('Enter')
            popup.value.close()
            assert page.url.endswith('/' + route_name)
            assert not any('scryfall' in request for request in requests)
            if width in [1280, 375]:
                page.locator('main').focus()
                page.screenshot(path=str(OUTPUT / f'{route_name}-{width}.png'), full_page=True)
                pair.screenshot(path=str(OUTPUT / f'{route_name}-card-{width}.png'))
            if width == 1280:
                # Reflow follows the card's available width, even inside a wide viewport.
                pair.evaluate('(el) => el.style.width = "300px"')
                verify_geometry(page, pair, True)
            # Stored URL failure shows a fallback with the saved back-side credit still present.
            image = pair.locator('img').nth(1)
            image.evaluate('(el) => el.dispatchEvent(new Event("error"))')
            expect(pair.get_by_role('img', name='Keine Illustration für Second Commander with a long name verfügbar')).to_be_visible()
            expect(pair.get_by_text('2 · Illustration: Test artist 2', exact=False)).to_be_visible()
            assert not any('scryfall' in request for request in requests)
            pair.scroll_into_view_if_needed()
            verify_geometry(page, pair, width < 600 or width == 1280)
            editor = pair.get_by_role('button')
            editor.focus()
            editor.press('Space')
            expect(page.get_by_role('form', name='Deck Partner-Deck bearbeiten', exact=True)).to_be_visible()
            assert page.url.endswith(f'/decks/{uid(101)}/edit')
            assert not any('scryfall' in request for request in requests)
            assert not errors, errors
            print(json.dumps(dict(screen=route_name, width=width, overlap='20%', result='PASS')))
            page.close()
    browser.close()
print(f'Screenshots: {OUTPUT}')
