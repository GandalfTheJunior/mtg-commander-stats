"""Browser regression for the personal Decks collection and editor (#201).

Run against an already running Vite server with synthetic API data and image fixtures;
no live account, backend or Scryfall traffic. Requires Python Playwright and Chromium.
MTG_UI_URL, CHROMIUM_PATH and MTG_SCREENSHOTS optionally override defaults.
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('MTG_UI_URL', 'http://127.0.0.1:5173')
OUTPUT = Path(os.environ.get('MTG_SCREENSHOTS', '/tmp/mtg-personal-decks-screenshots'))
OUTPUT.mkdir(parents=True, exist_ok=True)
PALETTE = ['#7a3b3b', '#3b5a7a', '#4d6b3b', '#6b5a2e', '#5a3b6b', '#2e6b66']
PARTNER = dict(roles=['PARTNER'], partnerWith=[], variants=[])
NONE = dict(roles=[], partnerWith=[], variants=[])


def uid(number):
    return f'00000000-0000-4000-8000-{number:012d}'


def art(number):
    return f'https://cards.scryfall.io/art_crop/synthetic-{number}.jpg'


def commander(name, slot, colors, number, pairing=NONE):
    return dict(position=slot, name=name, selectionRef=dict(scryfallCardId=uid(300 + number)), scryfallCardId=uid(300 + number),
                oracleId=uid(400 + number), pairing=pairing, colorIdentity=colors, effectiveColorIdentity=colors, chosenColor=None,
                requiresChosenColor=False, canBeSoleCommander=True, artworkFaceIndex=None, artCropUrl=art(number),
                illustrationId=uid(500 + number), artist='Synthetic artist', scryfallUri=None, cardFaces=None, relatedTokens=None)


def companion(name, colors, number):
    return dict(oracleId=uid(400 + number), name=name, selectionRef=dict(scryfallCardId=uid(300 + number)), scryfallCardId=uid(300 + number),
                colorIdentity=colors, artworkFaceIndex=None, artCropUrl=art(number), illustrationId=uid(500 + number),
                artist='Synthetic artist', scryfallUri=None, cardFaces=None)


def deck(number, name, commanders, colors, **extra):
    return dict(dict(id=uid(100 + number), name=name, commanders=commanders, colorIdentity=colors, everUsed=False, archived=False,
                     manaBoxUrl=None, companion=None, format='COMMANDER'), **extra)


DECKS = [
    deck(1, 'Atraxas Garten', [commander("Atraxa, Praetors' Voice", 1, ['W', 'U', 'B', 'G'], 1)], ['W', 'U', 'B', 'G'],
         manaBoxUrl='https://manabox.app/decks/Synthetic-Mixed_123'),
    deck(2, 'Partner-Protokoll', [commander("Kraum, Ludevic's Opus", 1, ['U', 'R'], 2, PARTNER),
                                  commander('Tymna the Weaver', 2, ['W', 'B'], 3, PARTNER)], ['W', 'U', 'B', 'R'],
         everUsed=True, companion=companion('Obosh, the Preypiercer', ['B', 'R'], 10)),
    deck(3, 'Wiederkehr', [commander('Muldrotha, the Gravetide', 1, ['U', 'B', 'G'], 4)], ['U', 'B', 'G'],
         companion=companion('Umori, the Collector', ['B', 'G'], 11)),
    deck(4, 'Altes Deck', [commander('Karn, Silver Golem ' + 'with an unusually long synthetic name ' * 2, 1, [], 5)], [],
         everUsed=True, archived=True),
]
CHOICES = [dict(selectionRef=dict(scryfallCardId=uid(600 + n)), scryfallCardId=uid(600 + n), name=name, colorIdentity=colors,
                requiresChosenColor=False, canBeSoleCommander=True, thumbnailUrl=None, pairing=NONE)
           for n, (name, colors) in enumerate([('Niv-Mizzet, Parun', ['U', 'R']), ('Niv-Mizzet, the Firemind', ['U', 'R']),
                                               ('Niv-Mizzet, Dracogenius', ['U', 'R']), ('Niv-Mizzet Reborn', ['W', 'U', 'B', 'R', 'G']),
                                               ('Niv-Mizzet, Supreme', ['W', 'U', 'B', 'R', 'G']), ('Niv-Mizzet, Visionary', ['U', 'R'])])]


def image(route):
    number = int(re.search(r'synthetic-(\d+)', route.request.url).group(1))
    route.fulfill(content_type='image/svg+xml', body=(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="626" height="457"><rect width="626" height="457" fill="{PALETTE[number % 6]}"/>'
        '<path d="M0 457 L200 230 L330 360 L460 200 L626 457Z" fill="#000" opacity=".35"/>'
        f'<text x="24" y="430" font-size="34" fill="#fff" font-family="sans-serif">SYNTHETIC ART {number}</text></svg>'))


def api(requests, decks):
    def handle(route):
        url = route.request.url.split('/api/', 1)[1]
        path, _, query = url.partition('?')
        requests.append((route.request.method, url))
        if path == 'me':
            return route.fulfill(json=dict(id=uid(1), username='Synthetic owner'))
        if path == 'csrf':
            return route.fulfill(json=dict(headerName='X-CSRF-TOKEN', token='synthetic'))
        if path == 'groups':
            return route.fulfill(json=[])
        if path == 'decks' and route.request.method == 'GET':
            return route.fulfill(json=decks)
        if path == 'scryfall/commanders':
            needle = re.search(r'q=([^&]*)', query).group(1).lower()
            return route.fulfill(json=[choice for choice in CHOICES if needle in choice['name'].lower()])
        match = re.fullmatch(r'scryfall/cards/([^/]+)/artworks', path)
        if match:
            return route.fulfill(json=[dict(scryfallCardId=match.group(1) if n == 0 else uid(800 + n), artworkFaceIndex=None,
                                            artCropUrl=art(20 + n), illustrationId=uid(900 + n), artist=f'Artist {n + 1}', scryfallUri=None)
                                       for n in range(3)])
        raise AssertionError(f'Unexpected API request: {route.request.method} {url}')
    return handle


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'horizontal page scroll'


def boxes(page, names):
    return [page.get_by_role('button', name=name, exact=True).bounding_box() for name in names]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                         headless=True, args=['--no-sandbox'])
    for width, height in [(1280, 1400), (390, 844), (320, 640)]:
        context = browser.new_context(viewport=dict(width=width, height=height))
        requests, errors = [], []
        context.route('**/api/**', api(requests, DECKS))
        context.route('https://cards.scryfall.io/**', image)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))

        page.goto(f'{BASE}/decks')
        active = page.get_by_role('list', name='Aktive Decks')
        expect(active.get_by_role('listitem')).to_have_count(3)
        archive = page.get_by_role('button', name='Archivierte Decks', exact=True)
        expect(archive).to_have_attribute('aria-expanded', 'false')
        # The collection overflows a phone viewport, so the search appears there but not at desktop height.
        search = page.get_by_role('searchbox', name='Deckname oder Commander suchen')
        expect(search).to_have_count(0 if width == 1280 else 1)
        # Pair + Companion: three independent artwork targets, never nested in the editor target.
        pair = boxes(page, ["Artwork für Kraum, Ludevic's Opus ändern", 'Artwork für Tymna the Weaver ändern',
                            'Artwork für Companion Obosh, the Preypiercer ändern'])
        assert abs(pair[0]['width'] - pair[1]['width']) < 1 and pair[0]['x'] < pair[1]['x'], pair
        assert pair[2]['width'] < pair[0]['width'] + pair[1]['width'] and pair[2]['y'] > pair[0]['y'], pair
        assert all(button.evaluate('(el) => !el.parentElement.closest("button, a")') for button in
                   page.get_by_role('button', name=re.compile('^(Artwork für|Karte anzeigen)')).all())
        link = page.get_by_role('link', name='Atraxas Garten: Deck in ManaBox ansehen (öffnet einen neuen Tab)', exact=True)
        assert link.evaluate('(el) => !el.closest("button") && el.getBoundingClientRect().height >= 48')
        # The bottom navigation stays fixed on phones while the page itself scrolls.
        if width < 600:
            assert page.get_by_role('navigation', name='Main navigation').evaluate('(el) => getComputedStyle(el).position') == 'fixed'
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'collection-{width}.png'), full_page=True, animations='disabled')
        if width != 1280:
            search.fill('karn')
            expect(archive).to_have_attribute('aria-expanded', 'true')
            expect(active).to_have_count(0)
            page.screenshot(path=str(OUTPUT / f'collection-search-{width}.png'), full_page=True, animations='disabled')
            search.fill('')
            expect(archive).to_have_attribute('aria-expanded', 'false')

        page.get_by_role('button', name='Partner-Protokoll bearbeiten', exact=True).click()
        expect(page.get_by_role('heading', name='Deck bearbeiten')).to_be_visible()
        if width < 600:
            expect(page.get_by_role('navigation', name='Main navigation')).to_be_hidden()
        preview = page.get_by_role('group', name='Artwork-Vorschau')
        box = preview.bounding_box()
        assert 140 <= box['height'] <= 170, box
        first, second, small = boxes(page, ["Artwork für Kraum, Ludevic's Opus wählen", 'Artwork für Tymna the Weaver wählen',
                                            'Artwork für Companion Obosh, the Preypiercer wählen'])
        assert abs(first['width'] - second['width']) < 1 and abs(first['y'] - second['y']) < 1, (first, second)
        assert small['width'] < first['width'] and small['y'] + small['height'] > first['y'] + first['height'], small
        assert small['width'] >= 44 and small['height'] >= 44
        # Locked controls are aria-disabled yet still activatable to explain the lock.
        page.get_by_role('button', name='Commander 1 ändern (gesperrt)', exact=True).click(force=True)
        expect(page.get_by_text('Feld gesperrt – dieses Deck wurde bereits gespielt.')).to_be_visible()
        expect(page.get_by_role('button', name='Änderungen speichern', exact=True)).to_be_disabled()
        menu = page.get_by_role('button', name='Deckaktionen', exact=True)
        menu.click()
        expect(page.get_by_role('menuitem')).to_have_count(1)
        page.keyboard.press('Escape')
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'edit-{width}.png'), full_page=True, animations='disabled')
        page.get_by_role('textbox', name='Deckname').fill('Partner-Protokoll (neu)')
        menu.click()
        page.get_by_role('menuitem', name='Archivieren').click()
        dialog = page.get_by_role('dialog', name='Deck archivieren?')
        expect(dialog).to_contain_text('Ungespeicherte Änderungen werden verworfen.')
        page.screenshot(path=str(OUTPUT / f'archive-dialog-{width}.png'), animations='disabled')
        dialog.get_by_role('button', name='Abbrechen', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.get_by_role('button', name='Abbrechen', exact=True).click()
        expect(page.get_by_role('dialog', name='Änderungen verwerfen?')).to_be_visible()
        page.screenshot(path=str(OUTPUT / f'discard-dialog-{width}.png'), animations='disabled')
        page.get_by_role('button', name='Änderungen verwerfen', exact=True).click()
        expect(page.get_by_role('heading', name='Meine Decks')).to_be_visible()

        page.goto(f'{BASE}/decks/new')
        expect(page.get_by_role('group', name='Artwork-Vorschau')).to_have_count(0)
        expect(page.get_by_role('radio', name='Commander', exact=True)).to_have_attribute('aria-checked', 'true')
        formats = [page.get_by_role('radio', name=name, exact=True).bounding_box() for name in ['Commander', 'Pauper Commander']]
        assert abs(formats[0]['width'] - formats[1]['width']) < 1 and abs(formats[0]['y'] - formats[1]['y']) < 1, formats
        assert page.evaluate('document.activeElement.tagName') != 'INPUT', 'no automatic text focus'
        name = page.get_by_role('textbox', name='Deckname')
        name.fill('')
        name.blur()
        expect(page.get_by_text('Deckname darf nicht leer sein.')).to_be_visible()
        name.fill('Drachen-Protokoll')
        field = page.get_by_role('combobox', name='Commander')
        field.fill('Niv')
        listbox = page.get_by_role('listbox', name='Commander: Vorschläge')
        expect(listbox.get_by_role('option')).to_have_count(6)
        assert listbox.evaluate('(el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 5 * 56 + 2')
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'search-{width}.png'), full_page=True, animations='disabled')
        before = field.bounding_box()['y']
        listbox.get_by_role('option', name='Niv-Mizzet, Parun').click()
        row = page.get_by_role('region', name='Commander')
        expect(page.get_by_role('group', name='Artwork-Vorschau')).to_be_visible()
        # Scroll anchoring keeps the active Commander field where it was when the preview appears above it.
        # Anchoring needs scroll range: on a short page the browser cannot scroll further.
        at_end = page.evaluate('window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1')
        assert abs(row.bounding_box()['y'] - before) < 24 or at_end, (row.bounding_box(), before)
        page.evaluate('window.scrollTo(0, 0)')
        page.get_by_role('button', name='Artwork für Niv-Mizzet, Parun wählen', exact=True).click()
        page.get_by_role('button', name=re.compile('^Illustration 2 von Artist 2 auswählen')).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.get_by_role('img', name='Illustration für Niv-Mizzet, Parun')).to_have_attribute('src', art(21))
        expect(page.get_by_role('button', name='Deck erstellen', exact=True)).to_be_enabled()
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'create-{width}.png'), full_page=True, animations='disabled')
        assert not errors, errors
        assert not [request for request in requests if request[0] != 'GET'], requests
        context.close()
    browser.close()
print(f'PASS: collection, search, archive, cards, editor preview, locks, dialogs and create flow at 1280/390/320px. Screenshots: {OUTPUT}')
