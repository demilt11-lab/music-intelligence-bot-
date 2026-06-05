"use client";
import { AppShell } from "@/components/layout/AppShell";
import { MonitorDashboard } from "@/components/monitor/MonitorDashboard";

export default function MonitorPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Monitor</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Continuous learning health — accuracy trends, drift alerts, retraining history
          </p>
        </div>
        <MonitorDashboard />
      </div>
    </AppShell>
  );
}
