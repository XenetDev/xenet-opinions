'use client'

import { cn } from 'cn'
import { useEffect, useRef } from 'react'

function grain(i: number, j: number) {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return n - Math.floor(n)
}

export function WaveDots({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const GAP = 3
    const DOT = 1.5
    const SPEED = 2.2
    const BASE = 0.05
    const PEAK = 0.42
    const TAU = Math.PI * 2

    ctx.fillStyle = getComputedStyle(canvas).color || 'rgb(115,115,115)'
    ctx.fillRect(0, 0, 1, 1)
    const px = ctx.getImageData(0, 0, 1, 1).data
    const color = `rgb(${px[0]}, ${px[1]}, ${px[2]})`
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let sinPh = new Float32Array(0)
    let cosPh = new Float32Array(0)
    let amp = new Float32Array(0)
    let raf = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(width / GAP) + 1
      rows = Math.ceil(height / GAP) + 1
      sinPh = new Float32Array(cols * rows)
      cosPh = new Float32Array(cols * rows)
      amp = new Float32Array(cols * rows)
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const idx = i * rows + j
          const ph = grain(i, j) * TAU
          sinPh[idx] = Math.sin(ph)
          cosPh[idx] = Math.cos(ph)
          amp[idx] = 0.7 + 0.6 * grain(j * 2 + 1, i * 2 + 1)
        }
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color
      const w = t * SPEED
      const sw = Math.sin(w)
      const cw = Math.cos(w)
      for (let i = 0; i < cols; i++) {
        const x = i * GAP
        for (let j = 0; j < rows; j++) {
          const idx = i * rows + j
          const q = 0.5 + 0.5 * (sw * (cosPh[idx] ?? 0) + cw * (sinPh[idx] ?? 0))
          let a = (BASE + (PEAK - BASE) * q * q) * (amp[idx] ?? 0)
          if (a > 1) a = 1
          ctx.globalAlpha = a
          ctx.fillRect(x, j * GAP, DOT, DOT)
        }
      }
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      draw(now / 1000)
      raf = requestAnimationFrame(frame)
    }

    resize()
    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) draw(2.5)
    })
    ro.observe(canvas)

    if (reduced) draw(2.5)
    else raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
}
