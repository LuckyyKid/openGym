// Nutrition + daily log — pure helpers over the state object S.
//
// Two stores, one job each, so they can never disagree:
//   S.meals  [{ id, d, time, name, kcal, prot }]  — the ONLY source of calories and protein.
//            A day's totals are always the sum of its meals; there is no hand-typed daily
//            total that could drift away from the list.
//   S.days   { iso: { water, gym, run, km, min, photo, notes } } — everything else about a day.
// Both are absent on states written before nutrition existed and read as empty.
import { isoOf, todayISO } from './format.js'
import { effectiveRoutineId, lastBW } from './history.js'

export const NUTRI_DEF = { kcal: 2000, prot: 150, meals: 3, water: 2.5 }
export const goalsOf = S => ({ ...NUTRI_DEF, ...(S.nutri || {}) })

export const mealsOn = (S, iso) =>
  (S.meals || []).filter(m => m.d === iso).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
export const dayLog = (S, iso) => (S.days && S.days[iso]) || {}

export function dayTotals(S, iso) {
  const ms = mealsOn(S, iso)
  return {
    kcal: ms.reduce((a, m) => a + (+m.kcal || 0), 0),
    prot: ms.reduce((a, m) => a + (+m.prot || 0), 0),
    meals: ms.length,
    water: +dayLog(S, iso).water || 0
  }
}

// A finished workout counts as a gym day on its own — ticking "gym" by hand is for sessions
// trained outside the app.
export const workoutsOn = (S, iso) => S.workouts.filter(w => w.d === iso)
export const gymOn = (S, iso) => !!dayLog(S, iso).gym || workoutsOn(S, iso).length > 0
export const runOn = (S, iso) => !!dayLog(S, iso).run

// Within this many kcal of the goal reads as "on target" — nobody eats to the exact calorie,
// and an exact-equality check would almost never fire.
export const ON_TARGET = 50
export function balanceOf(kcal, goal) {
  const diff = Math.round(kcal - goal)
  return { diff, status: Math.abs(diff) <= ON_TARGET ? 'hit' : diff > 0 ? 'over' : 'under' }
}

/* ---------------------------- surplus alert ---------------------------- */
// The alert comes from the day's total. Meals eaten close together are context for it
// ("these two were 1 h apart"), not the trigger.
export const SURPLUS_ALERT = 100
const CLOSE_MIN = 120
const minutesOf = hhmm => { const [h, m] = String(hhmm || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0) }

export function surplusAlert(S, iso) {
  const g = goalsOf(S).kcal
  const { kcal } = dayTotals(S, iso)
  const over = Math.round(kcal - g)
  if (over < SURPLUS_ALERT) return null
  // "Got it" stays dismissed until the surplus grows by another full step — dismissing must
  // not be undone by the very next render, and a dismissed 120 kcal must not hide a later 900.
  const ack = S.nutriAck && S.nutriAck[iso]
  if (ack != null && over < ack + SURPLUS_ALERT) return null
  const ms = mealsOn(S, iso)
  const close = []
  for (let i = 1; i < ms.length; i++) {
    const gap = minutesOf(ms[i].time) - minutesOf(ms[i - 1].time)
    if (gap >= 0 && gap <= CLOSE_MIN) close.push([ms[i - 1], ms[i], gap])
  }
  return { over, kcal, goal: g, close }
}

/* ---------------------------- suggestions ---------------------------- */
// Rule-based, not AI: rough burn rates for a 75 kg adult, scaled by the latest weigh-in.
// They are estimates and the UI says so.
export const ACTIVITIES = [
  { k: 'run', name: 'Running', icon: 'figureRun', kpm: 11 },
  { k: 'bike', name: 'Cycling', icon: 'bike', kpm: 8 },
  { k: 'walk', name: 'Brisk walk', icon: 'figureStrength', kpm: 5 },
  // the quiet one — no jumping, no equipment, fine for a flat at night
  { k: 'yoga', name: 'Dynamic yoga at home', icon: 'stretch', kpm: 4, quiet: true }
]

