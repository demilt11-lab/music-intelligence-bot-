import { db } from "@/lib/db";

export interface AlertInput {
  artistId: number;
  alertType: "viral_threshold" | "spike_detected" | "forecast_change" | "risk_elevated";
  severity: "high" | "medium" | "low";
  threshold?: number;
  actualValue?: number;
  message: string;
}

/**
 * For each watchlist entry on this artist, create an Alert + in_app Notification
 * if the artist's current signal crosses a monitored threshold.
 */
export async function fireAlertsForArtist(input: AlertInput): Promise<number> {
  const watchers = await db.watchlist.findMany({
    where: { artistId: input.artistId },
    select: { id: true, userId: true },
  });

  if (watchers.length === 0) return 0;

  let fired = 0;
  for (const watcher of watchers) {
    const alert = await db.alert.create({
      data: {
        userId: watcher.userId,
        watchlistId: watcher.id,
        artistId: input.artistId,
        alertType: input.alertType,
        severity: input.severity,
        threshold: input.threshold,
        actualValue: input.actualValue,
        message: input.message,
        read: false,
      },
    });

    await db.notification.create({
      data: {
        userId: watcher.userId,
        alertId: alert.id,
        channel: "in_app",
        status: "sent",
        sentAt: new Date(),
      },
    });

    fired++;
  }

  return fired;
}

/**
 * Check a viral probability score against watchlist thresholds and fire alerts.
 * Fires when viralProb crosses above 0.6 (high) or 0.4 (medium).
 */
export async function checkAndFireViralAlert(
  artistId: number,
  viralProb: number
): Promise<void> {
  if (viralProb >= 0.6) {
    await fireAlertsForArtist({
      artistId,
      alertType: "viral_threshold",
      severity: "high",
      threshold: 0.6,
      actualValue: viralProb,
      message: `Viral probability reached ${(viralProb * 100).toFixed(1)}% — strong breakout signal detected.`,
    });
  } else if (viralProb >= 0.4) {
    await fireAlertsForArtist({
      artistId,
      alertType: "viral_threshold",
      severity: "medium",
      threshold: 0.4,
      actualValue: viralProb,
      message: `Viral probability at ${(viralProb * 100).toFixed(1)}% — emerging signal worth monitoring.`,
    });
  }
}
