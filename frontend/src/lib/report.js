// Printable nutrition & activity report for a date range (browser print → Save as PDF),
// built the same way as the plan printout in plan-share.js. Nothing is cut short: full meal
// names, notes, cardio distance/time and the proof photos are all in it.
import { isoOf, fmtDate, fmtNum, fmtL, durPart } from './format.js'
import { t } from './i18n.js'
import { goalsOf, mealsOn, dayTotals, dayLog, workoutsOn, gymOn, runOn, balanceOf } from './nutrition.js'
import { photoData } from './photos.js'

const esc = str => String(str == null ? '' : str)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function daysBetween(from, to) {
  const out = []
  const d = new Date(from + 'T12:00:00'), end = new Date(to + 'T12:00:00')
  while (d <= end) { out.push(isoOf(d)); d.setDate(d.getDate() + 1) }
  return out
}

export async function reportHTML(S, from, to, owner) {
  const g = goalsOf(S)
  const days = daysBetween(from, to)
  const photos = {}
  for (const iso of days) { const id = dayLog(S, iso).photo; if (id) photos[id] = await photoData(id) }

  const tot = days.map(iso => ({ iso, ...dayTotals(S, iso) }))
  const fed = tot.filter(d => d.meals)
  const avg = k => (fed.length ? Math.round(fed.reduce((a, d) => a + d[k], 0) / fed.length) : null)
  const gymN = days.filter(iso => gymOn(S, iso)).length
  const runs = days.filter(iso => runOn(S, iso))
  const km = runs.reduce((a, iso) => a + (+dayLog(S, iso).km || 0), 0)

  const tile = (l, v) => `<div class="tile"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`
  const summary = `<div class="tiles">
    ${tile(t('Days in report'), days.length)}
    ${tile(t('Days with meals'), fed.length)}
    ${tile(t('Avg. calories'), avg('kcal') == null ? '—' : fmtNum(avg('kcal')) + ' kcal')}
    ${tile(t('Avg. protein'), avg('prot') == null ? '—' : fmtNum(avg('prot')) + ' g')}
    ${tile(t('Gym days'), gymN)}
    ${tile(t('Cardio'), runs.length + (km ? ' · ' + fmtNum(km) + ' km' : ''))}
  </div>`

  const dayBlocks = days.slice().reverse().map(iso => {
    const d = tot.find(x => x.iso === iso)
    const log = dayLog(S, iso)
    const ws = workoutsOn(S, iso)
    const ms = mealsOn(S, iso)
    if (!ms.length && !ws.length && !log.gym && !log.run && !log.water && !log.notes) return ''
    const bal = balanceOf(d.kcal, g.kcal)
    const balTxt = !ms.length ? '' : bal.status === 'hit' ? t('on target') : bal.status === 'over' ? t('{0} kcal over', fmtNum(bal.diff)) : t('{0} kcal under', fmtNum(-bal.diff))
    const acts = []
    if (ws.length) acts.push(ws.map(w => esc(w.name) + (durPart(w.end - w.start).length ? ' (' + durPart(w.end - w.start)[0] + ')' : '')).join(', '))
    else if (log.gym) acts.push(esc(t('Gym')))
    if (log.run) acts.push(esc(t('Cardio')) + [log.km ? fmtNum(log.km) + ' km' : '', log.min ? log.min + ' min' : ''].filter(Boolean).map(x => ' · ' + x).join(''))
    const rows = ms.map(m => `<tr><td class="tm">${esc(m.time)}</td><td>${esc(m.name || t('Meal'))}</td><td class="n">${fmtNum(m.kcal || 0)} kcal</td><td class="n">${fmtNum(m.prot || 0)} g</td></tr>`).join('')
    const img = log.photo && photos[log.photo] ? `<img class="ph" src="${photos[log.photo]}" alt="">` : ''
    return `<section class="day">
      <div class="d-head"><h2>${esc(fmtDate(iso, true))}</h2><span class="bal ${bal.status}">${esc(balTxt)}</span></div>
      <div class="facts">
        <span><b>${fmtNum(d.kcal)}</b> / ${fmtNum(g.kcal)} kcal</span>
        <span><b>${fmtNum(d.prot)}</b> / ${fmtNum(g.prot)} g ${esc(t('protein'))}</span>
        <span><b>${fmtL(d.water)}</b> L ${esc(t('water'))}</span>
      </div>
      ${acts.length ? `<div class="acts">${acts.join(' · ')}</div>` : ''}
      ${rows ? `<table>${rows}</table>` : ''}
      ${log.notes ? `<div class="notes">${esc(log.notes)}</div>` : ''}
      ${img}
    </section>`
  }).join('')

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(t('Nutrition & activity report'))}</title>
<style>
  @page { margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #16181d; background: #fff; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-variant-numeric: tabular-nums; }
  .doc { max-width: 720px; margin: 0 auto; }
  header { border-bottom: 2px solid #16181d; padding-bottom: 12px; margin-bottom: 18px; }
  header .kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6a7a3a; font-weight: 700; }
  header h1 { font-size: 27px; letter-spacing: -.02em; margin: 3px 0 0; }
  header .sub { color: #6b7180; font-size: 13px; margin-top: 4px; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 22px; }
  .tile { border: 1px solid #e4e6ec; border-radius: 10px; padding: 9px 12px; }
  .tile .l { font-size: 11px; color: #8a90a0; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
  .tile .v { font-size: 18px; font-weight: 600; }
  .day { break-inside: avoid; page-break-inside: avoid; border: 1px solid #e4e6ec; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; }
  .d-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .d-head h2 { font-size: 16px; margin: 0; text-transform: capitalize; }
  .bal { font-size: 12px; font-weight: 600; }
  .bal.over { color: #c76b00; } .bal.under { color: #0060df; } .bal.hit { color: #248a3d; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 18px; color: #3d424e; font-size: 13px; margin-top: 2px; }
  .acts { margin-top: 6px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  td { padding: 4px 0; border-top: 1px solid #f2f3f6; vertical-align: top; }
  td.tm { width: 52px; color: #8a90a0; } td.n { text-align: right; white-space: nowrap; padding-left: 12px; }
  .notes { margin-top: 8px; padding: 8px 10px; background: #f6f7f9; border-radius: 8px; font-size: 13px; white-space: pre-wrap; }
  .ph { display: block; margin-top: 8px; max-width: 220px; max-height: 220px; border-radius: 8px; object-fit: cover; }
  .none { color: #a2a8b6; }
  footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #eef0f4; color: #a2a8b6; font-size: 11px; text-align: center; }
</style></head>
<body><div class="doc">
  <header>
    <div class="kicker">openGym</div>
    <h1>${esc(t('Nutrition & activity report'))}</h1>
    <div class="sub">${[owner, fmtDate(from) + ' – ' + fmtDate(to)].filter(Boolean).map(esc).join(' · ')}</div>
  </header>
  ${summary}
  ${dayBlocks || `<p class="none">${esc(t('Nothing logged in this period.'))}</p>`}
  <footer>${esc(t('Made with openGym'))}</footer>
</div></body></html>`
}
