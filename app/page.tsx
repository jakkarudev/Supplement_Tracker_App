"use client"

import { useState } from "react"
import { CalendarCheck, Plus, BarChart3, Boxes, Leaf } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { ThemeToggle } from "@/components/theme-toggle"
import { TodayRoutine } from "@/components/today-routine"
import { SupplementForm } from "@/components/supplement-form"
import { BiomarkerDashboard } from "@/components/biomarker-dashboard"
import { InventoryHub } from "@/components/inventory-hub"
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
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleTabChange(id: TabId) {
    if (id !== "add") setEditingId(null)
    setTab(id)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  function handleEdit(id: string) {
    setEditingId(id)
    setTab("add")
  }

  return (
    <main className="relative min-h-screen bg-background">
      {/* ambient backdrop accents (subtle, behind glass) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-3 pb-mobile-nav pt-3 sm:px-6 sm:pb-28 sm:pt-5">
        {/* Header */}
        <header className="glass sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 mb-4 flex items-center justify-between rounded-2xl px-3 py-2.5 sm:mb-6 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Regimen</p>
              <p className="text-xs text-muted-foreground">Supplement Tracker</p>
            </div>
          </div>
          <ThemeToggle />
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
        <div className="flex-1">
          {tab === "today" && <TodayRoutine />}
          {tab === "add" && (
            <SupplementForm
              editingId={editingId}
              onDone={() => {
                setEditingId(null)
                setTab("today")
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
