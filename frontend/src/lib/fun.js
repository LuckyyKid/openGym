// Surprises: seasonal days, personal dates, logging-streak milestones and the odd random one.
//
// pickSurprise is pure — it gets the state, the current time and a random number, and says
// which one (if any) to show. The caller shows it and then records it with markSeen, so
// nothing is marked as seen unless it actually appeared.
//
// Cooldowns:
//   · 24 h between any two surprises
//   · a dated one (season or personal) once per year — it can only match on its own day anyway
//   · a random one at most every 7 days, and the dice are rolled once per day, not per visit
//   · a streak milestone once per streak — it comes back only after the streak breaks and is
//     built up again. It fires on "at least N days", so a missed visit on day N does not lose it.
import { isoOf } from './format.js'
import { dayStreak } from './nutrition.js'

const DAY = 86400000
export const GLOBAL_COOLDOWN = DAY
export const RANDOM_COOLDOWN = 7 * DAY
export const RANDOM_CHANCE = 0.04
export const MILESTONES = [100, 30, 14, 7]   // highest first: only the biggest unseen one shows

// Easter Sunday (Gregorian), anonymous algorithm.
export function easterOf(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const md = d => String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

// fx: which particle animation plays (components/Celebrate.jsx)
export const SEASONAL = [
  { id: 'newyear', icon: 'sparkles', fx: 'confetti', title: 'Happy New Year!', text: 'New year, same you — just a few more reps ahead.', on: d => md(d) === '01-01' },
  { id: 'valentine', icon: 'heart', fx: 'hearts', title: "Happy Valentine's Day", text: 'Showing up for yourself counts as self-love too.', on: d => md(d) === '02-14' },
  { id: 'easter', icon: 'star', fx: 'eggs', title: 'Happy Easter!', text: 'Found an egg — the chocolate ones still count towards your calories.', on: d => { const e = easterOf(d.getFullYear()); const m = new Date(e); m.setDate(e.getDate() + 1); return sameDay(d, e) || sameDay(d, m) } },
  { id: 'summer', icon: 'sun', fx: 'stars', title: 'First day of summer', text: 'Longest day of the year — plenty of daylight for a run.', on: d => md(d) === '06-21' },
  { id: 'halloween', icon: 'moon', fx: 'pumpkins', title: 'Happy Halloween', text: 'The only scary thing here is leg day.', on: d => md(d) === '10-31' },
  { id: 'christmas', icon: 'star', fx: 'snow', title: 'Merry Christmas', text: 'Enjoy the feast — the plan will still be here tomorrow.', on: d => md(d) === '12-24' || md(d) === '12-25' }
]
export const RANDOM = [
  { id: 'lucky', icon: 'starFill', fx: 'stars', title: 'Lucky day', text: 'This one shows up only once in a while. Go set a PR.' },
  { id: 'duck', icon: 'sparkles', fx: 'confetti', title: 'A wild gym duck appeared', text: 'Quack. It says your form looks great today.' },
  { id: 'hydrate', icon: 'bolt', fx: 'stars', title: 'Hydration check', text: 'Have a glass of water and log it — future you says thanks.' }
]
export const milestoneOf = n => ({
  id: 'streak' + n, icon: n >= 30 ? 'crown' : n >= 14 ? 'trophy' : 'medal', fx: 'confetti', n,
  title: '{0} days in a row!', text: n >= 30 ? 'That is a habit now. Seriously impressive.' : 'Every day logged. Keep the chain going.'
})

export function pickSurprise(S, now = Date.now(), rand = Math.random()) {
  const fun = S.fun || {}
  if (fun.off) return null
  if (fun.last && now - fun.last < GLOBAL_COOLDOWN) return null
  const seen = fun.seen || {}
  const d = new Date(now)
  const today = isoOf(d)
  const year = d.getFullYear()

  // personal dates first — they are the rarest and the most personal
  if (fun.birthday && fun.birthday === md(d) && !seen['birthday:' + year])
    return { egg: { id: 'birthday', icon: 'sparkles', fx: 'confetti', title: 'Happy birthday!', text: 'Another year stronger. Take the day off if you want — you earned it.' }, key: 'birthday:' + year }
  if (fun.special && fun.special === md(d) && !seen['special:' + year])
    return { egg: { id: 'special', icon: 'heart', fx: 'hearts', title: 'A special day', label: fun.specialLabel || null, text: 'Today: {0}. Enjoy it!', personal: true }, key: 'special:' + year }

  for (const e of SEASONAL) if (e.on(d) && !seen[e.id + ':' + year]) return { egg: e, key: e.id + ':' + year }

  const st = dayStreak(S, today)
  for (const n of MILESTONES) {
    if (st.n >= n) {
      const key = 'streak' + n + ':' + st.start
      if (!seen[key]) return { egg: milestoneOf(n), key, streak: st.n }
      break   // the biggest reached milestone was seen — smaller ones of the same streak were too, or don't matter now
    }
  }

  // one roll per day, however many times the app is opened
  if (fun.rolled === today) return null
  const roll = { rolled: today }
  if (rand >= RANDOM_CHANCE) return { egg: null, patch: roll }
  const pool = RANDOM.filter(e => !fun.lastRandom || !fun.lastRandom[e.id] || now - fun.lastRandom[e.id] >= RANDOM_COOLDOWN)
  if (!pool.length) return { egg: null, patch: roll }
  const egg = pool[Math.floor((rand / RANDOM_CHANCE) * pool.length) % pool.length]
  return { egg, key: 'random:' + egg.id + ':' + today, random: true, patch: roll }
}

// Records a shown surprise on the draft state (call inside update()).
export function markSeen(s, pick, now = Date.now()) {
  s.fun = s.fun || {}
  if (pick.patch) Object.assign(s.fun, pick.patch)
  if (!pick.egg) return
  s.fun.seen = { ...(s.fun.seen || {}), [pick.key]: isoOf(new Date(now)) }
  s.fun.last = now
  if (pick.random) s.fun.lastRandom = { ...(s.fun.lastRandom || {}), [pick.egg.id]: now }
}
