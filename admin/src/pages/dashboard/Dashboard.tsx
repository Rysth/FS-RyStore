import { useEffect, useMemo } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { Skeleton } from "@/components/ui/skeleton";
import { WelcomeBanner } from "./components/WelcomeBanner";
import { StatsCards } from "./components/StatsCards";
import { ChartsTrendRow } from "./components/ChartsTrendRow";
import { ActivityFeed, type Activity } from "./components/ActivityFeed";
import { StatusDistribution } from "./components/StatusDistribution";
import { RecentUsersList } from "./components/RecentUsersList";

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Justo ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

// ── Skeleton Loader ──────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {["skel-users", "skel-verified", "skel-rate", "skel-today"].map(
          (id) => (
            <Skeleton key={id} className="h-36 rounded-xl" />
          ),
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore();
  const {
    stats,
    accountStatuses,
    registrationTrend,
    recentUsers,
    isLoading,
    error,
    fetchDashboard,
  } = useDashboardStore();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const trendChartData = useMemo(
    () =>
      (registrationTrend ?? []).map((t) => ({
        date: t.date,
        Total: t.total,
        Verificados: t.verified,
      })),
    [registrationTrend],
  );

  const statusChartData = useMemo(
    () =>
      (accountStatuses ?? []).map((s) => ({
        name: s.label,
        value: s.count,
      })),
    [accountStatuses],
  );

  const activities: Activity[] = useMemo(() => {
    const items: Activity[] = [];
    (recentUsers ?? []).slice(0, 3).forEach((u) => {
      if (u.verified) {
        items.push({
          id: `act-ver-${u.id}`,
          type: "verification",
          title: "Usuario verificado",
          description: `${u.fullname} fue verificada`,
          time: timeAgo(u.created_at),
        });
      } else {
        items.push({
          id: `act-reg-${u.id}`,
          type: "registration",
          title: "Nuevo usuario registrado",
          description: `${u.fullname} se registró en el sistema`,
          time: timeAgo(u.created_at),
        });
      }
    });
    // Add a generic system activity at the end
    if (items.length > 0) {
      items.push({
        id: "act-sys-1",
        type: "system",
        title: "Nuevo registro creado",
        description: "Se creó un nuevo registro en el sistema",
        time: "Hace 2h",
      });
    }
    return items;
  }, [recentUsers]);

  if (isLoading && !stats) return <DashboardSkeleton />;

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-destructive text-lg font-semibold">
          Error al cargar el dashboard
        </div>
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          onClick={fetchDashboard}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <WelcomeBanner fullname={user?.fullname} />

      <StatsCards stats={stats} formatNumber={(n) => n.toLocaleString("es")} />

      <ChartsTrendRow trendChartData={trendChartData} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityFeed activities={activities} />
        <StatusDistribution
          data={statusChartData}
          total={stats.total_users}
          statuses={accountStatuses ?? []}
        />
        <RecentUsersList users={recentUsers ?? []} timeAgo={timeAgo} />
      </div>
    </div>
  );
}
