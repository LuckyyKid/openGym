import { describe, it, expect } from 'vitest'
import { dayTotals, balanceOf, surplusAlert, suggestionsFor, dayStreak, missedYesterday, lastDays, periodSummary, gymOn, ON_TARGET, mealTypeAt, mealIdeas } from './nutrition.js'
import { pickSurprise, markSeen, easterOf, GLOBAL_COOLDOWN, RANDOM_CHANCE } from './fun.js'

const base = over => ({ unit: 'kg', bodyweight: [], routines: [], week: {}, dayPlan: {}, workouts: [], meals: [], days: {}, ...over })
const meal = (d, time, kcal, prot = 0) => ({ id: d + time, d, time, name: 'x', kcal, prot })

describe('dayTotals', () => {
  it('sums only the meals of that day — the meals are the single source of totals', () => {
    const S = base({ meals: [meal('2026-05-01', '08:00', 500, 30), meal('2026-05-01', '13:00', 700, 40), meal('2026-05-02', '08:00', 999, 99)], days: { '2026-05-01': { water: 1.5 } } })
    expect(dayTotals(S, '2026-05-01')).toEqual({ kcal: 1200, prot: 70, carb: 0, fat: 0, meals: 2, water: 1.5 })
    expect(dayTotals(S, '2026-05-03')).toEqual({ kcal: 0, prot: 0, carb: 0, fat: 0, meals: 0, water: 0 })
  })
})

describe('balanceOf', () => {
  it('reads close-enough as on target instead of demanding the exact calorie', () => {
    expect(balanceOf(2000 + ON_TARGET, 2000).status).toBe('hit')
    expect(balanceOf(2000 - ON_TARGET, 2000).status).toBe('hit')
    expect(balanceOf(2200, 2000)).toEqual({ diff: 200, status: 'over' })
    expect(balanceOf(1500, 2000)).toEqual({ diff: -500, status: 'under' })
  })
})

describe('surplusAlert', () => {
  const day = '2026-05-01'
  const S = base({ nutri: { kcal: 2000 }, meals: [meal(day, '12:00', 1200), meal(day, '13:00', 950)] })

  it('fires from the day total and lists close meals as context', () => {
    const a = surplusAlert(S, day)
    expect(a.over).toBe(150)
    expect(a.close).toHaveLength(1)
    expect(a.close[0][2]).toBe(60)
  })

  it('stays dismissed until the surplus grows by another full step', () => {
    const acked = { ...S, nutriAck: { [day]: 150 } }
    expect(surplusAlert(acked, day)).toBeNull()
    const more = { ...acked, meals: [...S.meals, meal(day, '20:00', 120)] }   // +270, < 150 + 100...
    expect(surplusAlert(more, day)).not.toBeNull()
  })

  it('does not fire under the threshold', () => {
    expect(surplusAlert(base({ nutri: { kcal: 2000 }, meals: [meal(day, '12:00', 2050)] }), day)).toBeNull()
  })
})

describe('suggestionsFor', () => {
  const day = '2026-05-01'
  it('offers only activity once every planned meal is eaten', () => {
    const S = base({ nutri: { kcal: 2000, meals: 2 }, meals: [meal(day, '08:00', 1300), meal(day, '13:00', 1300)] })
    const s = suggestionsFor(S, day)
    expect(s.kind).toBe('over')
    expect(s.trim).toBeNull()
    expect(s.acts.find(a => a.quiet)).toBeTruthy()
  })
  it('spreads a deficit over the meals still to come', () => {
    const S = base({ nutri: { kcal: 2000, prot: 150, meals: 3 }, meals: [meal(day, '08:00', 500, 30)] })
    const s = suggestionsFor(S, day)
    expect(s).toMatchObject({ kind: 'under', kcal: 1500, prot: 120, meals: 2, perMeal: 750, protPerMeal: 60 })
  })
})

