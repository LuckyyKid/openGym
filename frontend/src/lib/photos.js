// Photos (cardio proof, motivation) — kept out of the synced state on purpose: the state is
// re-sent whole on every change, and a few photos inside it would make every tap upload
// megabytes. The state only holds photo ids.
//
// Each photo is shrunk to a JPEG on the device, stored in IndexedDB (works for guests, the
// demo and the standalone mobile app), and — when signed in to a server — uploaded so the
// profile's other devices can fetch it. An upload that fails offline is queued and retried.
import { useEffect, useState } from 'react'
import { api } from './api.js'
import { uid } from './format.js'
import { MOBILE } from './mobile.js'
import { DEMO } from './demo.js'
import { useStore } from '../store/useStore.js'

const DB = 'opengym-photos', STORE = 'p', QUEUE = 'gym_photo_queue'
const MAX_SIDE = 1280, QUALITY = 0.8

let dbp = null
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}
const tx = async (mode, fn) => {
  const d = await db()
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => res(req && req.result)
    t.onerror = () => rej(t.error)
  })
}
const idbGet = id => tx('readonly', s => s.get(id)).catch(() => null)
const idbPut = (id, data) => tx('readwrite', s => s.put(data, id)).catch(() => {})
const idbDel = id => tx('readwrite', s => s.delete(id)).catch(() => {})

const synced = () => !MOBILE && !DEMO && !!useStore.getState().user
const queue = () => { try { return JSON.parse(localStorage.getItem(QUEUE)) || [] } catch { return [] } }
const setQueue = q => { try { localStorage.setItem(QUEUE, JSON.stringify(q)) } catch { /* */ } }

// Shrink to a JPEG data URL — a phone photo is 3–8 MB, this lands around 150–300 KB.
export async function compress(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', QUALITY)
  } finally { URL.revokeObjectURL(url) }
}

async function upload(id, data) {
  try { await api('/api/photos', { method: 'PUT', body: JSON.stringify({ id, data }) }); return true }
  catch { return false }
}

export async function savePhoto(file) {
  const data = await compress(file)
  const id = uid()
  await idbPut(id, data)
  if (synced() && !(await upload(id, data))) setQueue([...queue(), id])
  return id
}

export async function photoData(id) {
  if (!id) return null
  let d = await idbGet(id)
  if (!d && synced()) {
    try { d = (await api('/api/photos?id=' + encodeURIComponent(id))).data || null } catch { d = null }
    if (d) await idbPut(id, d)
  }
  return d
}

export async function deletePhoto(id) {
  if (!id) return
  await idbDel(id)
  setQueue(queue().filter(x => x !== id))
  if (synced()) api('/api/photos/delete', { method: 'POST', body: JSON.stringify({ id }) }).catch(() => {})
}

// Retry uploads that failed while offline.
export async function flushPhotos() {
  if (!synced()) return
  const left = []
  for (const id of queue()) {
    const d = await idbGet(id)
    if (d && !(await upload(id, d))) left.push(id)
  }
  setQueue(left)
}

export function usePhoto(id) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let on = true
    setSrc(null)
    photoData(id).then(d => { if (on) setSrc(d) })
    return () => { on = false }
  }, [id])
  return src
}
