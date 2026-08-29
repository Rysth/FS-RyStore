import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import toast from "react-hot-toast";
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
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "../../types/store";
import { useRestaurantCashRegisterStore } from "../../stores/restaurantCashRegisterStore";

export default function CashRegisterIndex() {
  const {
    current,
    liveTotals,
    dailyReport,
    isLoading,
    isSubmitting,
    error,
    fetchCurrent,
    open,
    close,
  } = useRestaurantCashRegisterStore();
  const [openingAmount, setOpeningAmount] = useState("0.00");
  const [closingAmount, setClosingAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchCurrent().catch(() => undefined);
  }, [fetchCurrent]);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await open(openingAmount);
      toast.success("Caja abierta correctamente");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo abrir la caja");
    }
  }

  async function handleClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;

    try {
      await close(current.id, closingAmount, notes);
      setClosingAmount("");
      setNotes("");
      toast.success("Caja cerrada correctamente");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo cerrar la caja");
    }
  }

  const expectedCash = current
    ? Number(current.opening_amount) + Number(liveTotals?.cashTotal ?? current.cash_total ?? 0)
    : 0;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">HungerApp</p>
        <h1 className="text-2xl font-bold tracking-tight">Caja</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Apertura, cierre, efectivo esperado, transferencias y cuadre del turno.
          Una sola caja abierta será la regla base de este vertical.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Cargando caja...
          </CardContent>
        </Card>
      ) : current?.status === "open" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Caja abierta</CardTitle>
                <CardDescription>
                  Día operativo {current.business_date}. Abierta el {formatDateTime(current.opened_at)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Fondo inicial" value={formatPrice(current.opening_amount)} />
                  <Metric label="Efectivo cobrado" value={formatPrice(liveTotals?.cashTotal)} />
                  <Metric label="Efectivo esperado" value={formatPrice(expectedCash)} />
                  <Metric label="Transferencias" value={formatPrice(liveTotals?.transferTotal)} />
                  <Metric label="Tarjeta" value={formatPrice(liveTotals?.cardTotal)} />
                  <Metric label="Plataformas" value={formatPrice(liveTotals?.platformTotal)} />
                  <Metric label="Ventas totales" value={formatPrice(liveTotals?.totalSales)} />
                  <Metric label="Pedidos tomados" value={`${liveTotals?.ordersCount ?? 0}`} />
                  <Metric label="Pedidos cobrados" value={`${liveTotals?.ordersPaidCount ?? 0}`} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Productos más vendidos</CardTitle>
                <CardDescription>
                  Ranking del día operativo actual por importe vendido.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailyReport?.top_products.length ? (
                  dailyReport.top_products.map((product) => (
                    <div key={product.product_name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{product.product_name}</p>
                        <p className="text-xs text-muted-foreground">{product.quantity} vendido(s)</p>
                      </div>
                      <span className="font-semibold tabular-nums">{formatPrice(product.revenue)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Aún no hay productos vendidos.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Métodos de pago</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailyReport?.payment_methods.length ? (
                  dailyReport.payment_methods.map((method) => (
                    <div key={method.method} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span>{paymentMethodLabel(method.method)} · {method.payments_count}</span>
                      <span className="font-semibold tabular-nums">{formatPrice(method.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sin cobros registrados.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cerrar caja</CardTitle>
              <CardDescription>
                Registra el efectivo contado. Los totales quedarán congelados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleClose} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="closing_amount">Efectivo contado</Label>
                  <Input
                    id="closing_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={closingAmount}
                    onChange={(event) => setClosingAmount(event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cash_notes">Notas</Label>
                  <Textarea
                    id="cash_notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Observaciones del turno"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Cerrando..." : "Cerrar caja"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Abrir caja</CardTitle>
            <CardDescription>
              Registra el fondo inicial para empezar el día operativo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleOpen} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="opening_amount">Fondo inicial</Label>
                <Input
                  id="opening_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={openingAmount}
                  onChange={(event) => setOpeningAmount(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Abriendo..." : "Abrir caja"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function paymentMethodLabel(value: string): string {
  const labels: Record<string, string> = {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
    platform: "Plataforma",
  };
  return labels[value] ?? value;
}
