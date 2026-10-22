import { savedCommander } from './commanderFixtures'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { AppRouter as BrowserRouter } from '../AppRouter'
import { vi } from 'vitest'
import App from '../App'
import { AppThemeProvider } from '../theme/AppThemeProvider'
import type { CurrentUser, Deck } from '../api'
import { group, response, uid } from './gameFixtures'

export const deck: Deck = { id: uid(101), name: 'Alpha', commanders: [savedCommander('Karn')], colorIdentity: [], everUsed: false, archived: false }
export const owner = { id: uid(1), username: 'Owner' }
export function deckApi(initial = [deck]) {
  const state = { user: owner as CurrentUser | null, loginUser: owner, decks: initial }
  const replies = new Map<string, Array<() => Response | Promise<Response>>>()
  function next(path: string, reply: () => Response | Promise<Response>, method = 'GET') {
    const key = `${method} ${path}`
    replies.set(key, [...replies.get(key) ?? [], reply])
  }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const reply = replies.get(`${method} ${path}`)?.shift()
    if (reply) return reply()
    if (path.startsWith('/api/scryfall/commanders?')) return response([{ ...savedCommander(decodeURIComponent(path.split('=')[1])), thumbnailUrl: null }])
    if (path === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'deck-token' })
    if (path === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (path === '/api/groups') return response([group])
    if (path === `/api/groups/${group.id}`) return response(group)
    if (path.endsWith('/games')) return response([])
    if (path.endsWith('/statistics')) return response({ players: [], decks: [] })
    if (path === '/api/decks' && method === 'GET') return response(state.decks)
    if (path === '/api/decks' && method === 'POST') {
      const saved = { ...deck, name: JSON.parse(init!.body as string).name, id: uid(102) }
      state.decks = [...state.decks, saved]
      return response(saved, 201)
    }
    const target = state.decks.find(candidate => path === `/api/decks/${candidate.id}` || path === `/api/decks/${candidate.id}/archive`)
    if (target && method === 'PUT') {
      const saved = { ...target, name: JSON.parse(init!.body as string).name }
      state.decks = state.decks.map(candidate => candidate.id === target.id ? saved : candidate)
      return response(saved)
    }
    if (target && method === 'DELETE') {
      state.decks = state.decks.filter(candidate => candidate.id !== target.id)
      return new Response(null, { status: 204 })
    }
    if (target && method === 'POST') {
      state.decks = state.decks.map(candidate => candidate.id === target.id ? { ...candidate, archived: true } : candidate)
      return response({ ...target, archived: true })
    }
    throw new Error(`Unexpected ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { state, next, fetchMock, writes: () => fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET') }
}
export function showDeckApp(path = '/decks', state: unknown = null) {
  window.history.replaceState(state ? { usr: state } : null, '', path)
  return render(<AppThemeProvider><BrowserRouter><App /></BrowserRouter></AppThemeProvider>)
}
export async function newDeck() {
  fireEvent.click(await screen.findByRole('button', { name: 'Deck erstellen' }))
  return screen.findByRole('textbox', { name: /Deckname/ })
}
export async function editDeck(name = deck.name) {
  fireEvent.click(await screen.findByRole('button', { name: `${name} bearbeiten` }))
  return screen.findByRole('textbox', { name: /Deckname/ })
}
export async function changeDeck(name = 'Changed', commander?: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: name } })
  if (commander) {
    const field = screen.getByRole('combobox', { name: /Commander/ })
    fireEvent.change(field, { target: { value: commander } })
    if (commander.trim().length >= 2 && ![...commander].every(char => /\p{White_Space}/u.test(char) || (char.codePointAt(0)! >= 28 && char.codePointAt(0)! <= 31))) { fireEvent.focus(field); fireEvent.click(await screen.findByRole('option', { name: commander })) }
  }
}
export async function menuAction(name: 'Löschen' | 'Archivieren') {
  fireEvent.click(await screen.findByRole('button', { name: 'Deckaktionen' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
  return screen.findByRole('dialog')
}
export async function signInDeck() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
}
