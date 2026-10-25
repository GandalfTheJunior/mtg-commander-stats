"""Browser verification for #117. Run against Vite on localhost:5173.
Requires Python Playwright and Chromium; uses only fictional API fixtures.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
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


group=dict(id=uid(10),name='Friday games',role='OWNER',members=[dict(userId=uid(n),username=f'Player {n}',role='OWNER' if n==1 else 'MEMBER') for n in range(1,5)])
decks=[dict(id=uid(100+n),name=f'Deck {n}',commanders=[commander(f'Commander {n}')],colorIdentity=['G'],archived=False,everUsed=True) for n in range(1,5)]
saved=dict(id=uid(20),groupId=uid(10),creatorId=uid(1),recordedAt='2026-10-25T08:00:00Z',result='WIN',alternateWinCon=False,winnerUserId=uid(1),participants=[dict(userId=uid(n),username=f'Player {n}',deckId=uid(100+n),deck=decks[n-1],startPosition=n,placement=[1,2,2,4][n-1],stillInGame=n==1) for n in range(1,5)])
def api(route):
 p=route.request.url.split('/api/',1)[1]
 replies={'me':dict(id=uid(1),username='UI test'),'groups':[group],f'groups/{uid(10)}':group,f'groups/{uid(10)}/games':[saved], f'groups/{uid(10)}/games/{uid(20)}':saved,f'groups/{uid(10)}/statistics':dict(players=[],decks=[]),'decks':decks}
 for n in range(1,5): replies[f'groups/{uid(10)}/members/{uid(n)}/decks']=[decks[n-1]]
 if p not in replies: raise Exception(p)
 route.fulfill(json=replies[p])
Path('/tmp/mtg-editor-screenshots').mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [1280,375]:
  page=browser.new_page(viewport=dict(width=width,height=1000))
  page.route('**/api/**',api)
  page.goto(f'http://127.0.0.1:5173/playgroups/{uid(10)}?game={uid(20)}')
  # Navigate through existing details action.
  if not page.get_by_role('heading',name='Spieldetails',exact=True).count():
   page.get_by_role('link',name='Spieldetails:',exact=False).first.click()
  page.get_by_role('button',name='Spielaktionen').click()
  page.get_by_role('menuitem',name='Bearbeiten',exact=True).click()
  expect(page.get_by_role('heading',name='Spiel bearbeiten',exact=True)).to_be_visible()
  first = page.get_by_role('region', name='Spieler 1', exact=True)
  first.scroll_into_view_if_needed()
  first.get_by_role('button', name='Spieler 1 verschieben', exact=True).press('ArrowDown')
  expect(page.get_by_role('region', name='Spieler 2', exact=True).get_by_text('Deck 1',exact=True)).to_be_visible()
  page.get_by_role('region', name='Spieler 2', exact=True).get_by_role('button',name='Spieler 2 nach oben',exact=True).click()
  first.scroll_into_view_if_needed()
  grip = first.get_by_role('button', name='Spieler 1 verschieben', exact=True)
  grip.scroll_into_view_if_needed()
  page.evaluate('window.scrollBy(0, 200)')
  start=grip.bounding_box()
  target=page.get_by_role('region', name='Spieler 2', exact=True).bounding_box()
  page.mouse.move(start['x']+20,start['y']+20)
  page.mouse.down()
  page.mouse.move(target['x']+100,target['y']+20,steps=10)
  page.mouse.up()
  expect(page.get_by_role('region', name='Spieler 2',exact=True).get_by_text('Deck 1',exact=True)).to_be_visible()
  page.get_by_role('region',name='Spieler 2',exact=True).get_by_role('button',name='Spieler 2 nach oben',exact=True).click()
  if width == 375:
   grip=page.get_by_role('region',name='Spieler 1',exact=True).get_by_role('button',name='Spieler 1 verschieben',exact=True)
   grip.scroll_into_view_if_needed()
   page.evaluate('window.scrollBy(0,200)')
   start=grip.bounding_box()
   target=page.get_by_role('region',name='Spieler 2',exact=True).bounding_box()
   cdp=page.context.new_cdp_session(page)
   cdp.send('Emulation.setTouchEmulationEnabled',dict(enabled=True))
   cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=start['x']+20,y=start['y']+20)]))
   cdp.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[dict(x=target['x']+100,y=target['y']+20)]))
   cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
   expect(page.get_by_role('region',name='Spieler 2',exact=True).get_by_text('Deck 1',exact=True)).to_be_visible()
   page.get_by_role('region',name='Spieler 2',exact=True).get_by_role('button',name='Spieler 2 nach oben',exact=True).click()
  page.evaluate('window.scrollTo(0,0)')
  for mode in ['win','alternate','draw']:
   if mode=='alternate': page.get_by_role('checkbox',name='Alternate WinCon').check()
   if mode=='draw': page.get_by_role('combobox',name='Spielergebnis',exact=True).select_option('DRAW')
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
   page.screenshot(path=f'/tmp/mtg-editor-screenshots/{mode}-{width}.png',full_page=True)
  print(f'PASS {width}')
  page.close()
 browser.close()
