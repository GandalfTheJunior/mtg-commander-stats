import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ProfileClaimDialog from './ProfileClaimDialog'
import { AppThemeProvider } from '../../theme/AppThemeProvider'
import { deferred, response, uid } from '../../test/gameFixtures'

const profile = { userId: uid(5), username: 'Quick profile', role: 'MEMBER' as const, quickProfile: true }
const code = 'Qr5tUvWxYz0123456789_-'
const main = () => screen.getByRole('dialog', { name: 'Profilübernahme einladen' })
const confirmation = (kind: 'replace' | 'revoke') => screen.getByRole('dialog', { name: kind === 'replace' ? 'Einladung ersetzen?' : 'Einladung widerrufen?' })
const entry = (kind: 'replace' | 'revoke') => within(main()).getByRole('button', { name: kind === 'replace' ? 'Neue Einladung erstellen' : 'Einladung widerrufen' })
const commit = (kind: 'replace' | 'revoke') => within(confirmation(kind)).getByRole('button', { name: kind === 'replace' ? 'Neuen Link erstellen' : 'Einladung widerrufen' })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T12:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

async function setup(active = true) {
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  const status = { active, expiresAt: active ? expiresAt : null }
  const read = vi.fn((): Response | Promise<Response> => response(status))
  const write = vi.fn((method: string): Response | Promise<Response> => method === 'POST'
    ? response({ code, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, 201) : new Response(null, { status: 204 }))
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'test' })
    if ((init?.method ?? 'GET') === 'GET') return read()
    return write(init!.method!)
  })
  vi.stubGlobal('fetch', fetchMock)
  const onClose = vi.fn(), onUnauthorized = vi.fn(), onTargetLost = vi.fn()
  function Host() {
    const [open, setOpen] = useState(true)
    return open && <ProfileClaimDialog groupId={uid(10)} profile={profile}
      onClose={() => { onClose(); setOpen(false) }} onUnauthorized={onUnauthorized} onTargetLost={onTargetLost} />
  }
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(<AppThemeProvider><Host /></AppThemeProvider>) })
  const hold = () => {
    const pending = deferred()
    read.mockImplementationOnce(() => pending.promise)
    return pending
  }
  const expire = () => act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  const resolve = (pending: ReturnType<typeof deferred>, body: unknown = status, httpStatus = 200) => act(async () => { pending.resolve(response(body, httpStatus)) })
  const signal = () => fetchMock.mock.calls.filter(([path]) => path !== '/api/csrf').at(-1)![1]!.signal!
  return { status, read, write, hold, expire, resolve, signal, onClose, onUnauthorized, onTargetLost, view }
}

test('an expiry read preserves the focused action and every issuer control', async () => {
  const api = await setup()
  const button = entry('replace')
  act(() => button.focus())
  const pending = api.hold()
  await api.expire()
  expect(button).toHaveFocus()
  for (const control of within(main()).getAllByRole('button')) expect(control).toBeEnabled()
  expect(within(main()).getByRole('status')).toHaveTextContent('Einladungsstatus wird geprüft…')
  await api.resolve(pending)
  expect(button).toHaveFocus()
  expect(api.write).not.toHaveBeenCalled()
})

test.each(['Escape', 'button', 'icon'] as const)('issuer dismissal via %s aborts an expiry read and ignores its late access error', async dismiss => {
  const api = await setup()
  const pending = api.hold()
  await api.expire()
  const signal = api.signal()
  if (dismiss === 'Escape') fireEvent.keyDown(main(), { key: 'Escape' })
  else fireEvent.click(within(main()).getAllByRole('button', { name: 'Schließen' })[dismiss === 'icon' ? 0 : 1])
  expect(api.onClose).toHaveBeenCalledOnce()
  expect(signal.aborted).toBe(true)
  await api.resolve(pending, {}, 401)
  expect(api.onUnauthorized).not.toHaveBeenCalled()
  expect(api.write).not.toHaveBeenCalled()
})

