import { lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DonutChart = lazy(() =>
  import("../../../components/DonutChart").then((m) => ({
    default: m.DonutChart,
  })),
);

function ChartFallback() {
  return (
    <div className="h-48 flex items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Cargando gráfico...
      </div>
    </div>
  );
}

interface StatusItem {
  status: string;
  label: string;
  count: number;
}

interface StatusDistributionProps {
  data: { name: string; value: number }[];
  total: number;
  statuses: StatusItem[];
}

const statusColorDot: Record<string, string> = {
  verified: "bg-emerald-500",
  unverified: "bg-amber-500",
  closed: "bg-pink-500",
};

export function StatusDistribution({
  data,
  total,
  statuses,
}: StatusDistributionProps) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Distribución por estado</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Suspense fallback={<ChartFallback />}>
              <DonutChart
                data={data}
                category="name"
                value="value"
                colors={["emerald", "amber", "pink"]}
                className="h-48"
              />
            </Suspense>
            {/* Center total label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-2xl font-bold tabular-nums">{total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 min-w-[140px]">
            {statuses.map((s) => {
              const pct =
                total > 0 ? ((s.count / total) * 100).toFixed(0) : "0";
              return (
                <div key={s.status} className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${statusColorDot[s.status] ?? "bg-gray-400"}`}
                  />
                  <span className="text-sm text-muted-foreground flex-1">
                    {s.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {s.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
