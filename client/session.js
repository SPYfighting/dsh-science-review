import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { request } from './api.js'

const stores = new Map()
export function refreshSessions() { for (const store of stores.values()) store.refresh() }

// A conversation can mount many turn tails at once. All of them share one
// request and one poll timer; an idle conversation does not poll.
function sessionStore(sessionId) {
  const listeners = new Set()
  let state = { data: null, byTurn: new Map(), error: '', busy: false }
  let timer, activeRead, readAgain = false
  let waitForTurn, retries = 0
  function publish(patch) {
    if (patch.data) patch.byTurn = new Map(patch.data.turns.map(turn => [turn.id, turn]))
    state = { ...state, ...patch }
    for (const notify of listeners) notify()
  }
  function later(delay) {
    clearTimeout(timer)
    if (listeners.size) timer = setTimeout(() => { void refresh() }, delay)
  }
  async function refresh() {
    if (activeRead) { readAgain = true; return }
    if (!listeners.size) return
    clearTimeout(timer)
    const read = new AbortController()
    activeRead = read
    try {
      const data = await request('session', { query: { sessionId }, signal: read.signal })
      if (!read.signal.aborted) {
        publish({ data, error: '' })
        if (data.turns.some(turn => turn.review?.status === 'running')) later(1400)
        else if (waitForTurn && retries > 0 && (!state.byTurn.has(waitForTurn) ||
          (data.effectiveMode !== 'manual' && !state.byTurn.get(waitForTurn).review))) {
          retries--
          later(1200)
        }
      }
    } catch (error) {
      if (!read.signal.aborted) publish({ error: error.message })
    } finally {
      if (activeRead === read) {
        activeRead = null
        if (readAgain) { readAgain = false; later(0) }
      }
    }
  }
  async function mutate(route, body) {
    if (state.busy) return
    activeRead?.abort()
    activeRead = null
    readAgain = false
    clearTimeout(timer)
    publish({ busy: true, error: '' })
    try {
      const res = await request(route, { body: { sessionId, ...body } })
      if (route === 'session') publish({ data: res })
      await refresh()
    } catch (error) {
      publish({ error: error.message })
    } finally { publish({ busy: false }) }
  }
  return {
    snapshot: () => state, refresh,
    subscribe(notify) {
      listeners.add(notify)
      if (listeners.size === 1) later(0)
      return () => {
        listeners.delete(notify)
        if (listeners.size === 0) {
          clearTimeout(timer)
          activeRead?.abort()
          activeRead = null
          queueMicrotask(() => {
            if (!listeners.size && stores.get(sessionId) === this) stores.delete(sessionId)
          })
        }
      }
    },
    onTurn(id) {
      // The initial read already covers all historical tails. A new native
      // turn can appear a little before the host has persisted its review.
      if (!state.data || !state.byTurn.has(id)) {
        waitForTurn = id
        retries = 2
        later(250)
      }
    },
    setMode: mode => mutate('session', { mode }),
    run: turnId => mutate('run', { turnId }),
  }
}
export function useReviewSession(sessionId) {
  const store = useMemo(() => {
    if (!stores.has(sessionId)) stores.set(sessionId, sessionStore(sessionId))
    return stores.get(sessionId)
  }, [sessionId])
  const subscribe = useMemo(() => listener => store.subscribe(listener), [store])
  const state = useSyncExternalStore(subscribe, store.snapshot)
  return [state, store]
}

export function useTurnArrival(store, turnId) {
  useEffect(() => { store.onTurn(turnId) }, [store, turnId])
}