for (const kind of ['replace', 'revoke'] as const) {
  test.each(['Escape', 'Abbrechen', 'Schließen'])(`${kind}: %s cancels a queued action during the expiry read`, async dismiss => {
    const api = await setup()
    fireEvent.click(entry(kind))
    const cancel = within(confirmation(kind)).getByRole('button', { name: 'Abbrechen' })
    act(() => cancel.focus())
    const pending = api.hold()
    await api.expire()
    expect(cancel).toHaveFocus()
    expect(commit(kind)).toBeEnabled()
    fireEvent.click(commit(kind))
    expect(cancel).toBeEnabled()
    const signal = api.signal()
    if (dismiss === 'Escape') fireEvent.keyDown(confirmation(kind), { key: 'Escape' })
    else fireEvent.click(within(confirmation(kind)).getByRole('button', { name: dismiss }))
    expect(signal.aborted).toBe(true)
    await api.resolve(pending)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.queryByRole('dialog', { name: kind === 'replace' ? 'Einladung ersetzen?' : 'Einladung widerrufen?' })).not.toBeInTheDocument()
    expect(api.write).not.toHaveBeenCalled()
  })

  test(`${kind}: an accepted action waits for the expiry read, submits once and locks only the mutation`, async () => {
    const api = await setup()
    const pending = api.hold()
    await api.expire()
    fireEvent.click(entry(kind))
    const button = commit(kind)
    act(() => button.focus())
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(api.write).not.toHaveBeenCalled()
    expect(within(confirmation(kind)).getByRole('button', { name: 'Abbrechen' })).toBeEnabled()
    const mutation = deferred()
    api.write.mockImplementationOnce(() => mutation.promise)
    await api.resolve(pending)
    expect(api.read).toHaveBeenCalledTimes(2)
    expect(api.write).toHaveBeenCalledExactlyOnceWith(kind === 'replace' ? 'POST' : 'DELETE')
    expect(within(confirmation(kind)).getByRole('button', { name: 'Abbrechen' })).toBeDisabled()
    fireEvent.keyDown(confirmation(kind), { key: 'Escape' })
    expect(confirmation(kind)).toBeInTheDocument()
    await act(async () => mutation.resolve(kind === 'replace'
      ? response({ code, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, 201) : new Response(null, { status: 204 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(within(main()).getByText(kind === 'replace' ? 'Neue Einladung erstellt' : 'Keine aktive Einladung')).toBeInTheDocument()
    expect(api.write).toHaveBeenCalledTimes(1)
  })

  test.each(['inactive', 'replacement'] as const)(`${kind}: changed %s state requires a new deliberate action`, async change => {
    const api = await setup()
    fireEvent.click(entry(kind))
    const pending = api.hold()
    await api.expire()
    fireEvent.click(commit(kind))
    Object.assign(api.status, change === 'inactive' ? { active: false, expiresAt: null }
      : { active: true, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
    await api.resolve(pending)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(api.write).not.toHaveBeenCalled()
    expect(within(main()).getByRole('status')).toHaveTextContent('Der Einladungsstatus hat sich geändert.')
    if (change === 'replacement') {
      fireEvent.click(entry(kind))
      await act(async () => fireEvent.click(commit(kind)))
    } else await act(async () => fireEvent.click(within(main()).getByRole('button', { name: 'Einladung erstellen' })))
    expect(api.write).toHaveBeenCalledOnce()
  })

  test.each([503, 'malformed'] as const)(`${kind}: failed verification (%s) needs an explicit retry and never writes automatically`, async failure => {
    const api = await setup()
    fireEvent.click(entry(kind))
    const pending = api.hold()
    await api.expire()
    fireEvent.click(commit(kind))
    await api.resolve(pending, {}, failure === 'malformed' ? 200 : failure)
    expect(within(confirmation(kind)).getByRole('alert')).toHaveTextContent('Es wurde nichts geändert. Bitte versuche die Aktion erneut.')
    expect(api.write).not.toHaveBeenCalled()
    expect(commit(kind)).toBeEnabled()
    await act(async () => fireEvent.click(commit(kind)))
    expect(api.write).toHaveBeenCalledOnce()
  })
}

test.each([401, 403, 404])('verification status %s retires access without submitting the queued action', async status => {
  const api = await setup()
  const pending = api.hold()
  await api.expire()
  fireEvent.click(entry('replace'))
  fireEvent.click(commit('replace'))
  await api.resolve(pending, {}, status)
  expect(status === 401 ? api.onUnauthorized : api.onTargetLost).toHaveBeenCalledOnce()
  expect(api.write).not.toHaveBeenCalled()
})

test.each(['close', 'unmount'] as const)('create verification canceled by %s cannot submit after a late successful GET', async dismiss => {
  const api = await setup(false)
  const pending = api.hold()
  fireEvent.click(within(main()).getByRole('button', { name: 'Einladung erstellen' }))
  const signal = api.signal()
  if (dismiss === 'close') fireEvent.click(within(main()).getAllByRole('button', { name: 'Schließen' })[0])
  else api.view.unmount()
  expect(signal.aborted).toBe(true)
  await api.resolve(pending)
  expect(api.write).not.toHaveBeenCalled()
})

test('create verifies inactive state and requires replacement confirmation when another invitation appeared', async () => {
  const api = await setup(false)
  Object.assign(api.status, { active: true, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  await act(async () => fireEvent.click(within(main()).getByRole('button', { name: 'Einladung erstellen' })))
  expect(api.write).not.toHaveBeenCalled()
  expect(within(main()).getByRole('status')).toHaveTextContent('Der Einladungsstatus hat sich geändert.')
  fireEvent.click(entry('replace'))
  await act(async () => fireEvent.click(commit('replace')))
  expect(api.write).toHaveBeenCalledExactlyOnceWith('POST')
})

test('a canceled read resolving after a later successful creation cannot overwrite its one-time code', async () => {
  const api = await setup()
  fireEvent.click(entry('replace'))
  const old = api.hold()
  await api.expire()
  fireEvent.click(commit('replace'))
  fireEvent.click(within(confirmation('replace')).getByRole('button', { name: 'Abbrechen' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  fireEvent.click(entry('replace'))
  await act(async () => fireEvent.click(commit('replace')))
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  const link = within(main()).getByLabelText('Einladungslink')
  expect(link).toHaveValue(`${window.location.origin}/claim/${code}`)
  await api.resolve(old, { active: false, expiresAt: null })
  expect(link).toBeInTheDocument()
  expect(api.write).toHaveBeenCalledOnce()
})

test('a background read of the newly created invitation preserves both its code and focused QR control', async () => {
  const api = await setup(false)
  await act(async () => fireEvent.click(within(main()).getByRole('button', { name: 'Einladung erstellen' })))
  Object.assign(api.status, { active: true, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  const button = within(main()).getByRole('button', { name: 'QR-Code anzeigen' })
  act(() => button.focus())
  const pending = api.hold()
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000) })
  expect(button).toHaveFocus()
  expect(button).toBeEnabled()
  await api.resolve(pending)
  expect(button).toHaveFocus()
  expect(within(main()).getByLabelText('Einladungslink')).toHaveValue(`${window.location.origin}/claim/${code}`)
})
