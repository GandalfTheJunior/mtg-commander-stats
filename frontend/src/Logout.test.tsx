import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { CurrentUser } from './api'

const user = { id: 'f058bf9c-c4ce-4b88-a252-aa176a5ef539', username: 'Gandalf' }
const deck = { everUsed: false, archived: false, id: 'deck-id', name: 'Private deck', commander: 'Atraxa', colorIdentity: [] }
const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Private group', role: 'OWNER' }
const code = 'abcdefghijklmnopqrstuv'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deferred() {
  let resolve!: (response: Response) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup() {
  const server = {
    identity: user as CurrentUser | null,
    async me(): Promise<Response> { return json(server.identity ?? {}, server.identity ? 200 : 401) },
    async logout(): Promise<Response> { server.identity = null; return new Response(null, { status: 204 }) },
    async csrf(): Promise<Response> { return json({ headerName: 'X-CSRF-TOKEN', token: 'logout-token' }) },
    async decks(): Promise<Response> { return json([deck]) },
    async createDeck(): Promise<Response> { return json(deck, 201) },
    async groups(): Promise<Response> { return json([group]) },
    async createGroup(): Promise<Response> { return json(group, 201) },
    async code(): Promise<Response> { return json({ code }) },
  }
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/me') return server.me()
    if (path === '/api/csrf') return server.csrf()
    if (path === '/api/session' && init?.method === 'DELETE') return server.logout()
    if (path === '/api/session') { server.identity = user; return Promise.resolve(json(user)) }
    if (path === '/api/decks') return init?.method ? server.createDeck() : server.decks()
    if (path === '/api/groups') return init?.method ? server.createGroup() : server.groups()
    if (path === `/api/groups/${group.id}`) return Promise.resolve(json({ ...group, members: [] }))
    if (path.endsWith('/games')) return Promise.resolve(json([]))
    if (path.endsWith('/join-code')) return server.code()
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { server, fetchMock }
}

async function openCode() {
  fireEvent.click(await screen.findByRole('button', { name: 'Private group (OWNER)' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Show invitation code' }))
  await screen.findByDisplayValue(code)
}

async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'gandalf@example.com' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
}

function expectProtectedDataHidden() {
  expect(screen.queryByRole('heading', { name: 'My decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'My groups' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
}

afterEach(() => { vi.unstubAllGlobals() })

test('logout uses CSRF and waits for 204, clears protected data and restores signed-out UI on reload', async () => {
  const { server, fetchMock } = setup()
  const pending = deferred()
  server.logout = () => pending.promise
  const view = render(<App />)
  await screen.findByText(deck.name)
  await openCode()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Create an account' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/session', {
    credentials: 'same-origin', method: 'DELETE', headers: { 'X-CSRF-TOKEN': 'logout-token' },
  }))
  expectProtectedDataHidden()
  expect(screen.getByText('Logging out…')).toBeInTheDocument()
  expect(screen.queryByText('Logged out.')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  server.identity = null
  await act(async () => { pending.resolve(new Response(null, { status: 204 })) })
  await screen.findByText('Logged out.')
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  view.unmount()
  render(<App />)
  await screen.findByText('Not signed in.')
  expectProtectedDataHidden()
})

test.each(['403', '500', '200', 'network', 'csrf'])('failed or ambiguous logout (%s) rechecks a valid session and permits retry', async (failure) => {
  const { server, fetchMock } = setup()
  const view = render(<App />)
  await openCode()
  server.logout = async () => {
    if (failure === 'network') throw new Error('Network disconnected')
    return json({}, failure === 'csrf' ? 403 : Number(failure))
  }
  if (failure === 'csrf') server.csrf = async () => json({}, 403)
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logout could not be confirmed. You are still signed in. Try again.')
  expect(screen.getByText(user.username)).toBeInTheDocument()
  expect(await screen.findByText(deck.name)).toBeInTheDocument()
  expect(screen.queryByText('Logged out.')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  if (failure === 'csrf') expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/session' && init?.method === 'DELETE')).toBe(false)
  view.unmount()
  render(<App />)
  await screen.findByRole('button', { name: 'Log out' })
  server.csrf = async () => json({ headerName: 'X-CSRF-TOKEN', token: 'retry-token' })
  server.logout = async () => { server.identity = null; return new Response(null, { status: 204 }) }
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  expectProtectedDataHidden()
})

test.each(['401', 'network'])('ambiguous logout (%s) with a lost server session clears data without claiming success', async (failure) => {
  const { server } = setup()
  const view = render(<App />)
  await openCode()
  server.logout = async () => {
    server.identity = null
    if (failure === 'network') throw new Error('Response lost after server logout')
    return json({}, 401)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logout could not be confirmed. Your session is no longer active.')
  expect(screen.queryByText('Logged out.')).not.toBeInTheDocument()
  expectProtectedDataHidden()
  view.unmount()
  render(<App />)
  await screen.findByText('Not signed in.')
  expectProtectedDataHidden()
})

test('failed session recheck hides protected data and can recover through an explicit check', async () => {
  const { server } = setup()
  render(<App />)
  await openCode()
  server.logout = async () => { throw new Error('Network unavailable') }
  server.me = async () => { throw new Error('Still unavailable') }
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logout could not be confirmed. Check your session before continuing.')
  expect(screen.getByText('Your session identity could not be confirmed.')).toBeInTheDocument()
  expectProtectedDataHidden()
  server.me = async () => json(user)
  fireEvent.click(screen.getByRole('button', { name: 'Check session' }))
  await screen.findByRole('button', { name: 'Log out' })
  expect(await screen.findByText(deck.name)).toBeInTheDocument()
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
})

for (const logoutFails of [false, true]) {
  for (const resource of ['deck list', 'deck mutation', 'group list', 'group mutation', 'invitation code']) {
    test.each(['success', '401', '500', 'network'])(`late ${resource} %s cannot affect the session after ${logoutFails ? "failed" : "successful"} logout`, async (outcome) => {
      const { server } = setup()
      const pending = deferred()
      const oldRequest = vi.fn(() => pending.promise)
      if (resource === 'deck list') server.decks = oldRequest
      if (resource === 'group list') server.groups = oldRequest
      if (resource === 'deck mutation') server.createDeck = oldRequest
      if (resource === 'group mutation') server.createGroup = oldRequest
      if (resource === 'invitation code') server.code = oldRequest
      render(<App />)
      await screen.findByRole('button', { name: 'Log out' })
      if (resource === 'deck mutation') {
        await screen.findByText(deck.name)
        fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: deck.name } })
        fireEvent.change(screen.getByLabelText('Commander'), { target: { value: deck.commander } })
        fireEvent.click(screen.getByRole('button', { name: 'Create deck' }))
      }
      if (resource === 'group mutation') {
        await screen.findByRole('button', { name: 'Create group' })
        fireEvent.change(screen.getByLabelText('Group name'), { target: { value: group.name } })
        fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
      }
      if (resource === 'invitation code') {
        fireEvent.click(await screen.findByRole('button', { name: 'Private group (OWNER)' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Show invitation code' }))
      }
      await waitFor(() => expect(oldRequest).toHaveBeenCalledTimes(1))
      server.decks = async () => json([])
      server.groups = async () => json([])
      if (logoutFails) server.logout = async () => json({}, 403)
      fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
      if (logoutFails) {
        await screen.findByText('Logout could not be confirmed. You are still signed in. Try again.')
      } else {
        await screen.findByText('Logged out.')
        expectProtectedDataHidden()
        await signIn()
      }
      await screen.findByText('You have no decks yet.')
      await screen.findByText('You have no groups yet.')
      await act(async () => {
        if (outcome === 'network') pending.reject(new Error('Stale network failure'))
        else if (outcome !== 'success') pending.resolve(json({ detail: 'Stale failure' }, Number(outcome)))
        else if (resource === 'invitation code') pending.resolve(json({ code }))
        else if (resource.startsWith('deck')) pending.resolve(json(resource.endsWith('list') ? [deck] : deck, 200))
        else pending.resolve(json(resource.endsWith('list') ? [group] : group, resource.endsWith('mutation') ? 201 : 200))
      })
      expect(screen.getByText(user.username)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create deck' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Create group' })).toBeEnabled()
      expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
      expect(screen.queryByText(/Private group/)).not.toBeInTheDocument()
      expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
      expect(screen.queryByText(/Stale failure|Stale network failure|session expired/)).not.toBeInTheDocument()
    })
  }
}
