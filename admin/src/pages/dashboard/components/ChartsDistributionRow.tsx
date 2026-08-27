import { lazy, Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DonutChart = lazy(() =>
  import("../../../components/DonutChart").then((m) => ({
    default: m.DonutChart,
  })),
);

function ChartFallback() {
  return (
    <div className="h-80 flex items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Cargando gráfico...
      </div>
    </div>
  );
}

interface AccountStatus {
  status: string;
  label: string;
  count: number;
}

interface ChartsDistributionRowProps {
  roleChartData: { name: string; value: number }[];
  statusChartData: { name: string; value: number }[];
  accountStatuses: AccountStatus[];
  totalUsers: number;
  totalRoles: number;
}

export function ChartsDistributionRow({
  roleChartData,
  statusChartData,
  accountStatuses,
  totalUsers,
  totalRoles,
}: ChartsDistributionRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Role Distribution Donut */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Distribución por Rol</CardTitle>
          <CardDescription>Segmentación actual de usuarios</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ChartFallback />}>
            <DonutChart
              data={roleChartData}
              category="name"
              value="value"
              colors={["teal", "emerald", "violet", "amber"]}
              valueFormatter={(v: number) => `${v} usuarios`}
            />
          </Suspense>
        </CardContent>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {totalUsers} usuarios en {totalRoles} roles
          </div>
          <div className="text-muted-foreground">
            Distribución equilibrada del sistema
          </div>
        </CardFooter>
      </Card>

      {/* Account Status Summary */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Estado de Cuentas</CardTitle>
          <CardDescription>
            Distribución por estado de verificación
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Status bars */}
          <div className="space-y-5 mb-6">
            {accountStatuses.map((status) => {
              const pct =
                totalUsers > 0
                  ? ((status.count / totalUsers) * 100).toFixed(1)
                  : "0";
              const barColor =
                status.status === "verified"
                  ? "bg-emerald-500"
                  : status.status === "unverified"
                    ? "bg-amber-500"
                    : "bg-red-500";
              const textColor =
                status.status === "verified"
                  ? "text-emerald-600"
                  : status.status === "unverified"
                    ? "text-amber-600"
                    : "text-red-600";

              return (
                <div key={status.status} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {status.label}
                      </span>
                      <Badge variant="outline" className={`gap-1 ${textColor}`}>
                        {status.count}
                      </Badge>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Donut for statuses */}
          <Suspense fallback={<ChartFallback />}>
            <DonutChart
              data={statusChartData}
              category="name"
              value="value"
              colors={["emerald", "amber", "pink"]}
              valueFormatter={(v: number) => `${v} cuentas`}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
