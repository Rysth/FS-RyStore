import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrderStore } from "../../../stores/orderStore";
import api from "../../../utils/api";
import { errorMessage } from "../../../utils/apiError";
import {
  DELIVERY_METHODS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_METHODS,
  formatPrice,
  type DeliveryMethod,
  type OrderStatus,
  type PaymentMethod,
  type Product,
} from "../../../types/store";

interface OrderFormValues {
  customer_name: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  payment_method: PaymentMethod;
  delivery_method: DeliveryMethod;
  status: OrderStatus;
}

interface Line {
  product: Product;
  quantity: number;
}

const EMPTY_VALUES: OrderFormValues = {
  customer_name: "",
  phone: "",
  city: "",
  address: "",
  notes: "",
  payment_method: PAYMENT_METHODS.EFECTIVO,
  delivery_method: DELIVERY_METHODS.DOMICILIO,
  // A counter or phone order is normally already agreed with the buyer.
  status: "confirmado",
};

/**
 * Unit price for a quantity, mirroring Product#unit_price_for on the server:
 * the cheapest applicable tier wins, and the base price is the fallback.
 *
 * Only ever used for the preview total shown while typing. The server
 * recalculates every price from the catalog when the order is saved, and that
 * result is what gets stored — this is not allowed to become the source of
 * truth for money.
 */
function previewUnitPrice(product: Product, quantity: number): number {
  const applicable = (product.price_tiers || [])
    .filter((tier) => Number(tier.min_quantity) <= quantity)
    .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity))
    .at(-1);

  return Number(applicable?.unit_price ?? product.price) || 0;
}

const LIST_PATH = "/dashboard/orders";
const FORM_ID = "order-form";

/**
 * Register an order the shop took by hand, on its own route.
 *
 * It was a dialog first, which fought the product picker: a scrolling result
 * list inside a scrolling dialog, with no room for the lines once a few were
 * added. As a page the work also survives a refresh and can be linked to.
 */
