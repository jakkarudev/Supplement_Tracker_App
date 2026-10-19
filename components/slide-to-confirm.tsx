"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronsRight } from "lucide-react"

type SlideToConfirmProps = {
  onConfirm: () => void
  label?: string
  confirmedLabel?: string
}

export function SlideToConfirm({
  onConfirm,
  label = "Slide to confirm intake",
  confirmedLabel = "Logged",
}: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [x, setX] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const knobWidth = 44
  const padding = 4

  const maxX = useCallback(() => {
    const track = trackRef.current
    if (!track) return 0
    return track.clientWidth - knobWidth - padding * 2
  }, [])

  const handleMove = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || confirmed) return
      const rect = track.getBoundingClientRect()
      const next = Math.min(Math.max(clientX - rect.left - knobWidth / 2 - padding, 0), maxX())
      setX(next)
    },
    [confirmed, maxX],
  )

  const finish = useCallback(() => {
    if (confirmed) return
    setDragging(false)
    if (x >= maxX() - 6) {
      setConfirmed(true)
      setX(maxX())
      // haptic feedback on supported devices
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(30)
      }
      setTimeout(onConfirm, 320)
    } else {
      setX(0)
    }
  }, [confirmed, x, maxX, onConfirm])

  useEffect(() => {
    if (!dragging) return
    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX)
    const onPointerUp = () => finish()
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [dragging, handleMove, finish])

  const progress = maxX() > 0 ? x / maxX() : 0

  return (
    <div
      ref={trackRef}
      className="relative h-[52px] w-full select-none overflow-hidden rounded-full border border-border bg-secondary"
    >
      {/* Fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary/15 transition-[width] duration-75"
        style={{ width: `${x + knobWidth + padding * 2}px` }}
      />
      {/* Label */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-muted-foreground transition-opacity"
        style={{ opacity: confirmed ? 0 : 1 - progress * 0.9 }}
      >
        {label}
      </div>
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary transition-opacity"
        style={{ opacity: confirmed ? 1 : 0 }}
      >
        {confirmedLabel}
      </div>
      {/* Knob */}
      <button
        type="button"
        aria-label={label}
        onPointerDown={(e) => {
          if (confirmed) return
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          setDragging(true)
        }}
        className="absolute top-1 flex h-11 w-11 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors"
        style={{
          left: `${padding + x}px`,
          transition: dragging ? "none" : "left 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {confirmed ? <Check className="h-5 w-5" /> : <ChevronsRight className="h-5 w-5" />}
      </button>
    </div>
  )
}
