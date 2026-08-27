import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageCheck } from "lucide-react";

interface CatalogHealthStats {
  total_products: number;
  active_products: number;
  low_stock_products: number;
  total_categories: number;
}

interface CatalogHealthChartProps {
  stats: CatalogHealthStats;
}

export function CatalogHealthChart({ stats }: CatalogHealthChartProps) {
  const hiddenProducts = Math.max(stats.total_products - stats.active_products, 0);
  const activePct =
    stats.total_products > 0
      ? Math.round((stats.active_products / stats.total_products) * 100)
      : 0;
  const hiddenPct =
    stats.total_products > 0 ? Math.round((hiddenProducts / stats.total_products) * 100) : 0;
  const lowStockPct =
    stats.total_products > 0
      ? Math.round((stats.low_stock_products / stats.total_products) * 100)
      : 0;

  const rows = [
    {
      label: "Activos",
      value: stats.active_products,
      pct: activePct,
      className: "bg-emerald-500",
    },
    {
      label: "Ocultos",
      value: hiddenProducts,
      pct: hiddenPct,
      className: "bg-slate-400",
    },
    {
      label: "Stock bajo",
      value: stats.low_stock_products,
      pct: lowStockPct,
      className: "bg-amber-500",
    },
  ];

  return (
    <Card className="h-full shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Salud del catálogo</CardTitle>
          <div className="rounded-full bg-emerald-50 p-2 text-emerald-600">
            <PackageCheck className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-2xl font-bold tabular-nums">{stats.total_products}</p>
            <p className="text-xs text-muted-foreground">productos</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-2xl font-bold tabular-nums">{stats.total_categories}</p>
            <p className="text-xs text-muted-foreground">categorías</p>
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-semibold tabular-nums">
                  {row.value} · {row.pct}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${row.className}`}
                  style={{ width: `${Math.max(row.pct, row.value > 0 ? 8 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
