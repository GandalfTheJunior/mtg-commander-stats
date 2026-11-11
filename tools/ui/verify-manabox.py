"""ManaBox UI regression using synthetic API data and Chromium, never a live account.

Run against Vite; MTG_UI_URL, CHROMIUM_PATH and MTG_SCREENSHOTS override defaults.
Requires Python Playwright. External destinations are intercepted, not contacted.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('MTG_UI_URL', 'http://127.0.0.1:5173')
OUTPUT = Path(os.environ.get('MTG_SCREENSHOTS', '/tmp/mtg-manabox-screenshots'))
OUTPUT.mkdir(parents=True, exist_ok=True)
URL = 'https://manabox.app/decks/Synthetic-Mixed_123'


def uid(number):
    return f'00000000-0000-4000-8000-{number:012d}'


def commander(number):
    return dict(position=1, name=f'Commander {number}', oracleId=uid(400 + number),
                selectionRef=dict(scryfallCardId=uid(300 + number)), scryfallCardId=uid(300 + number),
                pairing=dict(roles=[], partnerWith=[], variants=[]), colorIdentity=['G'],
                effectiveColorIdentity=['G'], chosenColor=None, requiresChosenColor=False,
                canBeSoleCommander=True, artworkFaceIndex=None, artCropUrl=None,
                illustrationId=None, artist=None, scryfallUri=None)


DECKS = [dict(id=uid(100 + n), name=f'Demo deck {n}', commanders=[commander(n)],
              colorIdentity=['G'], everUsed=True, archived=n == 2, manaBoxUrl=f'{URL}-{n}')
         for n in range(1, 5)]
GROUP = dict(id=uid(10), name='ManaBox demo group', role='OWNER', members=[
    dict(userId=uid(n), username=f'Player {n}', role='OWNER' if n == 1 else 'MEMBER')
    for n in range(1, 4)])
GAME = dict(id=uid(20), groupId=GROUP['id'], creatorId=uid(1), recordedAt='2026-11-04T12:00:00Z',
            result='WIN', alternateWinCon=False, winnerUserId=uid(1), participants=[
                dict(userId=uid(n), username=f'Player {n}', deckId=DECKS[n - 1]['id'],
                     startPosition=n, placement=n, stillInGame=n == 1,
                     deck={k: v for k, v in DECKS[n - 1].items()
                           if k != 'everUsed' and (k != 'manaBoxUrl' or n < 3)})
                for n in range(1, 5)])


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                         headless=True, args=['--no-sandbox'])
    for width in [1280, 390, 320]:
        context = browser.new_context(viewport=dict(width=width, height=900))
        requests, errors = [], []

        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            requests.append(path)
            responses = {'me': dict(id=uid(1), username='ManaBox demo'), 'groups': [GROUP],
                         'decks': DECKS, f'groups/{uid(10)}': GROUP,
                         f'groups/{uid(10)}/games/{uid(20)}': GAME}
            assert path in responses, f'Unexpected API request: {path}'
            route.fulfill(json=responses[path])

        context.route('**/api/**', api)
        context.route('https://manabox.app/**', lambda route: route.fulfill(
            content_type='text/html', body='<h1>Synthetic external destination</h1>'))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'{BASE}/decks')
        # Demo deck 2 is archived and stays in the collapsed archive section until expanded (#201).
        expect(page.get_by_role('link', name='Deck in ManaBox ansehen', exact=False)).to_have_count(3)
        page.get_by_role('button', name='Archivierte Decks', exact=True).click()
        expect(page.get_by_role('link', name='Deck in ManaBox ansehen', exact=False)).to_have_count(4)
        link = page.get_by_role('link', name='Demo deck 2: Deck in ManaBox ansehen (öffnet einen neuen Tab)', exact=True)
        expect(link).to_have_attribute('href', f'{URL}-2')
        expect(link).to_have_attribute('target', '_blank')
        expect(link).to_have_attribute('rel', 'noopener noreferrer')
        assert link.evaluate('(el) => !el.closest("button") && el.getBoundingClientRect().height >= 48')
        link.focus()
        page.keyboard.press('Tab')
        page.keyboard.press('Shift+Tab')
        expect(link).to_be_focused()
        assert link.evaluate('(el) => getComputedStyle(el).outlineStyle') == 'solid'
        with page.expect_popup() as opened:
            page.keyboard.press('Enter')
        popup = opened.value
        popup.wait_for_load_state()
        assert popup.url == f'{URL}-2'
        assert popup.evaluate('window.opener === null')
        popup.close()
        assert page.url == f'{BASE}/decks'
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'decks-{width}.png'), full_page=True, animations='disabled')

        page.goto(f'{BASE}/dashboard')
        expect(page.get_by_role('heading', name='Dashboard', exact=True)).to_be_visible()
        expect(page.get_by_role('heading', name='Demo deck 2', exact=True)).to_have_count(0)
        expect(page.get_by_role('link', name='Deck in ManaBox ansehen', exact=False)).to_have_count(0)

        page.goto(f'{BASE}/decks/{uid(102)}/edit')
        field = page.get_by_role('textbox', name='ManaBox-Link', exact=True)
        expect(field).to_have_value(f'{URL}-2')
        expect(field).to_be_editable()
        expect(page.get_by_role('button', name='Commander ändern (gesperrt)', exact=True)).to_have_attribute('aria-disabled', 'true')
        field.focus()
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'editor-{width}.png'), full_page=True, animations='disabled')
        field.fill('   ')
        field.blur()
        expect(field).to_have_attribute('aria-invalid', 'true')
        expect(page.get_by_role('button', name='Änderungen speichern', exact=True)).to_be_disabled()
        page.screenshot(path=str(OUTPUT / f'validation-{width}.png'), full_page=True, animations='disabled')
        field.fill(f'{URL}-New')
        page.get_by_role('button', name='Abbrechen', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        page.get_by_role('button', name='Weiter bearbeiten', exact=True).click()
        expect(field).to_have_value(f'{URL}-New')
        page.get_by_role('button', name='Abbrechen', exact=True).click()
        page.get_by_role('button', name='Änderungen verwerfen', exact=True).click()
        expect(page.get_by_role('heading', name='Meine Decks', exact=True)).to_be_visible()

        page.goto(f'{BASE}/decks/new')
        expect(field).to_have_value('')
        expect(field).to_be_editable()
        page.screenshot(path=str(OUTPUT / f'create-{width}.png'), full_page=True, animations='disabled')
        page.goto(f'{BASE}/playgroups/{uid(10)}/games/{uid(20)}')
        participants = page.get_by_role('list', name='Teilnehmende und Decks')
        expect(participants.get_by_role('listitem')).to_have_count(4)
        expect(participants.get_by_role('link', name='Deck in ManaBox ansehen', exact=False)).to_have_count(2)
        expect(participants.get_by_text('Archiviertes Deck', exact=True)).to_have_count(1)
        expect(participants.get_by_text('Ehemaliges Mitglied', exact=True)).to_have_count(1)
        for index in range(4):
            card = participants.get_by_role('listitem').nth(index)
            expect(card.get_by_role('link')).to_have_count(1 if index < 2 else 0)
        no_overflow(page)
        page.screenshot(path=str(OUTPUT / f'game-{width}.png'), full_page=True, animations='disabled')
        assert not errors, errors
        assert not any('scryfall' in path for path in requests), requests
        context.close()
    browser.close()
print(f'PASS: owner/detail links, keyboard popup isolation, editor/validation/guards, Dashboard omission and layout at 1280/390/320px. Screenshots: {OUTPUT}')
