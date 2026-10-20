"use client"

import { useCallback, useRef, useState } from "react"
import { CalendarCheck, Plus, BarChart3, Boxes, Leaf } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { ThemeToggle } from "@/components/theme-toggle"
import { TimeFormatToggle } from "@/components/time-format-toggle"
import { TodayRoutine } from "@/components/today-routine"
import { SupplementForm } from "@/components/supplement-form"
import { BiomarkerDashboard } from "@/components/biomarker-dashboard"
import { InventoryHub } from "@/components/inventory-hub"
import { today, type CalendarDate } from "@/lib/day-regimen"
import { cn } from "@/lib/utils"

type TabId = "today" | "add" | "dashboard" | "inventory"

const TABS: { id: TabId; label: string; short: string; icon: typeof CalendarCheck }[] = [
  { id: "today", label: "Today", short: "Today", icon: CalendarCheck },
  { id: "add", label: "Add Supplement", short: "Add", icon: Plus },
  { id: "dashboard", label: "Wellness Margin", short: "Stats", icon: BarChart3 },
  { id: "inventory", label: "Inventory", short: "Stock", icon: Boxes },
]

export default function Page() {
  const [tab, setTab] = useState<TabId>("today")
  // Ephemeral browsing state: survives tab switches but is never persisted.
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(today)
  const [editingId, setEditingId] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const scrollContentBelowHeader = useCallback(() => {
    const contentEl = contentRef.current
    const headerEl = headerRef.current
    if (!contentEl || !headerEl) return

    const gap = 8
    const headerRect = headerEl.getBoundingClientRect()
    const contentRect = contentEl.getBoundingClientRect()

    // Align content top to exactly below the sticky header's visible bottom.
    const delta = contentRect.top - (headerRect.bottom + gap)
    if (Math.abs(delta) < 1) return
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: "auto" })
  }, [])

  const setTabAndAlign = useCallback((id: TabId) => {
    setTab(id)
    // On Android WebView, layout can settle a frame later after tab switch.
    requestAnimationFrame(() => {
      scrollContentBelowHeader()
      requestAnimationFrame(() => {
        scrollContentBelowHeader()
      })
    })
  }, [scrollContentBelowHeader])

  function handleTabChange(id: TabId) {
    if (id !== "add") setEditingId(null)
    setTabAndAlign(id)
  }

  function handleEdit(id: string) {
    setEditingId(id)
    setTabAndAlign("add")
  }

  return (
    <main className="relative min-h-screen bg-background">
      {/* ambient backdrop accents (subtle, behind glass) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="pt-app-safe-top relative mx-auto flex min-h-screen max-w-3xl flex-col px-3 pb-mobile-nav sm:px-6 sm:pb-28">
        {/* Header */}
        <header
          ref={headerRef}
          className="glass sticky top-[max(0.5rem,var(--app-safe-top))] z-30 mb-4 flex items-center justify-between rounded-2xl px-3 py-2.5 sm:mb-6 sm:px-4 sm:py-3"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold tracking-tight">Regimen</p>
              <p className="truncate text-xs text-muted-foreground">
                Supplement Tracker
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TimeFormatToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Desktop / tablet tab bar */}
        <nav className="mb-6 hidden sm:block">
          <div className="glass flex gap-1 rounded-2xl p-1.5">
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTabChange(t.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <div ref={contentRef} className="scroll-mt-app-header flex-1 pt-1 sm:pt-0">
          {tab === "today" && (
            <TodayRoutine date={selectedDate} onSelectDate={setSelectedDate} />
          )}
          {tab === "add" && (
            <SupplementForm
              editingId={editingId}
              onDone={() => {
                setEditingId(null)
                setTabAndAlign("today")
              }}
            />
          )}
          {tab === "dashboard" && <BiomarkerDashboard />}
          {tab === "inventory" && <InventoryHub onEdit={handleEdit} />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="glass-strong safe-bottom fixed inset-x-2 bottom-0 z-40 flex items-center justify-around rounded-t-2xl px-2 pt-2 sm:hidden">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/70",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary/12" : "",
                )}
              >
                <t.icon className="h-5 w-5" />
              </span>
              {t.short}
            </button>
          )
        })}
      </nav>

      <Toaster position="top-center" />
    </main>
  )
}
