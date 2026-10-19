export type AdherenceSummary = {
  adherenceRate: number
  streak: number
}

/**
 * Summarizes a window of daily adherence rates ("null" = nothing scheduled)
 * whose last entry is today. The rate averages completed days only: every
 * non-null past day counts, and today counts only when it is exactly 100%.
 * The streak walks backward from yesterday; null days neither break nor
 * extend it, and a complete today adds one more day.
 */
export function summarizeAdherence(
  dailyRates: (number | null)[],
): AdherenceSummary {
  const todayRate = dailyRates[dailyRates.length - 1] ?? null
  const completedRates = dailyRates
    .slice(0, -1)
    .filter((rate): rate is number => rate !== null)
  if (todayRate === 100) completedRates.push(todayRate)

  const adherenceRate =
    completedRates.length > 0
      ? Math.round(
          completedRates.reduce((sum, rate) => sum + rate, 0) /
            completedRates.length,
        )
      : 0

  let streak = 0
  for (let i = dailyRates.length - 2; i >= 0; i--) {
    const rate = dailyRates[i]
    if (rate === 100) streak++
    else if (rate !== null) break
  }
  if (todayRate === 100) streak++

  return { adherenceRate, streak }
}
