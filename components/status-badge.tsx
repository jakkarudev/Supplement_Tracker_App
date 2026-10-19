import { Check, Clock, Moon } from "lucide-react"
import type { DoseStatus } from "@/lib/supplements-data"
import { cn } from "@/lib/utils"

const config: Record<
  DoseStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  taken: {
    label: "Taken",
    className: "bg-primary/12 text-primary border-primary/20",
    Icon: Check,
  },
  pending: {
    label: "Pending",
    className: "bg-accent/15 text-accent-foreground border-accent/30 dark:text-accent",
    Icon: Clock,
  },
  snoozed: {
    label: "Snoozed",
    className: "bg-muted text-muted-foreground border-border",
    Icon: Moon,
  },
}

export function StatusBadge({ status }: { status: DoseStatus }) {
  const { label, className, Icon } = config[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
