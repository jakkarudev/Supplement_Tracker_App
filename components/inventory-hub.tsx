"use client"

import { ExternalLink, Pencil, Pill, ShoppingCart, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAppDispatch, useInventory } from "@/lib/app-context"
import { inventoryUnitLabel } from "@/lib/dosage"
import type { InventoryRow } from "@/lib/inventory"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}

type Props = {
  onEdit?: (id: string) => void
}

const GROUPS: { state: InventoryRow["courseState"]; label: string }[] = [
  { state: "current", label: "Current" },
  { state: "upcoming", label: "Upcoming" },
  { state: "finished", label: "Finished" },
]

export function InventoryHub({ onEdit }: Props) {
  const { rows, summary } = useInventory()
  const showGroupHeadings = summary.upcoming > 0 || summary.finished > 0
  const restockVerb = summary.lowStock === 1 ? "needs restocking" : "need restocking"

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.current} current · {summary.lowStock} {restockVerb}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {GROUPS.map(({ state, label }) => {
          const groupRows = rows.filter((row) => row.courseState === state)
          if (groupRows.length === 0) return null

          return (
            <section key={state} className="space-y-3">
              {showGroupHeadings && (
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label} · {groupRows.length}
                </h3>
              )}
              {groupRows.map((row) => (
                <InventoryItem key={row.supplement.id} row={row} onEdit={onEdit} />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function InventoryItem({
  row,
  onEdit,
}: {
  row: InventoryRow
  onEdit?: (id: string) => void
}) {
  const dispatch = useAppDispatch()
  const isMobile = useIsMobile()
  const { supplement, courseState, percent, lowStock, overdrawn } = row
  const needsAttention = lowStock || overdrawn
  const unit = inventoryUnitLabel(supplement.form, supplement.totalCount)

  function handleDelete() {
    dispatch({ type: "DELETE_SUPPLEMENT", payload: supplement.id })
    toast.success(`${supplement.name} removed`)
  }

  return (
    <div
      className={cn(
        "glass rounded-[1.25rem] p-4 transition-all sm:rounded-3xl sm:p-5",
        needsAttention && "ring-1 ring-destructive/30",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            needsAttention ? "bg-destructive/12 text-destructive" : "bg-secondary text-foreground",
          )}
        >
          <Pill className="h-5.5 w-5.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-tight">{supplement.name}</h3>
              {overdrawn ? (
                <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-destructive">
                  Overdrawn
                </span>
              ) : lowStock ? (
                <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-destructive">
                  Low stock
                </span>
              ) : courseState !== "current" ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                  {courseState === "upcoming" ? "Upcoming" : "Finished"}
                </span>
              ) : null}
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onEdit?.(supplement.id)}
                aria-label={`Edit ${supplement.name}`}
                title="Edit"
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground sm:h-8 sm:w-8"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {isMobile ? (
                <Drawer>
                  <DrawerTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Delete ${supplement.name}`}
                      title="Delete"
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>Remove {supplement.name}?</DrawerTitle>
                      <DrawerDescription>
                        This will permanently delete this supplement and all its dose history.
                      </DrawerDescription>
                    </DrawerHeader>
                    <DrawerFooter>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        className="w-full"
                      >
                        Delete
                      </Button>
                      <DrawerClose asChild>
                        <Button variant="outline" className="w-full">Cancel</Button>
                      </DrawerClose>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Delete ${supplement.name}`}
                      title="Delete"
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {supplement.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this supplement and all its dose history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {supplement.brand} · {supplement.potency}
          </p>

          {/* Progress */}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  needsAttention ? "bg-destructive" : percent < 50 ? "bg-accent" : "bg-primary",
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {supplement.currentCount} / {supplement.totalCount} {unit}
            </span>
          </div>
        </div>
      </div>

      {(lowStock || supplement.purchaseUrl) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {supplement.purchaseUrl ? (
            <RestockButton
              name={supplement.name}
              href={supplement.purchaseUrl}
              primary={lowStock}
            />
          ) : (
            <button
              type="button"
              onClick={() => onEdit?.(supplement.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground transition-all hover:border-primary/40 hover:text-primary active:scale-[0.98]"
            >
              <ShoppingCart className="h-4 w-4" />
              Add purchase link
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function RestockButton({
  name,
  href,
  primary,
}: {
  name: string
  href: string
  primary?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        toast.success("Opening purchase link", {
          description: `Restocking ${name}.`,
        })
      }
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98]",
        primary
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      <ShoppingCart className="h-4 w-4" />
      Restock
      <ExternalLink className="h-3.5 w-3.5 opacity-70" />
    </a>
  )
}