export function suggestionsFor(S, iso) {
  const g = goalsOf(S)
  const tot = dayTotals(S, iso)
  const { diff, status } = balanceOf(tot.kcal, g.kcal)
  const bw = lastBW(S)
  const scale = bw && S.unit !== 'lb' ? bw.w / 75 : bw ? (bw.w * 0.4536) / 75 : 1
  const left = Math.max(0, g.meals - tot.meals)
  if (status === 'over') {
    return {
      kind: 'over', over: diff,
      acts: ACTIVITIES.map(a => ({ ...a, min: Math.max(5, Math.ceil(diff / (a.kpm * scale) / 5) * 5) })),
      // Once the planned meals are all eaten there is nothing left to trim — only moving helps.
      trim: left > 0 ? { meals: left, kcal: Math.ceil(diff / left / 10) * 10 } : null
    }
  }
  if (status === 'under') {
    const kcalLeft = -diff
    const protLeft = Math.max(0, Math.round(g.prot - tot.prot))
    const n = Math.max(1, left)
    return { kind: 'under', kcal: kcalLeft, prot: protLeft, meals: n, perMeal: Math.round(kcalLeft / n / 10) * 10, protPerMeal: Math.round(protLeft / n) }
  }
  return { kind: 'hit' }
}

/* ---------------------------- streaks & days ---------------------------- */
// A day "counts" when anything was logged on it: a meal, a workout, or the day sheet.
function loggedSet(S) {
  const set = new Set()
  ;(S.meals || []).forEach(m => set.add(m.d))
  S.workouts.forEach(w => set.add(w.d))
  Object.entries(S.days || {}).forEach(([iso, d]) => {
    if (d && (d.gym || d.run || d.water > 0 || (d.notes && d.notes.trim()))) set.add(iso)
  })
  return set
}
export const loggedOn = (S, iso) => loggedSet(S).has(iso)

// Consecutive logged days ending today — or yesterday, so the streak is not shown as broken
// in the morning before anything was logged. `start` identifies this run of days, so a
// milestone celebrated once is not celebrated again until the streak breaks and is rebuilt.
export function dayStreak(S, today = todayISO()) {
  const set = loggedSet(S)
  const d = new Date(today + 'T12:00:00')
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  let n = 0, start = null
  while (set.has(isoOf(d))) { n++; start = isoOf(d); d.setDate(d.getDate() - 1) }
  return { n, start }
}

// Yesterday had a session on the plan and nothing was trained — the "missed day" nudge.
export function missedYesterday(S, today = todayISO()) {
  const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 1)
  const iso = isoOf(d)
  const rid = effectiveRoutineId(S, iso)
  if (!rid) return null
  if (gymOn(S, iso) || runOn(S, iso)) return null
  const r = S.routines.find(x => x.id === rid)
  return r ? { iso, routine: r } : null
}

// Last `n` calendar days (oldest first) — real days, not "the last n days that have entries",
// so a gap shows as a gap.
export function lastDays(S, n, today = todayISO()) {
  const out = []
  const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    const iso = isoOf(d)
    out.push({ iso, ...dayTotals(S, iso), gym: gymOn(S, iso), run: runOn(S, iso), km: runOn(S, iso) ? +dayLog(S, iso).km || 0 : 0 })
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function periodSummary(S, n, today = todayISO()) {
  const g = goalsOf(S)
  const days = lastDays(S, n, today)
  const withMeals = days.filter(d => d.meals > 0)
  const avg = k => (withMeals.length ? Math.round(withMeals.reduce((a, d) => a + d[k], 0) / withMeals.length) : null)
  return {
    days,
    logged: withMeals.length,
    avgKcal: avg('kcal'),
    avgProt: avg('prot'),
    onTarget: withMeals.filter(d => balanceOf(d.kcal, g.kcal).status === 'hit').length,
    protHit: withMeals.filter(d => d.prot >= g.prot).length,
    gymDays: days.filter(d => d.gym).length,
    runDays: days.filter(d => d.run).length,
    km: Math.round(days.reduce((a, d) => a + d.km, 0) * 10) / 10
  }
}

export const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
