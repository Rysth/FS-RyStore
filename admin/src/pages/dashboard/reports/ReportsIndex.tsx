import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  Banknote,
  CalendarDays,
  Download,
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCard } from "@/components/ui/stats-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "../../../components/common/PageHeader";
import {
  TableEmptyRow,
  TableLoadingRow,
} from "../../../components/common/TableStates";
import {
  useReportStore,
  type CustomerReportRow,
  type DateRange,
} from "../../../stores/reportStore";
import { formatPrice } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

const AreaChart = lazy(() =>
  import("../../../components/AreaChart").then((module) => ({
    default: module.AreaChart,
  })),
);
const ComboChart = lazy(() =>
  import("../../../components/ComboChart").then((module) => ({
    default: module.ComboChart,
  })),
);
const DonutChart = lazy(() =>
  import("../../../components/DonutChart").then((module) => ({
    default: module.DonutChart,
  })),
);
const RankingChart = lazy(() =>
  import("./components/RankingChart").then((module) => ({
    default: module.RankingChart,
  })),
);

const RANGE_PRESETS = [
  { id: "7d", label: "7 días", range: () => dateRangeFromToday(7) },
  { id: "30d", label: "30 días", range: () => dateRangeFromToday(30) },
  { id: "90d", label: "90 días", range: () => dateRangeFromToday(90) },
  { id: "month", label: "Este mes", range: monthToDateRange },
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateRangeFromToday(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: isoDate(from), to: isoDate(to) };
}

function monthToDateRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function formatDateLabel(value?: string): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function compactMoney(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${Intl.NumberFormat("es", {
      maximumFractionDigits: 1,
      notation: "compact",
    }).format(value)}`;
  }
  return `$${Intl.NumberFormat("es", { maximumFractionDigits: 0 }).format(value)}`;
}

function customerLabel(row: CustomerReportRow): string {
  return row.name || row.phone || `Cliente #${row.customer_id}`;
}

