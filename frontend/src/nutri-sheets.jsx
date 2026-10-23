// Bottom sheets for nutrition, the daily log, surprises and motivation — same building blocks
// as sheets.jsx (openSheet, Section/Row, Stepper, Button), kept in their own module so the
// training sheets stay readable.
import { useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { fmtDate, fmtNum, fmtL, fmtVol, durPart, todayISO, isoOf, uid, MONTHS_LONG } from './lib/format.js'
import { t } from './lib/i18n.js'
import { goalsOf, NUTRI_DEF, dayLog, dayTotals, mealsOn, gymOn, runOn, balanceOf, nowHHMM, missedYesterday, MEAL_TYPES, mealTypeAt, mealTypeName, workoutMs, trainMsOn } from './lib/nutrition.js'
import { effectiveRoutine, setsDone, setLabel } from './lib/history.js'
import { EXIDX } from './lib/exercises.js'
import { nav } from './lib/nav.js'
import { pickSurprise, markSeen } from './lib/fun.js'
import { savePhoto, deletePhoto, usePhoto } from './lib/photos.js'
import { reportHTML } from './lib/report.js'
import { printHTML } from './lib/plan-share.js'
import { MOBILE, shareExport } from './lib/mobile.js'
import { confirmSheet, dayOverrideSheet, startFlow, workoutDetailSheet } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import { Button, Stepper, Switch, Segmented, Section, Row, TextField, TextArea, NumberField, SearchField } from './components/ui.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

/* ============================ photo helpers ============================ */
export function PhotoThumb({ id, size = 64, onClick, className = '' }) {
  const src = usePhoto(id)
  return src
    ? <img src={src} alt="" className={'nphoto ' + className} style={{ width: size, height: size }} onClick={onClick} />
    : <span className={'nphoto thumb-x ' + className} style={{ width: size, height: size }}><Icon name="image" /></span>
}
export function photoViewer(id) {
  ui().openSheet(() => <PhotoFull id={id} />, { kind: 'center' })
}
function PhotoFull({ id }) {
  const src = usePhoto(id)
  return src ? <img src={src} alt="" style={{ width: '100%', borderRadius: 12, display: 'block' }} /> : <div className="muted small">{t('Loading…')}</div>
}
// A hidden file input driven by a normal button — the picker is the system's, the trigger is ours.
function PhotoPicker({ onPicked, children, variant = 'plain', icon = 'camera' }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  return <>
    <Button variant={variant} icon={icon} disabled={busy} onClick={() => ref.current.click()}>{busy ? t('Saving…') : children}</Button>
    <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={async ev => {
      const f = ev.target.files[0]; ev.target.value = ''
      if (!f) return
      setBusy(true)
      try { onPicked(await savePhoto(f)) } catch { toast(t('Could not read that photo')) }
      setBusy(false)
    }} />
  </>
}

/* ============================ meal ============================ */
const pad = n => String(n).padStart(2, '0')
const r1 = v => Math.round((v || 0) * 10) / 10
function MealSheet({ iso, meal, close }) {
  // A meal logged for a past day gets a neutral noon instead of the current clock time —
  // "now" only means something today. Either way the time is editable.
  const [time0] = useState(() => meal?.time || (iso === todayISO() ? nowHHMM() : '12:00'))
  const [h, setH] = useState(+time0.split(':')[0])
  const [m, setM] = useState(Math.round(+time0.split(':')[1] / 5) * 5 % 60)
  const [type, setType] = useState(() => meal ? meal.type || null : mealTypeAt(time0))
  const [name, setName] = useState(meal?.name || '')
  const [kcal, setKcal] = useState(meal?.kcal ?? null)
  const [prot, setProt] = useState(meal?.prot ?? null)
  const [carb, setCarb] = useState(meal?.carb ?? null)
  const [fat, setFat] = useState(meal?.fat ?? null)
  const save = () => {
    if (!kcal && !prot) { toast(t('Enter calories or protein')); return }
    const rec = { d: iso, time: pad(h) + ':' + pad(m), type, name: name.trim(), kcal: Math.round(kcal || 0), prot: r1(prot), carb: r1(carb), fat: r1(fat) }
    update(s => {
      s.meals = s.meals || []
      if (meal) Object.assign(s.meals.find(x => x.id === meal.id) || {}, rec)
      else s.meals.push({ id: uid(), ...rec })
    })
    close()
    toast(meal ? t('Meal updated') : t('Meal added'))
  }
  return <>
    <h3>{meal ? t('Edit meal') : t('Add meal')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{iso === todayISO() ? t('Today') : fmtDate(iso, true)}</div>
    <Segmented className="seg-range" value={type} onChange={setType} options={MEAL_TYPES.map(x => ({ value: x.k, label: t(x.name) }))} />
    <div style={{ height: 10 }} />
    <TextField placeholder={t('What did you eat? (optional)')} value={name} onChange={e => setName(e.target.value)} maxLength={80} />
    <div className="grid2" style={{ marginTop: 10 }}>
      <label className="nfield"><span>{t('Calories')}</span><span className="nfield-in"><NumberField value={kcal} nullable decimal={false} onChange={setKcal} placeholder="0" /><i>kcal</i></span></label>
      <label className="nfield"><span>{t('Protein')}</span><span className="nfield-in"><NumberField value={prot} nullable onChange={setProt} placeholder="0" /><i>g</i></span></label>
      <label className="nfield"><span>{t('Carbs')}</span><span className="nfield-in"><NumberField value={carb} nullable onChange={setCarb} placeholder="0" /><i>g</i></span></label>
      <label className="nfield"><span>{t('Fat')}</span><span className="nfield-in"><NumberField value={fat} nullable onChange={setFat} placeholder="0" /><i>g</i></span></label>
    </div>
    <div className="grid2" style={{ marginTop: 10 }}>
      <Stepper label={t('Hour')} value={h} step={1} decimal={false} onChange={v => setH(Math.min(23, Math.round(v || 0)))} />
      <Stepper label={t('Minute')} value={m} step={5} decimal={false} onChange={v => setM(Math.min(55, Math.round(v || 0)))} />
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {meal && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => { update(s => { s.meals = s.meals.filter(x => x.id !== meal.id) }); close(); toast(t('Meal deleted')) }}>{t('Delete meal')}</Button></>}
  </>
}
export const mealSheet = (iso, meal) => ui().openSheet(close => <MealSheet iso={iso} meal={meal} close={close} />)

/* ============================ day log ============================ */
function DaySheet({ iso, close }) {
  const st = useStore(s => s.S)
  const cur = dayLog(st, iso)
  const workouts = st.workouts.filter(w => w.d === iso)
  const [d, setD] = useState(() => ({ water: 0, gym: false, run: false, km: null, min: null, photo: null, notes: '', ...cur }))
  const set = patch => setD(x => ({ ...x, ...patch }))
  const save = () => {
    update(s => {
      s.days = s.days || {}
      const v = { ...d, notes: (d.notes || '').trim() }
      if (!v.run) { v.km = null; v.min = null }
      s.days[iso] = v
    })
    // the old photo is only removed once the change is saved
    if (cur.photo && cur.photo !== d.photo) deletePhoto(cur.photo)
    close(); toast(t('Day saved'))
  }
  const cancel = () => { if (d.photo && d.photo !== cur.photo) deletePhoto(d.photo); close() }
  return <>
    <h3>{iso === todayISO() ? t('Today') : fmtDate(iso, true)}</h3>
    <Section>
      <Row icon="dumbbell" iconTint="var(--acc)" title={t('Gym')}
        subtitle={workouts.length ? t('{0} logged in the app', workouts.map(w => w.name).join(', ')) : t('Trained outside the app')}>
        <Switch checked={d.gym || workouts.length > 0} disabled={workouts.length > 0} onChange={v => set({ gym: v })} />
      </Row>
      <Row icon="figureRun" iconTint="var(--orange)" title={t('Cardio')}>
        <Switch checked={!!d.run} onChange={v => set({ run: v })} />
      </Row>
    </Section>
    {d.run && <div className="grid2" style={{ marginBottom: 12 }}>
      <Stepper label={t('Distance')} unit="km" value={d.km || 0} step={0.5} onChange={v => set({ km: v })} />
      <Stepper label={t('Duration')} unit="min" value={d.min || 0} step={5} decimal={false} onChange={v => set({ min: Math.round(v) })} />
    </div>}
    <Stepper label={t('Water')} unit="L" value={d.water || 0} step={0.25} onChange={v => set({ water: Math.min(10, v) })} />
    <h4 className="sec">{t('Proof photo')}</h4>
    {d.photo
      ? <div className="row" style={{ gap: 12 }}>
          <PhotoThumb id={d.photo} size={72} onClick={() => photoViewer(d.photo)} />
          <Button size="sm" variant="ghost" icon="trash" style={{ color: 'var(--red)' }} onClick={() => { if (d.photo !== cur.photo) deletePhoto(d.photo); set({ photo: null }) }}>{t('Remove')}</Button>
        </div>
      : <PhotoPicker onPicked={id => set({ photo: id })}>{t('Add a photo')}</PhotoPicker>}
    <h4 className="sec">{t('Notes')}</h4>
    <TextArea value={d.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder={t('How did it go?')} maxLength={2000} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={cancel}>{t('Cancel')}</Button>
  </>
}
// locked: the sheet owns a just-uploaded photo, so it must close through Save or Cancel
export const daySheet = iso => ui().openSheet(close => <DaySheet iso={iso} close={close} />, { locked: true })

/* ============================ goals ============================ */
export function NutriGoals({ close = () => {} }) {
  const [g, setG] = useState(() => goalsOf(S()))
  const set = patch => setG(x => ({ ...x, ...patch }))
  return <>
    <h3>{t('Daily goals')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Your day is compared against these — over, under or on target.')}</div>
    <div className="list" style={{ gap: 10 }}>
      <Stepper label={t('Calories')} unit="kcal" value={g.kcal} step={50} decimal={false} onChange={v => set({ kcal: Math.max(500, Math.round(v)) })} />
      <Stepper label={t('Protein')} unit="g" value={g.prot} step={5} decimal={false} onChange={v => set({ prot: Math.round(v) })} />
      <Stepper label={t('Carbs')} unit="g" value={g.carb} step={10} decimal={false} onChange={v => set({ carb: Math.max(0, Math.round(v)) })} />
      <Stepper label={t('Fat')} unit="g" value={g.fat} step={5} decimal={false} onChange={v => set({ fat: Math.max(0, Math.round(v)) })} />
      <Stepper label={t('Meals per day')} value={g.meals} step={1} decimal={false} onChange={v => set({ meals: Math.max(1, Math.min(10, Math.round(v))) })} />
      <Stepper label={t('Water')} unit="L" value={g.water} step={0.25} onChange={v => set({ water: Math.max(0.25, Math.min(10, v)) })} />
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { update(s => { s.nutri = g }); close(); toast(t('Goals saved')) }}>{t('Save goals')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={() => setG({ ...NUTRI_DEF })}>{t('Reset to defaults')}</Button>
  </>
}
export const nutriGoalSheet = () => ui().openSheet(close => <NutriGoals close={close} />)

/* ============================ calendar ============================ */
const kShort = k => (k >= 1000 ? fmtNum(Math.round(k / 100) / 10) + 'k' : String(Math.round(k)))
export function NutriCalendar({ start, onPick, close = () => {} }) {
  const st = useStore(s => s.S)
  const g = goalsOf(st)
  const [cur, setCur] = useState(() => { const d = new Date((start || todayISO()) + 'T12:00:00'); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const today = todayISO()
  const startOffset = (new Date(y, mo, 1).getDay() + 6) % 7
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const cells = []
  let gymN = 0, runN = 0, hitN = 0
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = isoOf(new Date(y, mo, d))
    const future = iso > today
    const gym = gymOn(st, iso), run = runOn(st, iso)
    const tot = dayTotals(st, iso)
    const hit = tot.meals > 0 && balanceOf(tot.kcal, g.kcal).status === 'hit'
    if (gym) gymN++; if (run) runN++; if (hit) hitN++
    cells.push(<button key={d} disabled={future} className={'cal-d' + (iso === today ? ' today' : '') + (iso === start ? ' sel' : '') + (hit ? ' hit' : '')}
      onClick={() => { close(); onPick(iso) }}>
      <span>{d}</span>
      {tot.meals > 0 && <span className={'cal-k ' + balanceOf(tot.kcal, g.kcal).status}>{kShort(tot.kcal)}</span>}
      <span className="cal-ic">{gym && <Icon name="dumbbell" style={{ color: 'var(--acc)' }} />}{run && <Icon name="figureRun" style={{ color: 'var(--orange)' }} />}</span>
    </button>)
  }
  return <>
    <div className="row between" style={{ marginBottom: 2 }}>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label="Previous month"><Icon name="chevronLeft" /></button>
      <h3 style={{ margin: 0 }}>{t(MONTHS_LONG[mo])} {y}</h3>
      <button className="iconbtn" disabled={new Date(y, mo + 1, 1) > new Date()} onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label="Next month"><Icon name="chevronRight" /></button>
    </div>
    <div className="small muted" style={{ textAlign: 'center' }}>{t('{0} gym · {1} cardio · {2} on target', gymN, runN, hitN)}</div>
    <div className="cal-grid">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(l => <div key={l} className="cal-h">{t(l)}</div>)}{cells}</div>
    <div className="cal-legend">
      <span><Icon name="dumbbell" style={{ color: 'var(--acc)', marginRight: 4 }} />{t('Gym')}</span>
      <span><Icon name="figureRun" style={{ color: 'var(--orange)', marginRight: 4 }} />{t('Cardio')}</span>
      <span><i style={{ background: 'var(--acc)' }} />{t('Calories on target')}</span>
    </div>
  </>
}
export const nutriCalendarSheet = (start, onPick) => ui().openSheet(close => <NutriCalendar start={start} onPick={onPick} close={close} />)

/* ============================ report ============================ */
export function ReportSheet({ close = () => {} }) {
  const [range, setRange] = useState('7')
  const [custom, setCustom] = useState(() => { const f = new Date(); f.setDate(f.getDate() - 13); return [isoOf(f), todayISO()] })
  const user = useStore(s => s.user)
  const rangeOf = r => {
    if (r === 'custom') return custom[0] <= custom[1] ? custom : [custom[1], custom[0]]
    const now = new Date(), to = todayISO()
    if (r === 'month') return [isoOf(new Date(now.getFullYear(), now.getMonth(), 1)), to]
    if (r === 'last') return [isoOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoOf(new Date(now.getFullYear(), now.getMonth(), 0))]
    const f = new Date(); f.setDate(f.getDate() - (+r - 1)); return [isoOf(f), to]
  }
  const [from, to] = rangeOf(range)
  // The app's web view can't print, so on mobile the report goes out through the share sheet
  // as an HTML file — open it in a browser and save it as a PDF from there.
  const go = async () => {
    close()
    const html = await reportHTML(S(), from, to, user?.name || '')
    if (MOBILE) shareExport(html, `opengym-report-${from}-${to}.html`).catch(() => toast(t('Could not share the report')))
    else printHTML(html)
  }
  return <>
    <h3>{t('Export report')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Daily summaries, every meal, cardio, notes and photos — print it or save it as a PDF.')}</div>
    <Segmented className="seg-range" value={range} onChange={setRange}
      options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: 'month', label: t('This month') }, { value: 'last', label: t('Last month') }, { value: 'custom', label: t('Dates') }]} />
    {range === 'custom' && <div className="grid2" style={{ marginTop: 10 }}>
      <label className="nfield"><span>{t('From')}</span><TextField type="date" value={custom[0]} max={todayISO()} onChange={e => e.target.value && setCustom([e.target.value, custom[1]])} /></label>
      <label className="nfield"><span>{t('To')}</span><TextField type="date" value={custom[1]} max={todayISO()} onChange={e => e.target.value && setCustom([custom[0], e.target.value])} /></label>
    </div>}
    <div className="small dim" style={{ textAlign: 'center', margin: '4px 0 14px' }}>{fmtDate(from, true)} – {fmtDate(to, true)}</div>
    <Button variant="primary" icon="download" onClick={go}>{MOBILE ? t('Share report') : t('Print / Save as PDF')}</Button>
  </>
}
export const reportSheet = () => ui().openSheet(close => <ReportSheet close={close} />)

/* ============================ day detail ============================ */
const typeOf = m => t(mealTypeName(m.type) || 'Meal')
export function MealRow({ m, iso }) {
  return <button className="nmeal" onClick={() => mealSheet(iso, m)}>
    <span className="tm">{m.time}</span>
    <span className="nm">{m.name || typeOf(m)}{m.name && m.type && <span className="dim"> · {typeOf(m)}</span>}</span>
    <span className="v"><b>{fmtNum(m.kcal || 0)}</b> kcal<br /><span className="dim">{macroLine(m)}</span></span>
  </button>
}
// "40 P · 60 C · 15 F" — the letters follow the language (P · G · L in French).
export const macroLine = m => [[m.prot, 'P'], [m.carb, 'C'], [m.fat, 'F']].map(([v, k]) => fmtNum(+v || 0) + ' ' + t(k)).join(' · ')

/* ============================ macros + training for a day ============================ */
// A progress bar that keeps going past the goal in a second colour, so "over" is visible
// at a glance instead of the bar just sitting full.
export function Meter({ value, goal, color = 'var(--acc)' }) {
  const pct = goal > 0 ? value / goal : 0
  // past the goal the bar rescales: the goal mark sits at 1/pct and the overshoot fills the rest
  return <div className="meter">
    <i style={{ width: (pct > 1 ? 100 / pct : pct * 100) + '%', background: color }} />
    {pct > 1 && <b style={{ left: 100 / pct + '%', right: 0 }} />}
  </div>
}

// Protein, carbs, fat and water against their goals, two by two.
export function MacroGrid({ tot, g }) {
  const cell = (icon, color, label, v, goal, unit, fmt = fmtNum) => <div>
    <div className="small muted row" style={{ gap: 5 }}><Icon name={icon} style={{ color }} />{label}</div>
    <div style={{ fontWeight: 600, fontSize: 17, margin: '2px 0 6px' }}>{fmt(v)} <span className="muted small">/ {fmt(goal)} {unit}</span></div>
    <Meter value={v} goal={goal} color={color} />
  </div>
  return <div className="grid2 mgrid">
    {cell('bolt', 'var(--purple)', t('Protein'), tot.prot, g.prot, 'g')}
    {cell('flame', 'var(--yellow)', t('Carbs'), tot.carb, g.carb, 'g')}
    {cell('drop', 'var(--pink)', t('Fat'), tot.fat, g.fat, 'g')}
    {cell('drop', 'var(--teal)', t('Water'), tot.water, g.water, 'L', fmtL)}
  </div>
}

// Rep sets grouped by weight and reps — "3 × 8 @ 75 kg, 1 × 6 @ 75 kg" — so a day reads at a
// glance; effort ratings stay in the workout's own detail. Timed and cardio sets are listed.
export function entryLine(e, unit) {
  const done = e.sets.filter(s => s.done)
  if (!done.length) return t('no sets')
  if (!done.every(s => s.min == null && s.sec == null && s.r != null)) return done.map(s => setLabel(e.id, s, e.target)).join(' · ')
  const runs = []
  done.forEach(s => {
    const last = runs[runs.length - 1], w = s.w || 0
    if (last && last.r === s.r && last.w === w) last.n++
    else runs.push({ n: 1, r: s.r, w })
  })
  return runs.map(x => x.n + ' × ' + x.r + (x.w > 0 ? ' @ ' + fmtNum(x.w) + ' ' + unit : '')).join(', ')
}

// What was trained on a day: the app's workouts in full (time, sets, volume, exercises), or
// what the plan had for that day and a way to start it.
export function DayTraining({ iso }) {
  const st = useStore(s => s.S)
  const ws = st.workouts.filter(w => w.d === iso)
  const planned = effectiveRoutine(st, iso)
  const log = dayLog(st, iso)
  const isToday = iso === todayISO()
  const total = trainMsOn(st, iso)
  return <div className="card">
    <div className="row between" style={{ marginBottom: ws.length ? 10 : 6 }}>
      <h2 style={{ margin: 0 }}>{t('Training')}</h2>
      {total >= 60000 && <span className="tag nt acc"><Icon name="timer" />{durPart(total)[0]}</span>}
    </div>
    {ws.map(w => <button key={w.id} className="nwork" onClick={() => workoutDetailSheet(w)}>
      <div className="row between" style={{ gap: 8 }}>
        <b className="ntl">{w.name}</b>
        <Icon name="chevronRight" className="chev" />
      </div>
      <div className="small muted">{[...durPart(workoutMs(w)), t('{0} sets', setsDone(w)), fmtVol(w.vol || 0, st.unit)].join(' · ')}</div>
      <div className="nwork-ex">{w.entries.map((e, i) => {
        const ex = EXIDX[e.id]
        return <div key={i} className="nwork-e">
          <div className="nm capitalize">{ex ? ex.n : (e.n || e.id)}</div>
          <div className="small muted">{entryLine(e, st.unit)}</div>
        </div>
      })}</div>
    </button>)}
    {!ws.length && (planned
      ? <div className="row between" style={{ gap: 10 }}>
          <div className="small muted">{t('Planned:')} <b style={{ color: 'var(--label)' }}>{planned.name}</b>{iso < todayISO() && <span className="dim"> · {t('Not done')}</span>}</div>
          {isToday && <Button size="sm" variant="primary" icon="play" onClick={() => st.active ? nav('/workout') : startFlow(planned.id)}>{st.active ? t('Resume') : t('Start')}</Button>}
        </div>
      : <div className="small muted">{log.gym ? t('Trained outside the app') : t('Rest day')}</div>)}
  </div>
}

// Read-only view of one day, opened from the calendar: what was eaten, drunk and trained,
// with the photo and notes. Editing goes through the meal and day sheets.
function DayDetail({ iso, close, onOpenDay }) {
  const st = useStore(s => s.S)
  const g = goalsOf(st)
  const tot = dayTotals(st, iso)
  const ms = mealsOn(st, iso)
  const log = dayLog(st, iso)
  const bal = balanceOf(tot.kcal, g.kcal)
  return <>
    <h3 style={{ textTransform: 'capitalize' }}>{iso === todayISO() ? t('Today') : fmtDate(iso, true)}</h3>
    <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
      <div className="big" style={{ color: tot.meals ? { over: 'var(--orange)', hit: 'var(--acc)', under: 'var(--blue)' }[bal.status] : undefined }}>{fmtNum(tot.kcal)}</div>
      <span className="muted">/ {fmtNum(g.kcal)} kcal</span>
    </div>
    <Meter value={tot.kcal} goal={g.kcal} />
    <div style={{ height: 12 }} />
    <MacroGrid tot={tot} g={g} />
    <div style={{ height: 12 }} />
    <DayTraining iso={iso} />
    <h4 className="sec">{t('Meals')}</h4>
    {ms.length
      ? <div className="nmeals">{ms.map(m => <MealRow key={m.id} m={m} iso={iso} />)}</div>
      : <div className="small muted">{t('No meals logged for this day yet.')}</div>}
    <h4 className="sec">{t('Cardio')}</h4>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="tag nt" style={log.run ? { color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' } : undefined}>
        <Icon name="figureRun" />{log.run ? [t('Cardio'), log.km ? fmtNum(log.km) + ' km' : '', log.min ? log.min + ' min' : ''].filter(Boolean).join(' · ') : t('No cardio')}
      </span>
    </div>
    {log.photo && <><h4 className="sec">{t('Proof photo')}</h4><PhotoThumb id={log.photo} size={96} onClick={() => photoViewer(log.photo)} /></>}
    {log.notes && <><h4 className="sec">{t('Notes')}</h4><div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{log.notes}</div></>}
    <div style={{ height: 16 }} />
    <div className="grid2">
      <Button icon="plus" onClick={() => mealSheet(iso)}>{t('Meal')}</Button>
      <Button icon="pencil" onClick={() => { close(); daySheet(iso) }}>{t('Edit day')}</Button>
    </div>
    {onOpenDay && <><div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={() => { close(); onOpenDay(iso) }}>{t('Open this day')}</Button></>}
  </>
}
export const dayDetailSheet = (iso, onOpenDay) => ui().openSheet(close => <DayDetail iso={iso} close={close} onOpenDay={onOpenDay} />)

/* ============================ meal history ============================ */
// Every meal ever logged, newest day first, filterable by type and searchable by name.
export function MealHistory() {
  const st = useStore(s => s.S)
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(30)
  const needle = q.trim().toLowerCase()
  const byDay = {}
  ;(st.meals || []).forEach(m => {
    if (type !== 'all' && m.type !== type) return
    if (needle && !(m.name || '').toLowerCase().includes(needle)) return
    ;(byDay[m.d] = byDay[m.d] || []).push(m)
  })
  const days = Object.keys(byDay).sort().reverse()
  return <>
    <SearchField placeholder={t('Search meals')} value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} />
    <div className="chips" style={{ margin: '10px 0 12px' }}>
      {[{ k: 'all', name: 'All' }, ...MEAL_TYPES].map(x => <button key={x.k} className={'chip nchip' + (type === x.k ? ' on' : '')} onClick={() => setType(x.k)}>{t(x.name)}</button>)}
    </div>
    {!days.length && <div className="card"><div className="small muted">{(st.meals || []).length ? t('No meals match.') : t('No meals logged yet.')}</div></div>}
    {days.slice(0, limit).map(d => {
      const list = byDay[d].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
      const sum = k => list.reduce((a, m) => a + (+m[k] || 0), 0)
      return <div key={d} className="card">
        <button className="row between" style={{ width: '100%', marginBottom: 6 }} onClick={() => dayDetailSheet(d)}>
          <b style={{ textTransform: 'capitalize' }}>{d === todayISO() ? t('Today') : fmtDate(d, true)}</b>
          <span className="small muted">{fmtNum(sum('kcal'))} kcal · {macroLine({ prot: sum('prot'), carb: sum('carb'), fat: sum('fat') })}</span>
        </button>
        <div className="nmeals">{list.map(m => <MealRow key={m.id} m={m} iso={d} />)}</div>
      </div>
    })}
    {days.length > limit && <Button variant="ghost" onClick={() => setLimit(l => l + 30)}>{t('Show more')}</Button>}
  </>
}

/* ============================ surprises ============================ */
function Surprise({ pick, close }) {
  const e = pick.egg
  const title = e.id.startsWith('streak') ? t(e.title, pick.streak) : e.personal ? (e.label || t(e.title)) : t(e.title)
  const text = e.personal ? t(e.text, e.label || t(e.title)) : t(e.text)
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div className="egg-ic"><Icon name={e.icon} /></div>
    <h3 style={{ margin: '10px 0 6px' }}>{title}</h3>
    <div className="muted small" style={{ marginBottom: 16, lineHeight: 1.5 }}>{text}</div>
    <Button variant="primary" onClick={close}>{t('Thanks!')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" icon="reset" onClick={() => ui().celebrate(e.fx)}>{t('Play again')}</Button>
  </div>
}

function MissedDay({ info, close }) {
  const { iso, routine } = info
  const today = todayISO()
  const todayFree = !S().dayPlan[today] && !S().week[new Date().getDay()]
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div className="egg-ic" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}><Icon name="calendar" /></div>
    <h3 style={{ margin: '10px 0 6px' }}>{t('Yesterday got away')}</h3>
    <div className="muted small" style={{ marginBottom: 16, lineHeight: 1.5 }}>{t('{0} was planned for {1} and nothing was logged. No drama — what do you want to do?', routine.name, fmtDate(iso, true))}</div>
    <Button variant="primary" icon="calendar" onClick={() => { close(); if (todayFree) { update(s => { s.dayPlan[today] = routine.id }); toast(t('{0} planned for {1}', routine.name, t('today'))) } else dayOverrideSheet(today) }}>{t('Move it to today')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => { close(); daySheet(iso) }}>{t('I trained — log it')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Skip it')}</Button>
  </div>
}

// Called once per app session from Home: at most one popup — a surprise first, otherwise the
// missed-day nudge (once per missed day).
let checked = false
export function runDailyChecks() {
  if (checked) return
  checked = true
  const st = S()
  const pick = pickSurprise(st)
  if (pick && (pick.egg || pick.patch)) update(s => markSeen(s, pick))
  if (pick && pick.egg) {
    setTimeout(() => {
      ui().openSheet(close => <Surprise pick={pick} close={close} />, { kind: 'center' })
      ui().celebrate(pick.egg.fx)
    }, 400)
    return
  }
  const miss = missedYesterday(st)
  if (miss && (st.fun || {}).missed !== miss.iso) {
    update(s => { s.fun = { ...(s.fun || {}), missed: miss.iso } })
    setTimeout(() => ui().openSheet(close => <MissedDay info={miss} close={close} />, { kind: 'center' }), 400)
  }
}

/* ============================ personal dates ============================ */
const mdParts = v => (v ? v.split('-').map(Number) : [1, 1])
function DateRow({ label, value, onChange }) {
  const [m, d] = mdParts(value)
  const max = new Date(2024, m, 0).getDate()   // leap year, so 29 Feb is allowed
  const setMD = (mm, dd) => onChange(String(mm).padStart(2, '0') + '-' + String(Math.min(dd, new Date(2024, mm, 0).getDate())).padStart(2, '0'))
  return <div style={{ marginBottom: 12 }}>
    <div className="row between" style={{ marginBottom: 6 }}>
      <span className="small muted">{label}</span>
      <Switch checked={!!value} onChange={on => onChange(on ? '01-01' : null)} />
    </div>
    {value && <div className="grid2">
      <Stepper label={t('Day')} value={d} step={1} decimal={false} onChange={v => setMD(m, Math.max(1, Math.min(max, Math.round(v))))} />
      <Stepper label={t(MONTHS_LONG[m - 1])} value={m} step={1} decimal={false} onChange={v => setMD(Math.max(1, Math.min(12, Math.round(v))), d)} />
    </div>}
  </div>
}
function PersonalDates({ close }) {
  const fun = S().fun || {}
  const [b, setB] = useState(fun.birthday || null)
  const [sp, setSp] = useState(fun.special || null)
  const [label, setLabel] = useState(fun.specialLabel || '')
  return <>
    <h3>{t('Your dates')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Get a little celebration on these days. They stay in your profile.')}</div>
    <DateRow label={t('Birthday')} value={b} onChange={setB} />
    <DateRow label={t('Special date')} value={sp} onChange={setSp} />
    {sp && <TextField placeholder={t('What is it? e.g. our anniversary')} value={label} onChange={e => setLabel(e.target.value)} maxLength={40} />}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { update(s => { s.fun = { ...(s.fun || {}), birthday: b, special: sp, specialLabel: label.trim() || null } }); close(); toast(t('Saved')) }}>{t('Save')}</Button>
  </>
}
export const personalDatesSheet = () => ui().openSheet(close => <PersonalDates close={close} />)

/* ============================ motivation cards ============================ */
function MotivationManager() {
  const st = useStore(s => s.S)
  const cards = st.motivation || []
  const [text, setText] = useState('')
  const add = c => update(s => { s.motivation = [...(s.motivation || []), { id: uid(), ...c }] })
  const move = (i, dir) => update(s => { const a = s.motivation; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]] })
  const del = c => confirmSheet({
    title: t('Remove this card?'), confirmText: t('Remove'), danger: true,
    onConfirm: () => { update(s => { s.motivation = s.motivation.filter(x => x.id !== c.id) }); if (c.photo) deletePhoto(c.photo) }
  })
  return <>
    <h3>{t('Motivation cards')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Your own photos and lines, shown on Home next to the built-in ones.')}</div>
    {cards.length > 0 && <div className="list" style={{ marginBottom: 12 }}>
      {cards.map((c, i) => <div key={c.id} className="item" style={{ minHeight: 56 }}>
        {c.photo ? <PhotoThumb id={c.photo} size={44} /> : <span className="lrow-i"><Icon name="sparkles" /></span>}
        <div className="grow"><div className="tt" style={{ fontSize: 15 }}>{c.text || t('Photo')}</div></div>
        <button className="iconbtn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Up"><Icon name="chevronUp" /></button>
        <button className="iconbtn sm" disabled={i === cards.length - 1} onClick={() => move(i, 1)} aria-label="Down"><Icon name="chevronDown" /></button>
        <button className="iconbtn sm" style={{ color: 'var(--red)' }} onClick={() => del(c)} aria-label={t('Remove')}><Icon name="trash" /></button>
      </div>)}
    </div>}
    <TextField placeholder={t('A line that keeps you going')} value={text} onChange={e => setText(e.target.value)} maxLength={120} />
    <div style={{ height: 8 }} />
    <div className="grid2">
      <Button icon="plus" disabled={!text.trim()} onClick={() => { add({ text: text.trim() }); setText('') }}>{t('Add text')}</Button>
      <PhotoPicker icon="image" onPicked={id => { add({ photo: id, text: text.trim() || null }); setText('') }}>{t('Add photo')}</PhotoPicker>
    </div>
  </>
}
export const motivationSheet = () => ui().openSheet(() => <MotivationManager />)

/* ============================ motivation settings ============================ */
// Shared by Settings and the Nutrition page's settings section.
export function FunSettings() {
  const st = useStore(s => s.S)
  return <Section title={t('Motivation')} footer={t('Confetti for streaks, little surprises on holidays and your own dates — at most one a day.')}>
    <Row icon="sparkles" iconTint="var(--yellow)" title={t('Surprises & celebrations')}>
      <Switch checked={!(st.fun || {}).off} onChange={v => update(s => { s.fun = { ...(s.fun || {}), off: !v } })} />
    </Row>
    <Row icon="gift" iconTint="var(--pink)" title={t('Your dates')} subtitle={t('Birthday and a special day')} accessory="chevron" onClick={personalDatesSheet} />
    <Row icon="image" iconTint="var(--blue)" title={t('Motivation cards')} value={String((st.motivation || []).length)} accessory="chevron" onClick={motivationSheet} />
  </Section>
}
