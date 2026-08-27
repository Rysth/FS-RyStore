import { lazy, Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

const AreaChart = lazy(() =>
  import("../../../components/AreaChart").then((m) => ({
    default: m.AreaChart,
  })),
);
const ComboChart = lazy(() =>
  import("../../../components/ComboChart").then((m) => ({
    default: m.ComboChart,
  })),
);

function ChartFallback() {
  return (
    <div className="h-72 flex items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Cargando gráfico...
      </div>
    </div>
  );
}

interface ChartsTrendRowProps {
  trendChartData: { date: string; Total: number; Verificados: number }[];
}

export function ChartsTrendRow({
  trendChartData,
}: ChartsTrendRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Registration Trend - Area Chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Tendencia de Registros</CardTitle>
              <CardDescription className="mt-0.5">
                Total de registros en los últimos 6 meses
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Últimos 6 meses
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <Suspense fallback={<ChartFallback />}>
            <AreaChart
              className="h-72"
              data={trendChartData}
              index="date"
              categories={["Total"]}
              colors={["emerald"]}
              valueFormatter={(n: number) => Intl.NumberFormat("es").format(n)}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Registration vs Verifications - Combo Chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Registros vs Verificaciones</CardTitle>
              <CardDescription className="mt-0.5">
                Comparación mensual de registros y verificaciones
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Últimos 6 meses
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <Suspense fallback={<ChartFallback />}>
            <ComboChart
              data={trendChartData}
              index="date"
              enableBiaxial={true}
              barSeries={{
                categories: ["Total"],
                yAxisLabel: "Total (Barras)",
                colors: ["emerald"],
              }}
              lineSeries={{
                categories: ["Verificados"],
                showYAxis: true,
                yAxisLabel: "Verificados (Línea)",
                colors: ["teal"],
                yAxisWidth: 50,
              }}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
