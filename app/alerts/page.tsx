"use client";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { AlertForm } from "@/components/alerts/AlertForm";
import { AlertList } from "@/components/alerts/AlertList";
import { useAlerts, useCreateAlert, useDeleteAlert, useToggleAlert } from "@/hooks/useAlerts";
import type { AlertFormData } from "@/hooks/useAlerts";

export default function AlertsPage() {
  const { data: alerts = [], isLoading } = useAlerts();
  const createMutation = useCreateAlert(() => toast.success("Alert created"));
  const deleteMutation = useDeleteAlert();
  const toggleMutation = useToggleAlert();

  function handleSubmit(data: AlertFormData) {
    createMutation.mutate(data, {
      onError: () => toast.error("Failed to create alert"),
    });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-zinc-400 text-sm mt-1">Get notified when songs hit your thresholds</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <AlertForm onSubmit={handleSubmit} isLoading={createMutation.isPending} />
          </div>
          <div className="lg:col-span-2">
            <AlertList
              alerts={alerts}
              isLoading={isLoading}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
