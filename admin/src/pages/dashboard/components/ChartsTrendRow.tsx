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
  salesChartData: { date: string; Ingresos: number; Pedidos: number }[];
}

export function ChartsTrendRow({
  salesChartData,
}: ChartsTrendRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Revenue Trend - Area Chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Tendencia de Ingresos</CardTitle>
              <CardDescription className="mt-0.5">
                Ingresos totales en los últimos 6 meses
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
              data={salesChartData}
              index="date"
              categories={["Ingresos"]}
              colors={["emerald"]}
              valueFormatter={(n: number) =>
                `$${Intl.NumberFormat("es").format(n)}`
              }
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Orders vs Revenue - Combo Chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Pedidos vs Ingresos</CardTitle>
              <CardDescription className="mt-0.5">
                Comparación mensual de pedidos e ingresos
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
              data={salesChartData}
              index="date"
              enableBiaxial={true}
              barSeries={{
                categories: ["Pedidos"],
                yAxisLabel: "Pedidos (Barras)",
                colors: ["emerald"],
              }}
              lineSeries={{
                categories: ["Ingresos"],
                showYAxis: true,
                yAxisLabel: "Ingresos (Línea)",
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