export default function ReportsIndex() {
  const {
    sales,
    salesSummary,
    products,
    customers,
    coupons,
    isLoading,
    fetchSalesReport,
    fetchProductsReport,
    fetchCustomersReport,
    fetchCouponsReport,
    exportReport,
  } = useReportStore();

  const [range, setRange] = useState<DateRange>(() => dateRangeFromToday(30));
  const [activePreset, setActivePreset] = useState<string | null>("30d");
  const [tab, setTab] = useState("sales");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const load = {
      sales: fetchSalesReport,
      products: fetchProductsReport,
      customers: fetchCustomersReport,
      coupons: fetchCouponsReport,
    }[tab];

    load?.(range).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  }, [tab, range, fetchSalesReport, fetchProductsReport, fetchCustomersReport, fetchCouponsReport]);

  const salesChartData = useMemo(
    () =>
      sales.map((row) => ({
        date: formatDateLabel(row.date),
        Ingresos: Number(row.revenue),
        Pedidos: row.orders,
      })),
    [sales],
  );

  const productRanking = useMemo(
    () =>
      products
        .map((row) => ({ name: row.product_name, value: Number(row.revenue) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [products],
  );

  const productShare = useMemo(() => {
    const sortedProducts = products
      .map((row) => ({ name: row.product_name, value: Number(row.revenue) }))
      .sort((a, b) => b.value - a.value);
    const topProducts = sortedProducts.slice(0, 6);
    const remaining = sortedProducts
      .slice(6)
      .reduce((total, row) => total + row.value, 0);

    return remaining > 0
      ? [...topProducts, { name: "Otros", value: remaining }]
      : topProducts;
  }, [products]);

  const customerRanking = useMemo(
    () =>
      customers
        .map((row) => ({ name: customerLabel(row), value: Number(row.total_spent) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [customers],
  );

  const couponDiscountRanking = useMemo(
    () =>
      coupons
        .map((row) => ({ name: row.code || "Sin código", value: Number(row.total_discount) }))
        .sort((a, b) => b.value - a.value),
    [coupons],
  );

  const couponUsesShare = useMemo(
    () =>
      coupons
        .map((row) => ({ name: row.code || "Sin código", value: row.uses }))
        .sort((a, b) => b.value - a.value),
    [coupons],
  );

  const rangeLabel = `${formatDateLabel(range.from)} - ${formatDateLabel(range.to)}`;
  const activeSalesDays = sales.filter((row) => row.orders > 0).length;

  const handlePreset = (presetId: string) => {
    const preset = RANGE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    setActivePreset(preset.id);
    setRange(preset.range());
  };

  const handleDateChange = (field: keyof DateRange, value: string) => {
    setActivePreset(null);
    setRange((prev) => ({ ...prev, [field]: value }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportReport(tab as "sales" | "products" | "customers" | "coupons", range);
    } catch (error) {
      toast.error(errorMessage(error, "Error al exportar el reporte"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Ventas, productos, clientes y cupones en el rango de fechas que elijas."
        actions={
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Exportar CSV
          </Button>
        }
      />

      <Card className="overflow-hidden rounded-xl">
        <CardContent className="flex flex-col gap-5 pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Label>Rango rápido</Label>
            <div className="flex flex-wrap gap-2">
              {RANGE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant={activePreset === preset.id ? "default" : "outline"}
                  onClick={() => handlePreset(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-from">Desde</Label>
              <Input
                id="report-from"
                type="date"
                value={range.from}
                onChange={(event) => handleDateChange("from", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to">Hasta</Label>
              <Input
                id="report-to"
                type="date"
                value={range.to}
                onChange={(event) => handleDateChange("to", event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl p-1 md:grid-cols-4">
          <TabsTrigger value="sales">Ventas</TabsTrigger>
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="coupons">Cupones</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 pt-4">
          {salesSummary && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatsCard
                title="Pedidos"
                value={salesSummary.orders.toLocaleString("es")}
                description="en el período seleccionado"
                icon={ShoppingCart}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-500/10"
              />
              <StatsCard
                title="Ingresos"
                value={formatPrice(salesSummary.revenue)}
                description="ventas acumuladas del rango"
                icon={Banknote}
                iconColor="text-emerald-600"
                iconBgColor="bg-emerald-500/10"
              />
              <StatsCard
                title="Ticket promedio"
                value={formatPrice(salesSummary.average_order_value)}
                description="ingresos divididos entre pedidos"
                icon={Receipt}
                iconColor="text-violet-600"
                iconBgColor="bg-violet-500/10"
              />
              <StatsCard
                title="Días activos"
                value={activeSalesDays.toLocaleString("es")}
                description="días con al menos un pedido"
                icon={CalendarDays}
                iconColor="text-amber-600"
                iconBgColor="bg-amber-500/10"
              />
            </div>
          )}

          <ChartGridState isLoading={isLoading} hasData={sales.length > 0}>
            <ReportChartCard
              title="Tendencia de ingresos"
              description="Ingresos diarios dentro del rango seleccionado."
              badge={rangeLabel}
            >
              <Suspense fallback={<ChartFallback />}>
                <AreaChart
                  className="h-72"
                  data={salesChartData}
                  index="date"
                  categories={["Ingresos"]}
                  colors={["emerald"]}
                  valueFormatter={compactMoney}
                />
              </Suspense>
            </ReportChartCard>
            <ReportChartCard
              title="Pedidos vs ingresos"
              description="Compara volumen de pedidos contra ingresos generados."
              badge={`${sales.length} días`}
            >
              <Suspense fallback={<ChartFallback />}>
                <ComboChart
                  className="h-72"
                  data={salesChartData}
                  index="date"
                  enableBiaxial
                  barSeries={{ categories: ["Pedidos"], colors: ["blue"] }}
                  lineSeries={{
                    categories: ["Ingresos"],
                    colors: ["emerald"],
                    showYAxis: true,
                    yAxisWidth: 56,
                  }}
                />
              </Suspense>
            </ReportChartCard>
          </ChartGridState>

          <SalesTable sales={sales} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="products" className="space-y-4 pt-4">
          <ChartGridState isLoading={isLoading} hasData={products.length > 0} wideLeft>
            <ReportChartCard
              title="Top productos por ingresos"
              description="Los productos que más facturaron en el período."
              className="lg:col-span-3"
            >
              <Suspense fallback={<ChartFallback />}>
                <RankingChart
                  data={productRanking}
                  colors={["emerald", "teal", "blue", "violet", "amber"]}
                  valueFormatter={compactMoney}
                />
              </Suspense>
            </ReportChartCard>
            <ReportChartCard
              title="Participación de ingresos"
              description="Distribución de ventas por producto."
              className="lg:col-span-2"
            >
              <Suspense fallback={<ChartFallback />}>
                <DonutChart
                  className="h-72"
                  data={productShare}
                  category="name"
                  value="value"
                  colors={["emerald", "teal", "blue", "violet", "amber", "pink", "gray"]}
                  valueFormatter={formatPrice}
                />
              </Suspense>
            </ReportChartCard>
          </ChartGridState>

          <ProductsTable products={products} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="customers" className="space-y-4 pt-4">
          <ChartGridState isLoading={isLoading} hasData={customers.length > 0} single>
            <ReportChartCard
              title="Clientes con mayor gasto"
              description="Ranking de clientes por total comprado."
            >
              <Suspense fallback={<ChartFallback />}>
                <RankingChart
                  data={customerRanking}
                  colors={["violet", "blue", "cyan", "emerald"]}
                  valueFormatter={compactMoney}
                />
              </Suspense>
            </ReportChartCard>
          </ChartGridState>

          <CustomersTable customers={customers} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="coupons" className="space-y-4 pt-4">
          <ChartGridState isLoading={isLoading} hasData={coupons.length > 0}>
            <ReportChartCard
              title="Descuento otorgado"
              description="Cupones ordenados por descuento acumulado."
            >
              <Suspense fallback={<ChartFallback />}>
                <RankingChart
                  data={couponDiscountRanking}
                  colors={["amber", "pink", "violet", "blue"]}
                  valueFormatter={compactMoney}
                />
              </Suspense>
            </ReportChartCard>
            <ReportChartCard
              title="Distribución de usos"
              description="Qué cupones se usaron con mayor frecuencia."
            >
              <Suspense fallback={<ChartFallback />}>
                <DonutChart
                  className="h-72"
                  data={couponUsesShare}
                  category="name"
                  value="value"
                  colors={["amber", "pink", "violet", "blue", "emerald", "gray"]}
                  valueFormatter={(value) => `${value.toLocaleString("es")} usos`}
                />
              </Suspense>
            </ReportChartCard>
          </ChartGridState>

          <CouponsTable coupons={coupons} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportChartCard({
  title,
  description,
  badge,
  className,
  children,
}: {
  title: string;
  description: string;
  badge?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="mt-0.5">{description}</CardDescription>
          </div>
          {badge && (
            <div className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {badge}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

function ChartGridState({
  isLoading,
  hasData,
  single = false,
  wideLeft = false,
  children,
}: {
  isLoading: boolean;
  hasData: boolean;
  single?: boolean;
  wideLeft?: boolean;
  children: ReactNode;
}) {
  if (isLoading && !hasData) {
    return <ChartSkeletonGrid single={single} wideLeft={wideLeft} />;
  }

  if (!hasData) {
    return <ChartEmptyState />;
  }

  return (
    <div
      className={
        single
          ? "grid grid-cols-1 gap-4"
          : wideLeft
            ? "grid grid-cols-1 gap-4 lg:grid-cols-5"
            : "grid grid-cols-1 gap-4 lg:grid-cols-2"
      }
    >
      {children}
    </div>
  );
}

function ChartSkeletonGrid({ single, wideLeft }: { single: boolean; wideLeft: boolean }) {
  const className = single
    ? "grid grid-cols-1 gap-4"
    : wideLeft
      ? "grid grid-cols-1 gap-4 lg:grid-cols-5"
      : "grid grid-cols-1 gap-4 lg:grid-cols-2";

  return (
    <div className={className}>
      <Skeleton
        className={
          wideLeft
            ? "h-80 rounded-xl bg-slate-100 lg:col-span-3 dark:bg-slate-800/60"
            : "h-80 rounded-xl bg-slate-100 dark:bg-slate-800/60"
        }
      />
      {!single && (
        <Skeleton
          className={
            wideLeft
              ? "h-80 rounded-xl bg-slate-100 lg:col-span-2 dark:bg-slate-800/60"
              : "h-80 rounded-xl bg-slate-100 dark:bg-slate-800/60"
          }
        />
      )}
    </div>
  );
}

function ChartEmptyState() {
  return (
    <Card className="border-dashed border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
      <CardContent className="flex h-56 flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
        <TrendingUp className="size-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Sin datos suficientes para graficar este rango.
        </p>
        <p className="text-xs">Prueba ampliando el período o revisa otra pestaña.</p>
      </CardContent>
    </Card>
  );
}

function ChartFallback() {
  return (
    <div className="flex h-72 items-center justify-center text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-2 text-sm">
        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Cargando gráfico...
      </div>
    </div>
  );
}

function SalesTable({
  sales,
  isLoading,
}: {
  sales: { date: string; orders: number; revenue: string }[];
  isLoading: boolean;
}) {
  return (
    <Card className="rounded-xl p-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && sales.length === 0 ? (
              <TableLoadingRow colSpan={3} label="Cargando ventas..." />
            ) : sales.length === 0 ? (
              <TableEmptyRow colSpan={3} icon={TrendingUp} title="Sin ventas en este rango." />
            ) : (
              sales.map((row) => (
                <TableRow key={row.date}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(row.revenue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProductsTable({
  products,
  isLoading,
}: {
  products: { product_name: string; quantity: number; revenue: string }[];
  isLoading: boolean;
}) {
  return (
    <Card className="rounded-xl p-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Cantidad vendida</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && products.length === 0 ? (
              <TableLoadingRow colSpan={3} label="Cargando productos..." />
            ) : products.length === 0 ? (
              <TableEmptyRow colSpan={3} icon={TrendingUp} title="Sin ventas en este rango." />
            ) : (
              products.map((row) => (
                <TableRow key={row.product_name}>
                  <TableCell className="font-medium">{row.product_name}</TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(row.revenue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomersTable({
  customers,
  isLoading,
}: {
  customers: { customer_id: number; name: string | null; phone: string | null; orders_count: number; total_spent: string }[];
  isLoading: boolean;
}) {
  return (
    <Card className="rounded-xl p-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead className="text-right">Total gastado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && customers.length === 0 ? (
              <TableLoadingRow colSpan={3} label="Cargando clientes..." />
            ) : customers.length === 0 ? (
              <TableEmptyRow colSpan={3} icon={TrendingUp} title="Sin compras en este rango." />
            ) : (
              customers.map((row) => (
                <TableRow key={row.customer_id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.name || "Sin nombre"}</span>
                      <span className="text-xs text-muted-foreground">{row.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>{row.orders_count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(row.total_spent)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CouponsTable({
  coupons,
  isLoading,
}: {
  coupons: { coupon_id: number; code: string | null; uses: number; total_discount: string }[];
  isLoading: boolean;
}) {
  return (
    <Card className="rounded-xl p-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cupón</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead className="text-right">Descuento otorgado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && coupons.length === 0 ? (
              <TableLoadingRow colSpan={3} label="Cargando cupones..." />
            ) : coupons.length === 0 ? (
              <TableEmptyRow colSpan={3} icon={TrendingUp} title="Sin cupones usados en este rango." />
            ) : (
              coupons.map((row) => (
                <TableRow key={row.coupon_id}>
                  <TableCell className="font-medium">{row.code || "Sin código"}</TableCell>
                  <TableCell>{row.uses}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(row.total_discount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
