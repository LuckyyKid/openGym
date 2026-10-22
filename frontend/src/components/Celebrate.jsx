import { useEffect, useRef } from 'react'
import { useUI } from '../store/useUI.js'

// Full-screen particle burst for surprises and streaks — a canvas over everything that never
// takes a tap (pointer-events: none). Plain shapes in theme colours, no images, no library.
// Skipped entirely when the system asks for reduced motion.
const DUR = 3800
const PAL = {
  confetti: ['--acc', '--blue', '--orange', '--pink', '--yellow', '--purple'],
  hearts: ['--pink', '--red'],
  snow: ['#ffffff', '#dfe9ff'],
  pumpkins: ['--orange'],
  eggs: ['--pink', '--yellow', '--teal', '--purple', '--mint'],
  stars: ['--yellow', '--orange']
}
const css = v => (v.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#fff' : v)

function draw(ctx, kind, p) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.r)
  ctx.fillStyle = p.c
  const s = p.s
  if (kind === 'confetti') ctx.fillRect(-s / 2, -s / 4, s, s / 2)
  else if (kind === 'snow') { ctx.beginPath(); ctx.arc(0, 0, s / 3, 0, 7); ctx.fill() }
  else if (kind === 'hearts') {
    ctx.beginPath(); ctx.moveTo(0, s * 0.35)
    ctx.bezierCurveTo(-s * 0.7, -s * 0.15, -s * 0.3, -s * 0.65, 0, -s * 0.25)
    ctx.bezierCurveTo(s * 0.3, -s * 0.65, s * 0.7, -s * 0.15, 0, s * 0.35); ctx.fill()
  } else if (kind === 'pumpkins') {
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.42, 0, 0, 7); ctx.fill()
    ctx.fillStyle = '#3b7a2a'; ctx.fillRect(-s * 0.06, -s * 0.6, s * 0.12, s * 0.22)
  } else if (kind === 'eggs') { ctx.beginPath(); ctx.ellipse(0, 0, s * 0.32, s * 0.44, 0, 0, 7); ctx.fill() }
  else {   // stars
    ctx.beginPath()
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? s * 0.22 : s * 0.5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) }
    ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

export default function Celebrate() {
  const fx = useUI(s => s.fx)
  const ref = useRef(null)

  useEffect(() => {
    if (!fx) return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { useUI.getState().endFx(fx.n); return }
    const cv = ref.current
    const ctx = cv.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth, H = window.innerHeight
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr)
    const kind = PAL[fx.kind] ? fx.kind : 'confetti'
    const cols = PAL[kind].map(css)
    const falling = kind === 'snow' || kind === 'hearts' || kind === 'pumpkins'
    const n = kind === 'confetti' ? 140 : 60
    const ps = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: falling ? -Math.random() * H : H * 0.35 + Math.random() * 40,
      vx: falling ? (Math.random() - 0.5) * 0.6 : (Math.random() - 0.5) * 9,
      vy: falling ? 1 + Math.random() * 2.2 : -6 - Math.random() * 7,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.2,
      s: kind === 'confetti' ? 9 + Math.random() * 6 : 14 + Math.random() * 14,
      c: cols[Math.floor(Math.random() * cols.length)]
    }))
    const t0 = performance.now()
    let raf
    const tick = now => {
      const el = now - t0
      ctx.clearRect(0, 0, W, H)
      ctx.globalAlpha = el > DUR - 700 ? Math.max(0, (DUR - el) / 700) : 1
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr
        if (!falling) { p.vy += 0.22; p.vx *= 0.99 } else p.x += Math.sin((el + p.s * 90) / 500) * 0.5
        draw(ctx, kind, p)
      }
      if (el < DUR) raf = requestAnimationFrame(tick)
      else useUI.getState().endFx(fx.n)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fx])

  if (!fx) return null
  return <canvas ref={ref} className="fx-layer" aria-hidden="true" />
}
