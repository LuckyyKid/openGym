import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine, effectiveRoutineId, streakWeeks, lastBW, setsDoneActive, doneWorkouts } from '../lib/history.js'
import { fmtNum, fmtL, fmtDate, todayISO, isoOf, weekKey, DAYS } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { goalsOf, dayTotals, balanceOf, dayStreak } from '../lib/nutrition.js'
import { mealSheet, runDailyChecks, motivationSheet, PhotoThumb, photoViewer } from '../nutri-sheets.jsx'

// Built-in lines for the motivation carousel; the user's own cards (Settings) come first.
const QUOTES = [
  { icon: 'flame', text: 'Small steps every day add up to big results.' },
  { icon: 'dumbbell', text: 'The only bad workout is the one that did not happen.' },
  { icon: 'fork', text: 'You cannot out-train what you do not log.' },
  { icon: 'drop', text: 'Drink water. Then drink a bit more.' },
  { icon: 'moon', text: 'Rest is part of the plan, not a break from it.' },
  { icon: 'trophy', text: 'Progress, not perfection.' },
  { icon: 'target', text: 'Show up today — future you is watching.' }
]

function NutritionCard({ S, onOpen }) {
  const g = goalsOf(S)
  const iso = todayISO()
  const tot = dayTotals(S, iso)
  const { status, diff } = balanceOf(tot.kcal, g.kcal)
  const pct = Math.min(1, tot.kcal / g.kcal)
  const col = !tot.meals ? 'var(--label-3)' : status === 'over' ? 'var(--orange)' : status === 'hit' ? 'var(--acc)' : 'var(--blue)'
  const R = 26, C = 2 * Math.PI * R
  return <div className="card tappable" style={{ cursor: 'pointer' }} onClick={onOpen}>
    <div className="row between" style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>{t('Nutrition today')}</h2>
      <Button size="sm" icon="plus" onClick={e => { e.stopPropagation(); mealSheet(iso) }}>{t('Meal')}</Button>
    </div>
    <div className="row" style={{ gap: 16 }}>
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ flex: 'none' }} aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 32 32)" />
      </svg>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{fmtNum(tot.kcal)} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>/ {fmtNum(g.kcal)} kcal</span></div>
        <div className="small" style={{ color: col, fontWeight: 500 }}>{!tot.meals ? t('Nothing logged yet') : status === 'hit' ? t('Goal reached!') : status === 'over' ? t('{0} kcal over', fmtNum(diff)) : t('{0} kcal to go', fmtNum(-diff))}</div>
        <div className="small muted row" style={{ gap: 10, marginTop: 2 }}>
          <span className="row" style={{ gap: 3 }}><Icon name="bolt" style={{ color: 'var(--purple)' }} />{fmtNum(tot.prot)} / {fmtNum(g.prot)} g</span>
          <span className="row" style={{ gap: 3 }}><Icon name="drop" style={{ color: 'var(--teal)' }} />{fmtL(tot.water)} / {fmtL(g.water)} L</span>
        </div>
      </div>
      <Icon name="chevronRight" className="chev" style={{ marginLeft: 'auto' }} />
    </div>
  </div>
}

function Motivation({ S }) {
  const cards = [...(S.motivation || []).map(c => ({ ...c, own: true })), ...QUOTES]
  return <div className="motiv">
    {cards.map((c, i) => <div key={c.id || i} className={'motiv-c' + (c.photo ? ' ph' : '')}>
      {c.photo && <PhotoThumb id={c.photo} size="100%" className="motiv-img" onClick={() => photoViewer(c.photo)} />}
      {!c.photo && <Icon name={c.icon || 'sparkles'} className="motiv-i" />}
      {c.text && <div className="motiv-t">{c.own ? c.text : t(c.text)}</div>}
    </div>)}
    <button className="motiv-c add" onClick={motivationSheet}><Icon name="plus" /><span>{t('Add your own')}</span></button>
  </div>
}

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const [weekOffset, setWeekOffset] = useState(0)
  useEffect(() => { runDailyChecks() }, [])
  const streak = dayStreak(S)

  const today = new Date()
  const routine = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const done = doneWorkouts(S)
  const doneDays = new Set(done.map(w => w.d))
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineId(S, iso), ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    const dot = done ? ' done' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} onClick={() => dayOverrideSheet(iso)}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} /></div>)
  }
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${monday.getDate()} ${monday.toLocaleDateString(dateLocale(), { month: 'short' })} – ${sunday.getDate()} ${sunday.toLocaleDateString(dateLocale(), { month: 'short' })}`

  const wThisWeek = done.filter(w => weekKey(w.d) === weekKey(todayISO())).length
  const plannedPerWeek = Object.keys(S.week).filter(k => S.week[k]).length
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  // today's session shown right under the week strip
  const doneToday = done.filter(w => w.d === todayISO())
  const onToday = () => { if (S.active) nav('/workout'); else if (doneToday.length) nav('/nutrition'); else if (routine) startFlow(routine.id); else dayOverrideSheet(todayISO()) }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week"><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel}</div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w + 1)} aria-label="Next week"><Icon name="chevronRight" /></button>
      </div>
      <div className="week">{strip}</div>
      <div className="today-row" onClick={onToday}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: S.active ? 'var(--orange)' : routine || doneToday.length ? 'var(--acc)' : 'var(--surface-3)' }}>
            <Icon name={S.active ? 'timer' : doneToday.length ? 'check' : routine ? glyphOf(routine.emoji) : 'moon'} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{t('Today')}</div>
            <div className="ttl">{S.active ? t('{0} — in progress', S.active.name) : doneToday.length ? doneToday.map(w => w.name).join(', ') : routine ? routine.name : t('Rest day')}{todayOvr && routine && !doneToday.length ? ' · ' + t('rescheduled') : ''}</div>
          </div>
        </div>
        {S.active ? <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{t('Resume')}</span>
          : doneToday.length ? <span className="tag acc"><Icon name="check" />{t('Done')}</span>
          : routine ? <span className="tag acc">{t('Start')}</span>
          : <Icon name="plus" className="chev" />}
      </div>
    </div>

    <NutritionCard S={S} onOpen={() => nav('/nutrition')} />

    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="sparkles" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Welcome!')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going — or load a ready-made Push / Pull / Legs plan.')}</div>
        <Button variant="primary" icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (PPL)')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: '1rem' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginLeft: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--yellow)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 13 }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
      </> : <div className="muted small">{t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>

    <div className="card tappable" style={{ cursor: 'pointer' }} onClick={() => calendarSheet()}>
      <div className="row between">
        <div>
          <div className="row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
            <Icon name="flame" style={{ color: 'var(--orange)' }} />
            {t('{0} week streak', streakWeeks(S))}
          </div>
          {streak.n > 1 && <div className="small" style={{ marginTop: 2, color: 'var(--orange)', fontWeight: 500 }}>{t('{0} days logged in a row', streak.n)}</div>}
          <div className="muted small" style={{ marginTop: 2 }}>{wThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {t(done.length === 1 ? '{0} workout total' : '{0} workouts total', done.length)}</div>
        </div>
        <Icon name="calendar" className="chev" style={{ fontSize: 20 }} />
      </div>
    </div>

    <Motivation S={S} />
  </div>
}
