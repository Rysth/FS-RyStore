import { useEffect, useMemo } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { Skeleton } from "@/components/ui/skeleton";
import { WelcomeBanner } from "./components/WelcomeBanner";
import { StatsCards } from "./components/StatsCards";
import { ChartsTrendRow } from "./components/ChartsTrendRow";
import { ActivityFeed, type Activity } from "./components/ActivityFeed";
import { StatusDistribution } from "./components/StatusDistribution";
import { RecentOrdersList } from "./components/RecentOrdersList";
import { CatalogHealthChart } from "./components/CatalogHealthChart";

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
    orderStatuses,
    salesTrend,
    recentOrders,
    isLoading,
    error,
    fetchDashboard,
  } = useDashboardStore();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const salesChartData = useMemo(
    () =>
      (salesTrend ?? []).map((t) => ({
        date: t.date,
        Ingresos: Number(t.revenue),
        Pedidos: t.orders,
      })),
    [salesTrend],
  );

  const activities: Activity[] = useMemo(() => {
    return (recentOrders ?? []).slice(0, 4).map((o) => {
      if (o.status === "entregado") {
        return {
          id: `act-del-${o.id}`,
          type: "delivered" as const,
          title: "Pedido entregado",
          description: `${o.number} de ${o.customer_name}`,
          time: timeAgo(o.created_at),
        };
      }
      if (o.status === "cancelado") {
        return {
          id: `act-can-${o.id}`,
          type: "cancelled" as const,
          title: "Pedido cancelado",
          description: `${o.number} de ${o.customer_name}`,
          time: timeAgo(o.created_at),
        };
      }
      return {
        id: `act-new-${o.id}`,
        type: "new_order" as const,
        title: "Nuevo pedido recibido",
        description: `${o.number} de ${o.customer_name}`,
        time: timeAgo(o.created_at),
      };
    });
  }, [recentOrders]);

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

      <ChartsTrendRow salesChartData={salesChartData} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityFeed activities={activities} />
        <StatusDistribution
          total={stats.total_orders}
          statuses={orderStatuses ?? []}
        />
        <CatalogHealthChart stats={stats} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersList orders={recentOrders ?? []} timeAgo={timeAgo} />
        </div>
      </div>
    </div>
  );
}