export default function OrderForm() {
  const navigate = useNavigate();
  const { createOrder } = useOrderStore();
  const form = useForm<OrderFormValues>({ defaultValues: EMPTY_VALUES });

  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // Fetched straight through `api` rather than useProductStore: that store backs
  // the products page, and searching from here would overwrite the list it holds.
  const requestId = useRef(0);
  useEffect(() => {
    const term = search.trim();
    const id = ++requestId.current;
    setIsSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get("/api/v1/products", {
          params: { per_page: 8, active: "true", search: term || undefined },
        });
        // Ignore a slow answer that lost the race to a newer keystroke.
        if (id !== requestId.current) return;
        setResults(response.data.products || []);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setIsSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const total = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + previewUnitPrice(line.product, line.quantity) * line.quantity,
        0,
      ),
    [lines],
  );

  function addProduct(product: Product) {
    setItemsError(null);
    setLines((previous) => {
      const existing = previous.find((line) => line.product.id === product.id);
      if (!existing) return [...previous, { product, quantity: 1 }];

      // Same product twice is one line with more units, which is also what makes
      // it reach a wholesale tier.
      return previous.map((line) =>
        line.product.id === product.id
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      );
    });
  }

  function setQuantity(productId: number, quantity: number) {
    setLines((previous) =>
      previous.map((line) =>
        line.product.id === productId
          ? { ...line, quantity: Math.max(1, Math.min(999, quantity)) }
          : line,
      ),
    );
  }

  const onSubmit = async (values: OrderFormValues) => {
    if (lines.length === 0) {
      setItemsError("Agrega al menos un producto al pedido");
      return;
    }

    setIsSaving(true);
    try {
      const order = await createOrder({
        order: {
          customer_name: values.customer_name.trim(),
          phone: values.phone.trim(),
          city: values.city.trim() || undefined,
          address: values.address.trim() || undefined,
          notes: values.notes.trim() || undefined,
          payment_method: values.payment_method,
          delivery_method: values.delivery_method,
          status: values.status,
        },
        items: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
      });

      toast.success(`Pedido ${order.number} registrado por ${formatPrice(order.total)}`);
      navigate(LIST_PATH);
    } catch (error) {
      toast.error(errorMessage(error, "Error al registrar el pedido"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 text-muted-foreground"
            onClick={() => navigate(LIST_PATH)}
          >
            <ArrowLeft className="mr-1.5 size-4" />
            Pedidos
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Nuevo pedido</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Para pedidos que llegan por teléfono, WhatsApp o en el local. Los
            precios y el total los calcula el catálogo, con sus escalas por
            cantidad.
          </p>
        </div>

        {/* Outside the form, reaching it by id — the HTML form attribute — so
            the buttons stay put at the top instead of hiding under the lines. */}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(LIST_PATH)}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Registrar pedido
          </Button>
        </div>
      </div>

      {/* Two columns from lg up: who is buying and what, on the left; how it
          ships, how it is paid and what it adds up to, on the right. */}
      <form
        id={FORM_ID}
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-3 lg:items-start"
      >
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-border/60">
            <CardContent className="space-y-4 p-5">
              <Label>Datos del cliente</Label>
              <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="order-customer">Nombre del cliente *</Label>
              <Input
                id="order-customer"
                placeholder="María Pérez"
                {...form.register("customer_name", {
                  required: "El nombre es requerido",
                  maxLength: { value: 100, message: "Máximo 100 caracteres" },
                })}
              />
              {form.formState.errors.customer_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.customer_name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order-phone">Teléfono (WhatsApp) *</Label>
              <Input
                id="order-phone"
                type="tel"
                inputMode="tel"
                placeholder="0987654321"
                {...form.register("phone", {
                  required: "El teléfono es requerido",
                })}
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="order-city">Ciudad</Label>
              <Input id="order-city" placeholder="Quito" {...form.register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-address">Dirección</Label>
              <Input
                id="order-address"
                placeholder="Av. Amazonas N34-100"
                {...form.register("address")}
              />
            </div>
          </div>

            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-2 p-5">
            <Label>Productos *</Label>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar producto por nombre..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {isSearching ? (
              <p className="py-2 text-xs text-muted-foreground">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                {search.trim()
                  ? "Ningún producto visible coincide con esa búsqueda."
                  : "Escribe para buscar en tu catálogo."}
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {results.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{product.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatPrice(product.price)}
                          {product.stock != null && ` · ${product.stock} en stock`}
                        </span>
                      </span>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {lines.length > 0 && (
              <ul className="space-y-2 border-t border-border pt-2">
                {lines.map((line) => (
                  <li key={line.product.id} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {line.product.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatPrice(previewUnitPrice(line.product, line.quantity))} c/u
                        {line.product.stock != null &&
                          line.quantity > line.product.stock &&
                          ` · solo ${line.product.stock} en stock`}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className="h-9 w-20"
                      aria-label={`Cantidad de ${line.product.name}`}
                      value={line.quantity}
                      onChange={(event) =>
                        setQuantity(line.product.id, Number(event.target.value))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setLines((previous) =>
                          previous.filter((row) => row.product.id !== line.product.id),
                        )
                      }
                      aria-label={`Quitar ${line.product.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {itemsError && <p className="text-xs text-destructive">{itemsError}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/60">
            <CardContent className="space-y-4 p-5">
              <Label>Entrega y pago</Label>

              <div className="space-y-1.5">
                <Label
                  htmlFor="order-delivery"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Entrega
                </Label>
                <select
                  id="order-delivery"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("delivery_method")}
                >
                  <option value={DELIVERY_METHODS.DOMICILIO}>Envío a domicilio</option>
                  <option value={DELIVERY_METHODS.RETIRO}>Retiro en local</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="order-payment"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Pago
                </Label>
                <select
                  id="order-payment"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("payment_method")}
                >
                  <option value={PAYMENT_METHODS.EFECTIVO}>Efectivo</option>
                  <option value={PAYMENT_METHODS.TRANSFERENCIA}>Transferencia</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="order-status"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Estado
                </Label>
                <select
                  id="order-status"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("status")}
                >
                  {ORDER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ORDER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-1.5 p-5">
              <Label htmlFor="order-notes">Notas</Label>
              <Textarea
                id="order-notes"
                rows={3}
                placeholder="Entregar después de las 6pm, timbre 3..."
                {...form.register("notes", {
                  maxLength: { value: 1000, message: "Máximo 1000 caracteres" },
                })}
              />
              {form.formState.errors.notes && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.notes.message}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sits beside the lines rather than under them, so the shop can read
              the total off the screen while it is still adding products. */}
          <Card className="border-border/60">
            <CardContent className="space-y-2 p-5">
              <Label>Resumen</Label>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  {lines.length === 0
                    ? "Sin productos"
                    : `${lines.length} ${lines.length === 1 ? "producto" : "productos"}`}
                </span>
                <span className="text-xl font-bold">{formatPrice(total)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Total estimado. El catálogo recalcula los precios al guardar, y
                ese resultado es el que queda registrado.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
