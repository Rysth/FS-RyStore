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
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "../../stores/authStore";
import { useProductStore } from "../../stores/productStore";
import { useRestaurantCashRegisterStore } from "../../stores/restaurantCashRegisterStore";
import { useRestaurantOrderStore } from "../../stores/restaurantOrderStore";
import { Permissions } from "../../types/auth";
import type { Product } from "../../types/store";
import { formatPrice } from "../../types/store";

interface DraftLine {
  product: Product;
  quantity: number;
  removedIngredients: string;
  extraName: string;
  extraPrice: string;
  notes: string;
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
  const { orders, isSubmitting, fetchOrders, createOrder, deliverOrder, cancelOrder } = useRestaurantOrderStore();
  const { hasPermission } = useAuthStore();
  const canCancelOrders = hasPermission(Permissions.VOID_PAYMENTS);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<keyof typeof PAYMENT_METHOD_LABELS>("cash");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    fetchCurrent().catch(() => undefined);
    fetchOrders().catch(() => undefined);
    fetchProducts(1, 100, { active: "true" }).catch(() => undefined);
  }, [fetchCurrent, fetchOrders, fetchProducts]);

  const total = useMemo(
    () => lines.reduce((sum, line) => {
      const extra = line.extraName.trim() ? Number(line.extraPrice || 0) : 0;
      return sum + (Number(line.product.price) + extra) * line.quantity;
    }, 0),
    [lines],
  );
  const activeOrders = orders.filter((order) => order.status === "preparing" || order.status === "ready");

  function addProduct(product: Product) {
    setLines((currentLines) => {
      const existing = currentLines.find((line) => line.product.id === product.id);
      if (existing) {
        return currentLines.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...currentLines, { product, quantity: 1, removedIngredients: "", extraName: "", extraPrice: "", notes: "" }];
    });
  }

  function updateLine(productId: number, patch: Partial<Omit<DraftLine, "product">>) {
    setLines((currentLines) =>
      currentLines
        .map((line) => line.product.id === productId ? { ...line, ...patch } : line)
        .filter((line) => line.quantity > 0),
    );
  }

  function toggleRemovedIngredient(line: DraftLine, ingredient: string) {
    const current = line.removedIngredients
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const exists = current.some((value) => value.toLowerCase() === ingredient.toLowerCase());
    const next = exists
      ? current.filter((value) => value.toLowerCase() !== ingredient.toLowerCase())
      : [...current, ingredient];
    updateLine(line.product.id, { removedIngredients: next.join(", ") });
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
          removed_ingredients: line.removedIngredients
            .split(",")
            .map((ingredient) => ingredient.trim())
            .filter(Boolean),
          extras: line.extraName.trim() && line.extraPrice.trim()
            ? [{ name: line.extraName, price: line.extraPrice }]
            : [],
          notes: line.notes || null,
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

  async function handleDeliver(id: number) {
    try {
      await deliverOrder(id);
      toast.success("Pedido entregado correctamente");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo entregar el pedido");
    }
  }

  async function handleCancel(id: number) {
    if (!cancelReason.trim()) {
      toast.error("El motivo de anulación es obligatorio");
      return;
    }
    try {
      await cancelOrder(id, cancelReason.trim());
      setCancellingId(null);
      setCancelReason("");
      toast.success("Pedido cancelado correctamente");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo cancelar el pedido");
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
                      <div key={line.product.id} className="space-y-3 rounded-lg border border-border p-3">
                        <div className="flex items-center gap-3">
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
                            onChange={(event) => updateLine(line.product.id, { quantity: Number(event.target.value) })}
                          />
                        </div>
                        <Input
                          value={line.removedIngredients}
                          onChange={(event) => updateLine(line.product.id, { removedIngredients: event.target.value })}
                          placeholder="Sin cebolla, sin queso..."
                        />
                        {line.product.default_ingredients?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {line.product.default_ingredients.map((ingredient) => {
                              const active = line.removedIngredients
                                .split(",")
                                .map((value) => value.trim().toLowerCase())
                                .includes(ingredient.toLowerCase());
                              return (
                                <button
                                  key={ingredient}
                                  type="button"
                                  onClick={() => toggleRemovedIngredient(line, ingredient)}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    active
                                      ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Sin {ingredient}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-[1fr_96px] xl:grid-cols-[1fr_96px]">
                          <Input
                            value={line.extraName}
                            onChange={(event) => updateLine(line.product.id, { extraName: event.target.value })}
                            placeholder="Extra: tocino, cheddar..."
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={line.extraPrice}
                            onChange={(event) => updateLine(line.product.id, { extraPrice: event.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        <Textarea
                          value={line.notes}
                          onChange={(event) => updateLine(line.product.id, { notes: event.target.value })}
                          placeholder="Nota para cocina"
                          className="min-h-14"
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
            <CardTitle>Pedidos activos</CardTitle>
            <CardDescription>
              Entrega solo los pedidos que cocina ya marcó como listos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">#{order.number} · {order.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.status === "ready" ? "Listo para entregar" : "En cocina"}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">{formatPrice(order.total_amount)}</span>
                </div>
                {cancellingId === order.id ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Motivo de anulación"
                      maxLength={255}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleCancel(order.id)}
                      >
                        Confirmar anulación
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setCancellingId(null); setCancelReason(""); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {order.status === "ready" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleDeliver(order.id)}
                      >
                        Entregar
                      </Button>
                    ) : null}
                    {canCancelOrders ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setCancellingId(order.id)}
                      >
                        Anular
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {activeOrders.length === 0 ? <p className="text-sm text-muted-foreground">Sin pedidos activos.</p> : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
