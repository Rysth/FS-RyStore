import { StatsCard } from "@/components/ui/stats-card";
import { formatPrice } from "@/types/store";
import { DollarSign, ShoppingCart, Receipt, Package } from "lucide-react";

interface Stats {
  total_orders: number;
  pending_orders: number;
  orders_today: number;
  orders_this_week: number;
  orders_this_month: number;
  total_revenue: string;
  revenue_this_month: string;
  growth_percentage: number;
  average_order_value: string;
  total_products: number;
  active_products: number;
  low_stock_products: number;
  total_categories: number;
}

interface StatsCardsProps {
  stats: Stats;
  formatNumber: (n: number) => string;
}

export function StatsCards({ stats, formatNumber }: StatsCardsProps) {
  const growthPositive = stats.growth_percentage >= 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Ingresos del Mes"
        value={formatPrice(stats.revenue_this_month)}
        icon={DollarSign}
        iconColor="text-teal-600"
        iconBgColor="bg-teal-50"
        variant="colored"
        trend={{
          value: `${growthPositive ? "+" : ""}${stats.growth_percentage}%`,
          isPositive: growthPositive,
          label: "vs. mes anterior",
        }}
        description={`${stats.orders_this_month} pedidos este mes`}
      />

      <StatsCard
        title="Pedidos Totales"
        value={formatNumber(stats.total_orders)}
        icon={ShoppingCart}
        iconColor="text-emerald-600"
        iconBgColor="bg-emerald-50"
        variant="colored"
        trend={{
          value: `${stats.pending_orders} pendientes`,
          isPositive: stats.pending_orders === 0,
          label: "",
        }}
        description={`${stats.orders_today} hoy · ${stats.orders_this_week} esta semana`}
      />

      <StatsCard
        title="Ticket Promedio"
        value={formatPrice(stats.average_order_value)}
        icon={Receipt}
        iconColor="text-amber-600"
        iconBgColor="bg-amber-50"
        variant="colored"
        trend={{
          value: formatPrice(stats.total_revenue),
          isPositive: true,
          label: "ingresos totales",
        }}
        description="Por pedido no cancelado"
      />

      <StatsCard
        title="Catálogo"
        value={formatNumber(stats.total_products)}
        icon={Package}
        iconColor="text-violet-600"
        iconBgColor="bg-violet-50"
        variant="colored"
        trend={{
          value: `${stats.low_stock_products} con stock bajo`,
          isPositive: stats.low_stock_products === 0,
          label: "",
        }}
        description={`${stats.total_categories} categorías · ${stats.active_products} activos`}
      />
    </div>
  );
}
