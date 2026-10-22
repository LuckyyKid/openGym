import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtNum, fmtL, fmtDate, todayISO, isoOf, DAYS } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { goalsOf, mealsOn, dayTotals, dayLog, gymOn, runOn, workoutsOn, balanceOf, surplusAlert, suggestionsFor } from '../lib/nutrition.js'
import { flushPhotos } from '../lib/photos.js'
import { mealSheet, daySheet, nutriGoalSheet, nutriCalendarSheet, reportSheet, PhotoThumb, photoViewer } from '../nutri-sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// A progress bar that keeps going past the goal in a second colour, so "over" is visible
// at a glance instead of the bar just sitting full.
function Meter({ value, goal, color = 'var(--acc)' }) {
  const pct = goal > 0 ? value / goal : 0
  // past the goal the bar rescales: the goal mark sits at 1/pct and the overshoot fills the rest
  return <div className="meter">
    <i style={{ width: (pct > 1 ? 100 / pct : pct * 100) + '%', background: color }} />
    {pct > 1 && <b style={{ left: 100 / pct + '%', right: 0 }} />}
  </div>
}

function BalanceTag({ kcal, goal, meals }) {
  if (!meals) return <span className="tag nt">{t('Nothing logged yet')}</span>
  const { diff, status } = balanceOf(kcal, goal)
  if (status === 'hit') return <span className="tag nt acc"><Icon name="check" />{t('Goal reached!')}</span>
  if (status === 'over') return <span className="tag nt" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}><Icon name="arrowUp" />{t('{0} kcal over', fmtNum(diff))}</span>
  return <span className="tag nt" style={{ color: 'var(--blue)', background: 'color-mix(in srgb,var(--blue) 16%,transparent)' }}><Icon name="arrowDown" />{t('{0} kcal to go', fmtNum(-diff))}</span>
}

function Suggestions({ S, iso }) {
  const [open, setOpen] = useState(false)
  const s = suggestionsFor(S, iso)
  if (s.kind === 'hit') return null
  const over = s.kind === 'over'
  return <div className="card">
    <button className="row between" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(o => !o)} aria-expanded={open}>
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        <span className="lrow-i" style={{ background: over ? 'var(--orange)' : 'var(--blue)' }}><Icon name={over ? 'figureRun' : 'fork'} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="ntl">{over ? t('Balance the extra {0} kcal', fmtNum(s.over)) : t('{0} kcal and {1} g protein to go', fmtNum(s.kcal), fmtNum(s.prot))}</div>
          <div className="small muted">{over ? t('A few ways to even it out') : t(s.meals === 1 ? 'For your last meal' : 'Over your next {0} meals', s.meals)}</div>
        </div>
      </div>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} className="chev" />
    </button>
    {open && <div style={{ marginTop: 12 }}>
      {over ? <>
        {s.acts.map(a => <div key={a.k} className="mrow">
          <Icon name={a.icon} style={{ color: 'var(--orange)', flex: 'none' }} />
          <span className="nm">{t(a.name)}{a.quiet && <span className="dim"> · {t('quiet, no equipment')}</span>}</span>
          <span className="v">≈ {a.min} min</span>
        </div>)}
        {s.trim
          ? <div className="small muted" style={{ marginTop: 8 }}>{t(s.trim.meals === 1 ? 'Or keep your last meal about {0} kcal lighter.' : 'Or keep each of your next {1} meals about {0} kcal lighter.', fmtNum(s.trim.kcal), s.trim.meals)}</div>
          : <div className="small muted" style={{ marginTop: 8 }}>{t('All your planned meals are logged — moving is the way to balance today.')}</div>}
      </> : <>
        <div className="mrow"><Icon name="fork" style={{ color: 'var(--blue)', flex: 'none' }} /><span className="nm">{t('Per meal')}</span><span className="v">≈ {fmtNum(s.perMeal)} kcal · {fmtNum(s.protPerMeal)} g</span></div>
        <div className="small muted" style={{ marginTop: 8 }}>{t('Protein first: eggs, Greek yogurt, chicken, tuna, tofu or lentils make the gap easy to close.')}</div>
      </>}
      <div className="small dim" style={{ marginTop: 6 }}>{t('Estimates, scaled to your last weigh-in.')}</div>
    </div>}
  </div>
}