describe('dayStreak', () => {
  it('counts back from yesterday when today is still empty', () => {
    const S = base({ meals: [meal('2026-05-01', '08:00', 1), meal('2026-05-02', '08:00', 1)], days: { '2026-05-03': { gym: true } } })
    expect(dayStreak(S, '2026-05-04')).toEqual({ n: 3, start: '2026-05-01' })
    expect(dayStreak(S, '2026-05-03')).toEqual({ n: 3, start: '2026-05-01' })
    expect(dayStreak(S, '2026-05-06').n).toBe(0)
  })
  it('ignores an empty day sheet', () => {
    const S = base({ days: { '2026-05-03': { water: 0, notes: '  ' } } })
    expect(dayStreak(S, '2026-05-03').n).toBe(0)
  })
})

describe('missedYesterday', () => {
  const S = base({ routines: [{ id: 'r1', name: 'Push', ex: [] }], week: { 6: 'r1' } })   // 2026-05-02 is a Saturday
  it('flags a planned day with nothing trained', () => {
    expect(missedYesterday(S, '2026-05-03')).toMatchObject({ iso: '2026-05-02', routine: { id: 'r1' } })
  })
  it('accepts a run or a hand-ticked gym day as training', () => {
    expect(missedYesterday({ ...S, days: { '2026-05-02': { run: true } } }, '2026-05-03')).toBeNull()
    expect(gymOn({ ...S, workouts: [{ d: '2026-05-02', entries: [{ id: 'x', sets: [{ done: true, w: 50, r: 5 }] }] }] }, '2026-05-02')).toBe(true)
  })
  it('stays quiet after a rest day', () => {
    expect(missedYesterday(S, '2026-05-04')).toBeNull()
  })
})

