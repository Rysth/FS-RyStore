import { useEffect, useMemo, useState } from "react";
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
import { useProductStore } from "../../stores/productStore";
import { useRestaurantCashRegisterStore } from "../../stores/restaurantCashRegisterStore";
import { useRestaurantOrderStore } from "../../stores/restaurantOrderStore";
import type { Product } from "../../types/store";
import { formatPrice } from "../../types/store";

interface DraftLine {
  product: Product;
  quantity: number;
}

const PAYMENT_METHOD_LABELS = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  platform: "Plataforma",
} as const;

export default function RestaurantOrdersIndex() {
  const { products, isLoading: productsLoading, fetchProducts } = useProductStore();
  const { current, fetchCurrent } = useRestaurantCashRegisterStore();
  const { orders, isSubmitting, fetchOrders, createOrder } = useRestaurantOrderStore();
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<keyof typeof PAYMENT_METHOD_LABELS>("cash");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  useEffect(() => {
    fetchCurrent().catch(() => undefined);
    fetchOrders().catch(() => undefined);
    fetchProducts(1, 100, { active: "true" }).catch(() => undefined);
  }, [fetchCurrent, fetchOrders, fetchProducts]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0),
    [lines],
  );

  function addProduct(product: Product) {
    setLines((currentLines) => {
      const existing = currentLines.find((line) => line.product.id === product.id);
      if (existing) {
        return currentLines.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...currentLines, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: number, quantity: number) {
    setLines((currentLines) =>
      currentLines
        .map((line) => line.product.id === productId ? { ...line, quantity } : line)
        .filter((line) => line.quantity > 0),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) {
      toast.error("Abre una caja antes de tomar pedidos");
      return;
    }
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }

    try {
      const order = await createOrder({
        customer_name: customerName,
        channel: "local",
        payment_method: paymentMethod,
        received_amount: paymentMethod === "cash" ? receivedAmount || null : null,
        reference: paymentMethod === "cash" ? null : reference || null,
        items: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
      });
      setCustomerName("");
      setReceivedAmount("");
      setReference("");
      setLines([]);
      await fetchCurrent();
      toast.success(`Pedido #${order.number} enviado a cocina`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo registrar el pedido");
    }
  }

  return (
    <section className="space-y-4 xl:grid xl:grid-cols-[1fr_420px] xl:gap-5 xl:space-y-0">
      <div>
        <p className="text-sm font-medium text-muted-foreground">HungerApp</p>
        <h1 className="text-2xl font-bold tracking-tight">Comanda</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Esta será la pantalla táctil para tomar pedidos locales, WhatsApp manual
          y autoservicio. El cobro será el paso que envía el pedido a cocina.
        </p>

        {!current ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Abre una caja antes de tomar pedidos.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productsLoading ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Cargando productos...
            </div>
          ) : (
            products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <span className="block font-semibold leading-tight">{product.name}</span>
                <span className="mt-2 block text-sm font-medium text-muted-foreground">
                  {formatPrice(product.price)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Pedido actual</CardTitle>
            <CardDescription>
              Flujo mínimo: productos, cliente y cobro completo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Nombre del cliente</Label>
                <Input
                  id="customer_name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nombre para llamar en cocina"
                  maxLength={60}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Productos</Label>
                {lines.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Toca productos del menú para agregarlos.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lines.map((line) => (
                      <div key={line.product.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{line.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatPrice(line.product.price)} c/u
                          </p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          className="w-20"
                          value={line.quantity}
                          onChange={(event) => updateQuantity(line.product.id, Number(event.target.value))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Método de pago</Label>
                  <select
                    id="payment_method"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as keyof typeof PAYMENT_METHOD_LABELS)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {paymentMethod === "cash" ? (
                  <div className="space-y-2">
                    <Label htmlFor="received_amount">Efectivo recibido</Label>
                    <Input
                      id="received_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={receivedAmount}
                      onChange={(event) => setReceivedAmount(event.target.value)}
                      placeholder={formatPrice(total).replace("$", "")}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="reference">Referencia</Label>
                    <Input
                      id="reference"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="Comprobante o voucher"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-bold tabular-nums">{formatPrice(total)}</span>
              </div>

              <Button type="submit" className="h-12 w-full" disabled={isSubmitting || !current}>
                {isSubmitting ? "Enviando..." : "Cobrar y enviar a cocina"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>#{order.number} · {order.customer_name}</span>
                <span className="font-medium tabular-nums">{formatPrice(order.total_amount)}</span>
              </div>
            ))}
            {orders.length === 0 ? <p className="text-sm text-muted-foreground">Sin pedidos todavía.</p> : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
