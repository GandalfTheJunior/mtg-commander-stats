"""Dashboard #122 browser checks; run against Vite with Python Playwright/Chromium.
Uses synthetic API responses, no accounts or persisted demo data.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('MTG_UI_URL', 'http://127.0.0.1:5173')
OUTPUT = Path(os.environ.get('MTG_SCREENSHOTS', '/workspace/shared/122-statistics'))
OUTPUT.mkdir(parents=True, exist_ok=True)


def uid(n):
    return f'00000000-0000-4000-8000-{n:012d}'


def statistics(n=None):
    sizes = [n] if n else [2, 3, 4, 5, 6]
    return dict(players=[] if n == 6 else [dict(userId=uid(1), username='Ada', games=8, wins=3, winRatePercent=37.5)], decks=[],
                startPositions=[dict(playerCount=size, seats=[dict(startPosition=i, games=8 if size in [2, 4] else 0,
                    wins=3 if i == 1 and size in [2, 4] else 0,
                    winRatePercent=(37.5 if i == 1 else 0) if size in [2, 4] else None)
                    for i in range(1, size + 1)]) for size in sizes],
                manaColors=[dict(color=c, games=0 if n == 6 or c == 'C' else 8,
                    wins=0 if n == 6 or c == 'C' else 3,
                    winRatePercent=None if n == 6 or c == 'C' else 37.5) for c in 'WUBRGC'])


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    for width in [1440, 390, 320]:
        page = browser.new_page(viewport=dict(width=width, height=1000))
        calls, errors = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def api(route):
            path = route.request.url.split('/api/')[1]
            calls.append(path)
            data = {'me': dict(id=uid(1), username='Ada'), 'groups': [dict(id=uid(10), name='Testgruppe', role='OWNER')],
                    'decks': [], f'groups/{uid(10)}': dict(id=uid(10), name='Testgruppe', role='OWNER',
                    members=[dict(userId=uid(1), username='Ada', role='OWNER')]), f'groups/{uid(10)}/games': []}
            if '/statistics' in path:
                route.fulfill(json=statistics(int(path.split('=')[1]) if '=' in path else None))
            else:
                assert path in data, path
                route.fulfill(json=data[path])

        page.route('**/api/**', api)
        page.goto(f'{BASE}/playgroups/{uid(10)}')
        page.get_by_role('tab', name='Statistiken', exact=True).click()
        seats = page.get_by_role('region', name='Siegrate nach Startplatz', exact=True)
        colors = page.get_by_role('region', name='Siegrate nach Manafarbe', exact=True)
        expect(seats.get_by_role('region', name='2 Spieler', exact=True)).to_be_visible()
        expect(seats.get_by_role('region', name='4 Spieler', exact=True)).to_be_visible()
        expect(seats.get_by_role('region', name='3 Spieler', exact=True)).to_have_count(0)
        table = page.get_by_role('table') if width >= 900 else page.get_by_role('list', name='Spielerstatistiken')
        a, b, t = seats.bounding_box(), colors.bounding_box(), table.bounding_box()
        assert a['y'] >= t['y'] + t['height']
        if width >= 1200:
            assert abs(a['y'] - b['y']) < 2 and b['x'] >= a['x'] + a['width']
        else:
            assert b['y'] >= a['y'] + a['height']
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUTPUT / f'statistics-{width}.png'), full_page=True)
        page.get_by_role('button', name='Decks', exact=True).click()
        expect(seats).to_be_visible()
        expect(colors).to_be_visible()
        control = page.get_by_role('combobox', name='Spielerzahl')
        control.focus()
        control.select_option('4')
        expect(seats.get_by_role('region', name='2 Spieler', exact=True)).to_have_count(0)
        expect(seats.get_by_role('listitem')).to_have_count(4)
        expect(control).to_be_focused()
        control.select_option('6')
        expect(seats.get_by_text('Keine Daten vorhanden', exact=True)).to_be_visible()
        expect(seats.get_by_role('listitem')).to_have_count(0)
        expect(colors.get_by_text('0%', exact=True)).to_have_count(0)
        page.screenshot(path=str(OUTPUT / f'empty-{width}.png'), full_page=True)
        assert calls[-2:] == [f'groups/{uid(10)}/statistics?playerCount=4', f'groups/{uid(10)}/statistics?playerCount=6']
        assert not errors, errors
        print(f'PASS statistics viewport {width}')
        page.close()
    browser.close()
