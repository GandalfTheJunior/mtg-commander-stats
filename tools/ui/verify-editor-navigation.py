"""Native POP regression for #129, against Vite with fictional API fixtures.
Run: python tools/ui/verify-editor-navigation.py [base URL] [screenshot directory]
Requires Python Playwright; adds no app dependency. Install its portable browser:
    python -m playwright install chromium
Then run the command above (also on macOS). To use an existing browser instead:
    CHROMIUM_PATH=/path/to/chromium python tools/ui/verify-editor-navigation.py
Only completed POP/restoration sequences are asserted. This does not prove that
an additional user traversal interrupted an in-flight guard restoration.
"""
from collections import Counter
from pathlib import Path
import os
import sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/mtg-navigation-screenshots')
OUT.mkdir(parents=True, exist_ok=True)

def uid(n):
    return f'00000000-0000-4000-8000-{n:012d}'

group_path = f'/playgroups/{uid(10)}'
group = dict(id=uid(10), name='Navigation test pod', role='OWNER', members=[
    dict(userId=uid(n), username=f'Player {n}', role='OWNER' if n == 1 else 'MEMBER')
    for n in range(1, 4)])
calls = Counter()

def api(route):
    path = route.request.url.split('/api/', 1)[1]
    assert route.request.method == 'GET', 'Navigation must never write'
    calls[path] += 1
    replies = {'me': dict(id=uid(1), username='Navigation test'), 'groups': [group],
               f'groups/{uid(10)}': group, 'decks': [],
               f'groups/{uid(10)}/games': [],
               f'groups/{uid(10)}/statistics': dict(players=[], decks=[])}
    for n in range(1, 4):
        replies[f'groups/{uid(10)}/members/{uid(n)}/decks'] = []
    assert path in replies, path
    route.fulfill(json=replies[path])

with sync_playwright() as p:
    # None selects Playwright's installed Chromium on every supported platform.
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, headless=True)
    page = browser.new_page(viewport=dict(width=1280, height=1000))
    # Capture before application listeners, including POPs suppressed by the guard.
    # Observation only: do not stop, dispatch or replace native events/traversals.
    page.add_init_script("""
        window.__editorPops = [];
        window.addEventListener('popstate', event => {
            window.__editorPops.push({index: event.state?.idx, path: location.pathname});
        }, true);
    """)
    expected_pops = []

    def expect_pops(*indices):
        expected_pops.extend(dict(index=index, path='/playgroups' if index == list_index else group_path)
                             for index in indices)
        page.wait_for_function('(expected) => window.__editorPops.length >= expected.length', arg=expected_pops)
        observed = page.evaluate('window.__editorPops')
        assert observed == expected_pops, dict(expected=expected_pops, observed=observed)

    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/**', api)
    page.goto(BASE + '/playgroups')
    expect(page.get_by_role('button', name='Navigation test pod', exact=True)).to_be_visible()
    list_index = page.evaluate('history.state.idx')
    for iteration in range(30):
        initial_reads = calls[f'groups/{uid(10)}']
        expected_pops.clear()
        page.evaluate('window.__editorPops = []')
        page.get_by_role('button', name='Navigation test pod', exact=True).click()
        expect(page.get_by_role('button', name='Spiel erfassen', exact=True)).to_be_visible()
        group_index = page.evaluate('history.state.idx')
        length = page.evaluate('history.length')
        assert group_index == list_index + 1
        page.get_by_role('button', name='Spiel erfassen', exact=True).click()
        field = page.get_by_role('combobox', name='Spieler 1', exact=True, include_hidden=True)
        field.select_option(uid(2))
        field.focus()
        # Cancel immediately, then Back again while MUI may still be exiting.
        page.evaluate('history.back()')
        page.get_by_role('button', name='Im Editor bleiben', exact=True).click()
        page.wait_for_function('([path, idx]) => location.pathname === path && history.state.idx === idx', arg=[group_path, group_index])
        expect_pops(list_index, group_index)
        page.evaluate('history.back()')
        expect(page.get_by_role('button', name='Verwerfen und verlassen', exact=True)).to_be_enabled()
        expect_pops(list_index, group_index)
        expect(field).to_have_value(uid(2))
        if iteration == 29:
            page.screenshot(path=str(OUT / 'discard-dialog.png'), full_page=True)
        page.get_by_role('button', name='Im Editor bleiben', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.wait_for_function('([path, idx]) => location.pathname === path && history.state.idx === idx', arg=[group_path, group_index])
        expect(field).to_be_focused()
        # Same-group native tab history remains exempt and keeps the draft.
        for tab in ['Statistiken', 'Mitglieder']:
            page.get_by_role('tab', name=tab, exact=True).click()
        page.evaluate('history.back()')
        expect(page.get_by_role('tab', name='Statistiken', exact=True)).to_have_attribute('aria-selected', 'true')
        expect_pops(group_index + 1)
        page.evaluate('history.back()')
        expect(page.get_by_role('tab', name='Spiele', exact=True)).to_have_attribute('aria-selected', 'true')
        expect_pops(group_index)
        expect(field).to_have_value(uid(2))
        expect(page.get_by_role('dialog')).to_have_count(0)
        # Observe the blocked Back and its restoration before confirming discard.
        page.evaluate('history.back()')
        expect(page.get_by_role('dialog')).to_be_visible()
        expect_pops(list_index, group_index)
        page.get_by_role('button', name='Verwerfen und verlassen', exact=True).click()
        expect(page.get_by_role('button', name='Gruppe erstellen', exact=True)).to_be_visible()
        expect_pops(list_index)
        assert page.url == BASE + '/playgroups'
        assert page.evaluate('history.state.idx') == list_index
        expect(page.get_by_role('form', name='Spiel erfassen', exact=True)).to_have_count(0)
        page.evaluate('history.forward()')
        expect(page.get_by_role('button', name='Spiel erfassen', exact=True)).to_be_visible()
        expect_pops(group_index)
        assert page.evaluate('history.state.idx') == group_index
        expect(page.get_by_role('form', name='Spiel erfassen', exact=True)).to_have_count(0)
        assert calls[f'groups/{uid(10)}'] == initial_reads + 2, dict(calls)
        # Tabs added two entries; native navigation must not add any more.
        assert page.evaluate('history.length') == length + 2
        if iteration == 29:
            page.screenshot(path=str(OUT / 'fresh-group.png'), full_page=True)
        page.evaluate('history.back()')
        expect(page.get_by_role('button', name='Gruppe erstellen', exact=True)).to_be_visible()
        expect_pops(list_index)
    assert not errors, errors
    browser.close()
print('PASS: 30 Chromium cycles, observed POP/restoration sequences, cancel/discard/Forward, same-group tabs, fresh authorization, no writes or page errors')
