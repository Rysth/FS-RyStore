import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Ban,
  Banknote,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  ImageOff,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Store,
  StickyNote,
  Tag,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "../../../components/common/PageHeader";
import { useAuthStore } from "../../../stores/authStore";
import { useOrderStore } from "../../../stores/orderStore";
import { Permissions } from "../../../types/auth";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatPrice,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

/**
 * Full page rather than a dialog: this is the screen the shop works a live
 * order from — reading an address, checking a receipt, messaging the buyer —
 * and a modal made all of that share one scrollable box over a list nobody was
 * looking at. A page also means an order has a URL to share or reopen.
 */

/** The happy path, in order. "cancelado" is deliberately outside it. */
const ORDER_FLOW: OrderStatus[] = [
  "pendiente",
  "confirmado",
  "preparando",
  "entregado",
];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const { selectedOrder: order, isLoadingDetail, fetchOrder, updateStatus } =
    useOrderStore();

  // Held until the shop confirms: every status is a message to a real buyer —
  // "Entregado" on the wrong row is not something a toast can take back.
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canManage = hasPermission(Permissions.MANAGE_ORDERS);
  const isCanceled = order?.status === "cancelado";

  useEffect(() => {
    if (!id) return;
    fetchOrder(Number(id)).catch((error) => {
      toast.error(errorMessage(error, "Error al cargar el pedido"));
      navigate("/dashboard/orders");
    });
  }, [id, fetchOrder, navigate]);

  async function confirmStatusChange() {
    if (!order || !pendingStatus) return;

    setIsSaving(true);
    try {
      await updateStatus(order.id, pendingStatus);
      toast.success(`Pedido marcado como ${ORDER_STATUS_LABELS[pendingStatus]}`);
      setPendingStatus(null);
    } catch (error) {
      toast.error(errorMessage(error, "Error al actualizar el pedido"));
    } finally {
      setIsSaving(false);
    }
  }

  // The id check matters: selectedOrder is global store state, so arriving from
  // a different order would paint that one for the render before the effect's
  // fetch lands. Waiting for the id to match shows a spinner instead of someone
  // else's customer.
  if (isLoadingDetail || !order || String(order.id) !== id) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = order.items || [];
  const whatsappUrl = whatsappLink(order.phone);
  const currentStep = ORDER_FLOW.indexOf(order.status);
  const nextStatus = currentStep >= 0 ? ORDER_FLOW[currentStep + 1] : undefined;
  const otherStatuses = ORDER_STATUSES.filter(
    (status) => status !== order.status && status !== nextStatus,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        backTo="/dashboard/orders"
        backLabel="Volver a pedidos"
        title={`Pedido ${order.number}`}
        description={new Date(order.created_at).toLocaleString("es-EC", {
          dateStyle: "long",
          timeStyle: "short",
        })}
        actions={
          <>
            <Badge className={ORDER_STATUS_STYLES[order.status]}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            {whatsappUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 size-4" />
                  Escribir al cliente
                </a>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-xl">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <SectionLabel icon={Package}>Productos</SectionLabel>
                <span className="text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? "línea" : "líneas"}
                </span>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este pedido no tiene líneas.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <OrderLine key={item.id} item={item} />
                  ))}
                </ul>
              )}

              <Separator />

              {Number(order.discount_amount) > 0 && (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-600">
                    <span className="flex items-center gap-1.5">
                      <Tag className="size-3.5" />
                      Cupón {order.coupon_code}
                    </span>
                    <span className="tabular-nums">-{formatPrice(order.discount_amount)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-bold">Total</p>
                  <p className="text-xs text-muted-foreground">
                    {order.items_count}{" "}
                    {order.items_count === 1 ? "artículo" : "artículos"}
                  </p>
                </div>
                <span className="text-2xl font-bold tabular-nums">
                  {formatPrice(order.total)}
                </span>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card className="rounded-xl">
              <CardContent className="space-y-3 pt-6">
                <SectionLabel icon={StickyNote}>Nota del cliente</SectionLabel>
                <p className="rounded-lg border-l-2 border-primary/40 bg-muted/40 p-3 text-sm whitespace-pre-line">
                  {order.notes}
                </p>
              </CardContent>
            </Card>
          )}

          {order.payment_method === "transferencia" && (
            <PaymentProofCard url={order.payment_proof_url} />
          )}
        </div>

        <div className="space-y-6">
          <Card className="rounded-xl">
            <CardContent className="space-y-4 pt-6">
              <SectionLabel icon={Check}>Estado</SectionLabel>

              {isCanceled ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      Pedido cancelado
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Los pedidos cancelados no se pueden volver a modificar y
                      no cuentan en tus ingresos.
                    </p>
                  </div>
                </div>
              ) : (
                <StatusTimeline currentStep={currentStep} />
              )}

              {canManage && !isCanceled && (
                <div className="space-y-2 pt-1">
                  {nextStatus && (
                    <Button
                      className="w-full"
                      onClick={() => setPendingStatus(nextStatus)}
                    >
                      <Check className="mr-2 size-4" />
                      Marcar como {ORDER_STATUS_LABELS[nextStatus]}
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Cambiar a otro estado
                        <ChevronDown className="ml-2 size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {otherStatuses.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => setPendingStatus(status)}
                          className={
                            status === "cancelado"
                              ? "text-destructive focus:text-destructive"
                              : undefined
                          }
                        >
                          {status === "cancelado" && (
                            <Ban className="mr-2 size-4" />
                          )}
                          {ORDER_STATUS_LABELS[status]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </CardContent>
          </Card>

          <CustomerCard order={order} whatsappUrl={whatsappUrl} />

          <Card className="rounded-xl">
            <CardContent className="space-y-4 pt-6">
              <SectionLabel icon={Truck}>Entrega y pago</SectionLabel>

              <InfoRow
                icon={order.delivery_method === "domicilio" ? Truck : Store}
                label="Entrega"
                value={order.delivery_method_label}
              />
              <InfoRow
                icon={
                  order.payment_method === "transferencia" ? Landmark : Banknote
                }
                label="Pago"
                value={order.payment_method_label}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar estado del pedido</AlertDialogTitle>
            <AlertDialogDescription>
              El pedido {order.number} pasará de{" "}
              <strong>{ORDER_STATUS_LABELS[order.status]}</strong> a{" "}
              <strong>
                {pendingStatus ? ORDER_STATUS_LABELS[pendingStatus] : ""}
              </strong>
              .
              {pendingStatus === "cancelado" &&
                " Un pedido cancelado deja de contar en tus ingresos y no se puede volver a modificar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Kept open while the request runs, so the shop sees it fail.
                event.preventDefault();
                void confirmStatusChange();
              }}
              disabled={isSaving}
              className={
                pendingStatus === "cancelado"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </p>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

/** One line of the order: photo, what was sold, and what it cost. */
function OrderLine({ item }: { item: OrderItem }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.product_name}</p>
        {item.variant_label && (
          <Badge variant="secondary" className="mt-0.5">
            {item.variant_label}
          </Badge>
        )}
        {/* A combo line: what the bundle held, so the order can be picked from
            this row without looking the promotion up. */}
        {item.details && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.details}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {item.quantity} × {formatPrice(item.unit_price)}
        </p>
      </div>

      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatPrice(item.subtotal)}
      </span>
    </li>
  );
}

function StatusTimeline({ currentStep }: { currentStep: number }) {
  return (
    <ol className="space-y-0">
      {ORDER_FLOW.map((status, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;
        const isLast = index === ORDER_FLOW.length - 1;

        return (
          <li key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-background text-primary ring-4 ring-primary/15"
                      : "border-border bg-background text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="size-3" /> : index + 1}
              </span>
              {!isLast && (
                <span
                  className={`w-0.5 flex-1 ${
                    isDone ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
            <span
              className={`pb-4 text-sm ${
                isCurrent
                  ? "font-semibold text-foreground"
                  : isDone
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {ORDER_STATUS_LABELS[status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CustomerCard({
  order,
  whatsappUrl,
}: {
  order: Order;
  whatsappUrl: string | null;
}) {
  const { hasPermission } = useAuthStore();
  const fullAddress = [order.address, order.city].filter(Boolean).join(", ");
  const canViewContacts = hasPermission(Permissions.VIEW_CONTACTS);

  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <SectionLabel icon={Phone}>Cliente</SectionLabel>
          {canViewContacts && order.customer_id && (
            <Link
              to={`/dashboard/contacts/${order.customer_id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver contacto
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(order.customer_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{order.customer_name}</p>
            <a
              href={`tel:${order.phone}`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {order.phone}
            </a>
          </div>
        </div>

        {order.email && (
          <InfoRow
            icon={Mail}
            label="Correo"
            value={
              <a
                href={`mailto:${order.email}`}
                className="hover:underline"
              >
                {order.email}
              </a>
            }
          />
        )}

        {fullAddress && (
          <InfoRow
            icon={MapPin}
            label="Dirección"
            value={
              <a
                // The shop reads this while deciding a route, so it opens where
                // it is actually useful instead of being copied by hand.
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1 hover:underline"
              >
                {fullAddress}
                <ExternalLink className="mt-0.5 size-3 shrink-0" />
              </a>
            }
          />
        )}

        {whatsappUrl && (
          <Button asChild variant="outline" className="w-full">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 size-4" />
              Escribir por WhatsApp
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * "image" is tried first since most receipts are photos. A receipt that
 * isn't one (a PDF) fails the <img> and falls back to an inline <embed> —
 * most browsers show their native PDF viewer in that. A browser that can't
 * even do that (mobile Safari, mainly) falls back once more to a plain link,
 * rather than a broken gray box.
 */
type ProofPreview = "image" | "pdf" | "unsupported";

function PaymentProofCard({ url }: { url: string | null }) {
  const [preview, setPreview] = useState<ProofPreview>("image");

  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-3 pt-6">
        <SectionLabel icon={FileText}>Comprobante de transferencia</SectionLabel>

        {url ? (
          <div className="overflow-hidden rounded-lg border">
            {preview === "unsupported" ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 hover:bg-muted/50"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-5" />
                </span>
                <span className="text-sm font-medium">Abrir el comprobante</span>
              </a>
            ) : preview === "pdf" ? (
              <embed
                src={url}
                type="application/pdf"
                className="h-[480px] w-full bg-muted"
                onError={() => setPreview("unsupported")}
              />
            ) : (
              <img
                src={url}
                alt="Comprobante de pago"
                className="max-h-72 w-full bg-muted object-contain"
                onError={() => setPreview("pdf")}
              />
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Ver en tamaño completo
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              El cliente aún no ha subido el comprobante.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * wa.me needs the country code, and buyers type their number the local way
 * ("0988949117"). Sending that through as-is opened a chat with nobody, so a
 * leading 0 on a 10-digit Ecuadorian mobile becomes 593. Anything already in
 * international form is left alone.
 */
function whatsappLink(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;

  const normalized =
    digits.length === 10 && digits.startsWith("0")
      ? `593${digits.slice(1)}`
      : digits;

  return `https://wa.me/${normalized}`;
}