describe('lastDays / periodSummary', () => {
  it('uses calendar days, gaps included', () => {
    const S = base({ meals: [meal('2026-05-01', '08:00', 2000, 160)], days: { '2026-05-05': { run: true, km: 5.5 } } })
    const ds = lastDays(S, 7, '2026-05-07')
    expect(ds.map(d => d.iso)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07'])
    const p = periodSummary(S, 7, '2026-05-07')
    expect(p).toMatchObject({ logged: 1, avgKcal: 2000, onTarget: 1, protHit: 1, runDays: 1, km: 5.5, gymDays: 0 })
  })

  it('sums carbs and fat, and splits training days from rest days', () => {
    const m = (d, kcal, prot, carb, fat) => ({ id: d, d, time: '12:00', kcal, prot, carb, fat })
    const S = base({
      meals: [m('2026-05-01', 2600, 180, 300, 80), m('2026-05-02', 2000, 140, 200, 60)],
      workouts: [{ id: 'w', d: '2026-05-01', start: 0, end: 75 * 60000, entries: [{ id: 'x', sets: [{ done: true, w: 50, r: 5 }] }] }]
    })
    expect(dayTotals(S, '2026-05-01')).toMatchObject({ carb: 300, fat: 80 })
    const p = periodSummary(S, 7, '2026-05-07')
    expect(p).toMatchObject({ avgCarb: 250, avgFat: 70, sessions: 1, trainMs: 75 * 60000 })
    expect(p.trainDays).toEqual({ days: 1, kcal: 2600, prot: 180 })
    expect(p.restDays).toEqual({ days: 1, kcal: 2000, prot: 140 })
  })

  it('leaves workouts with no checked set out of gym days, sessions and time trained', () => {
    const S = base({ workouts: [
      { id: 'a', d: '2026-05-01', start: 0, end: 30 * 60000, entries: [{ id: 'x', sets: [{ done: true, w: 50, r: 5 }] }] },
      { id: 'b', d: '2026-05-02', start: 0, end: 20 * 60000, entries: [] },
      { id: 'c', d: '2026-05-03', start: 0, end: 10 * 60000, entries: [{ id: 'x', sets: [{ done: false, w: 50, r: 5 }] }] }
    ] })
    expect(gymOn(S, '2026-05-02')).toBe(false)
    expect(gymOn(S, '2026-05-03')).toBe(false)
    expect(periodSummary(S, 7, '2026-05-07')).toMatchObject({ gymDays: 1, sessions: 1, trainMs: 30 * 60000 })
  })

  it('averages water over the days it was logged and counts days at the water goal', () => {
    const S = base({ nutri: { water: 2 }, days: { '2026-05-02': { water: 1 }, '2026-05-03': { water: 2.5 } } })
    expect(periodSummary(S, 7, '2026-05-07')).toMatchObject({ avgWater: 1.75, waterHit: 1 })
    expect(periodSummary(base(), 7, '2026-05-07').avgWater).toBe(null)
  })
})

describe('meal types and ideas', () => {
  it('guesses the meal type from the clock', () => {
    expect(mealTypeAt('07:30')).toBe('breakfast')
    expect(mealTypeAt('12:15')).toBe('lunch')
    expect(mealTypeAt('19:00')).toBe('dinner')
    expect(mealTypeAt('16:00')).toBe('snack')
    expect(mealTypeAt('23:30')).toBe('snack')
  })

  it('picks the ideas closest to what is left per meal', () => {
    const ideas = mealIdeas(550, 45)
    expect(ideas).toHaveLength(3)
    expect(ideas[0].name).toBe('Chicken, rice and vegetables')
    expect(mealIdeas(0, 20)).toEqual([])
  })

  it('suggests ideas when under the goal', () => {
    const S = base({ nutri: { kcal: 2000, prot: 150, meals: 3 }, meals: [meal('2026-05-01', '08:00', 400, 30)] })
    expect(suggestionsFor(S, '2026-05-01').ideas.length).toBe(3)
  })
})

describe('surprises', () => {
  const at = iso => new Date(iso + 'T10:00:00').getTime()

  it('computes Easter', () => {
    expect(easterOf(2026).getMonth()).toBe(3); expect(easterOf(2026).getDate()).toBe(5)
    expect(easterOf(2025).getDate()).toBe(20)
  })

  it('shows a seasonal day once per year and respects the 24 h cooldown', () => {
    const S = base({ fun: {} })
    const p = pickSurprise(S, at('2026-12-25'), 0.9)
    expect(p.egg.id).toBe('christmas')
    markSeen(S, p, at('2026-12-25'))
    expect(pickSurprise(S, at('2026-12-25') + 1000, 0.9)).toBeNull()                       // cooldown
    expect(pickSurprise(S, at('2026-12-25') + GLOBAL_COOLDOWN + 1, 0.9)?.egg?.id).not.toBe('christmas')
  })

  it('celebrates the biggest streak milestone reached, once per streak', () => {
    const meals = []
    for (let i = 1; i <= 15; i++) meals.push(meal('2026-03-' + String(i).padStart(2, '0'), '08:00', 1))
    const S = base({ meals, fun: {} })
    const p = pickSurprise(S, at('2026-03-15'), 0.9)
    expect(p.egg.id).toBe('streak14')
    markSeen(S, p, at('2026-03-15'))
    S.fun.last = 0
    expect(pickSurprise(S, at('2026-03-15'), 0.9).egg).toBeNull()
  })

  it('rolls the random one once per day and never when switched off', () => {
    const S = base({ fun: {} })
    const p = pickSurprise(S, at('2026-03-10'), RANDOM_CHANCE / 2)
    expect(p.random).toBe(true)
    markSeen(S, p, at('2026-03-10'))
    S.fun.last = 0
    expect(pickSurprise(S, at('2026-03-10'), 0)).toBeNull()
    expect(pickSurprise(base({ fun: { off: true } }), at('2026-12-25'), 0)).toBeNull()
  })

  it('uses personal dates from Settings', () => {
    const S = base({ fun: { birthday: '06-26', special: '11-26', specialLabel: 'Our anniversary' } })
    expect(pickSurprise(S, at('2026-06-26'), 0.9).egg.id).toBe('birthday')
    expect(pickSurprise(S, at('2026-11-26'), 0.9).egg.label).toBe('Our anniversary')
  })
})