export default function Nutrition() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [iso, setIso] = useState(todayISO())
  useEffect(() => { flushPhotos() }, [])

  const today = todayISO()
  const g = goalsOf(S)
  const tot = dayTotals(S, iso)
  const meals = mealsOn(S, iso)
  const log = dayLog(S, iso)
  const ws = workoutsOn(S, iso)
  const alert = surplusAlert(S, iso)
  const isToday = iso === today

  // week strip around the picked day — future days are shown but can't be picked
  const sel = new Date(iso + 'T12:00:00')
  const monday = new Date(sel); monday.setDate(sel.getDate() - ((sel.getDay() + 6) % 7))
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const di = isoOf(d), future = di > today
    const dt = dayTotals(S, di)
    const dot = dt.meals ? ' ' + balanceOf(dt.kcal, g.kcal).status : ''
    strip.push(<button key={i} disabled={future} className={'wday' + (di === today ? ' today' : '') + (di === iso ? ' sel' : '')} onClick={() => setIso(di)}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} /></button>)
  }
  const shiftWeek = n => { const d = new Date(sel); d.setDate(d.getDate() + n * 7); const x = isoOf(d); setIso(x > today ? today : x) }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Nutrition')}</h1><div className="sub">{isToday ? t('Today') : sel.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <div className="row" style={{ gap: 8 }}>
        {!MOBILE && <button className="iconbtn" onClick={reportSheet} aria-label={t('Export report')}><Icon name="download" /></button>}
        <button className="iconbtn" onClick={() => nutriCalendarSheet(iso, setIso)} aria-label={t('Calendar')}><Icon name="calendar" /></button>
        <button className="iconbtn" onClick={nutriGoalSheet} aria-label={t('Daily goals')}><Icon name="target" /></button>
      </div>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => shiftWeek(-1)} aria-label="Previous week"><Icon name="chevronLeft" /></button>
        {!isToday ? <Button size="sm" variant="ghost" onClick={() => setIso(today)}>{t('Back to today')}</Button> : <div className="small muted" style={{ fontWeight: 500 }}>{t('This week')}</div>}
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} disabled={isoOf(new Date(monday.getTime() + 7 * 86400000)) > today} onClick={() => shiftWeek(1)} aria-label="Next week"><Icon name="chevronRight" /></button>
      </div>
      <div className="week">{strip}</div>
    </div>

    {alert && <div className="card nalert">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="flame" /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ntl">{t('{0} kcal over your goal', fmtNum(alert.over))}</div>
          <div className="small muted" style={{ marginTop: 2 }}>
            {alert.close.length
              ? t('{0} and {1} were only {2} min apart — that is where most of it came from.', alert.close[0][0].name || alert.close[0][0].time, alert.close[0][1].name || alert.close[0][1].time, alert.close[0][2])
              : t('Open the suggestions below for ways to balance it.')}
          </div>
        </div>
      </div>
      <div style={{ height: 10 }} />
      <Button size="sm" onClick={() => update(s => { s.nutriAck = { ...(s.nutriAck || {}), [iso]: alert.over } })}>{t('Got it')}</Button>
    </div>}

    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Calories')}</h2>
        <BalanceTag kcal={tot.kcal} goal={g.kcal} meals={tot.meals} />
      </div>
      <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
        <div className="big">{fmtNum(tot.kcal)}</div><span className="muted">/ {fmtNum(g.kcal)} kcal</span>
      </div>
      <Meter value={tot.kcal} goal={g.kcal} />
      <div className="grid2" style={{ marginTop: 14 }}>
        <div>
          <div className="small muted row" style={{ gap: 5 }}><Icon name="bolt" style={{ color: 'var(--purple)' }} />{t('Protein')}</div>
          <div style={{ fontWeight: 600, fontSize: 18, margin: '2px 0 6px' }}>{fmtNum(tot.prot)} <span className="muted small">/ {fmtNum(g.prot)} g</span></div>
          <Meter value={tot.prot} goal={g.prot} color="var(--purple)" />
        </div>
        <div>
          <div className="small muted row" style={{ gap: 5 }}><Icon name="drop" style={{ color: 'var(--teal)' }} />{t('Water')}</div>
          <div style={{ fontWeight: 600, fontSize: 18, margin: '2px 0 6px' }}>{fmtL(tot.water)} <span className="muted small">/ {fmtL(g.water)} L</span></div>
          <Meter value={tot.water} goal={g.water} color="var(--teal)" />
        </div>
      </div>
      <div className="chips" style={{ marginTop: 12 }}>
        {[0.25, 0.5].map(v => <button key={v} className="chip nchip" onClick={() => update(s => { s.days = s.days || {}; const d = s.days[iso] || {}; s.days[iso] = { ...d, water: Math.min(10, Math.round(((d.water || 0) + v) * 100) / 100) } })}>
          <Icon name="drop" style={{ color: 'var(--teal)', marginRight: 4 }} />+{fmtL(v)} L</button>)}
        {tot.water > 0 && <button className="chip nchip" onClick={() => update(s => { const d = s.days[iso]; s.days[iso] = { ...d, water: Math.max(0, Math.round((d.water - 0.25) * 100) / 100) } })}>−{fmtL(0.25)} L</button>}
      </div>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{isToday ? t("Today's meals") : t('Meals · {0}', fmtDate(iso, true))}</h2>
        <Button size="sm" icon="plus" onClick={() => mealSheet(iso)}>{t('Meal')}</Button>
      </div>
      {meals.length ? <div className="nmeals">
        {meals.map(m => <button key={m.id} className="nmeal" onClick={() => mealSheet(iso, m)}>
          <span className="tm">{m.time}</span>
          <span className="nm">{m.name || t('Meal')}</span>
          <span className="v"><b>{fmtNum(m.kcal || 0)}</b> kcal · {fmtNum(m.prot || 0)} g</span>
        </button>)}
        <div className="small dim" style={{ marginTop: 6 }}>{t(meals.length === 1 ? '{0} of {1} planned meal' : '{0} of {1} planned meals', meals.length, g.meals)}</div>
      </div> : <div className="muted small">{t('No meals logged for this day yet.')}</div>}
    </div>

    <Suggestions S={S} iso={iso} />

    <div className="card tappable" style={{ cursor: 'pointer' }} onClick={() => daySheet(iso)}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{t('Activity & notes')}</h2>
        <Icon name="pencil" className="chev" />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className={'tag nt' + (gymOn(S, iso) ? ' acc' : '')}><Icon name="dumbbell" />{ws.length ? ws.map(w => w.name).join(', ') : t('Gym')}</span>
        <span className="tag nt" style={runOn(S, iso) ? { color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' } : undefined}>
          <Icon name="figureRun" />{t('Cardio')}{runOn(S, iso) && (log.km || log.min) ? ' · ' + [log.km ? fmtNum(log.km) + ' km' : '', log.min ? log.min + ' min' : ''].filter(Boolean).join(' · ') : ''}
        </span>
      </div>
      {(log.notes || log.photo) && <div className="row" style={{ gap: 12, marginTop: 10, alignItems: 'flex-start' }}>
        {log.photo && <PhotoThumb id={log.photo} size={56} onClick={e => { e.stopPropagation(); photoViewer(log.photo) }} />}
        {log.notes && <div className="small muted" style={{ whiteSpace: 'pre-wrap', minWidth: 0 }}>{log.notes}</div>}
      </div>}
      {!gymOn(S, iso) && !runOn(S, iso) && !log.notes && <div className="small dim" style={{ marginTop: 8 }}>{t('Tap to log gym, cardio, a proof photo or notes.')}</div>}
    </div>

    <Button variant="ghost" className="dim" icon="chart" onClick={() => nav('/stats')}>{t('Nutrition stats')}</Button>
  </div>
}
