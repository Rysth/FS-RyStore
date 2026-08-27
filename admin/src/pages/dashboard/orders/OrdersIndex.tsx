import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SearchBar from "../../../components/common/SearchBar";
import Pagination from "../../../components/common/Pagination";
import PageHeader from "../../../components/common/PageHeader";
import {
  TableEmptyRow,
  TableLoadingRow,
} from "../../../components/common/TableStates";
import { useAuthStore } from "../../../stores/authStore";
import { useOrderStore } from "../../../stores/orderStore";
import { Permissions } from "../../../types/auth";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatPrice,
  type OrderStatus,
} from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

const PER_PAGE = 12;
const COLUMN_COUNT = 7;

/** The dot on each summary tile, so a status reads before its label does. */
const STATUS_DOTS: Record<OrderStatus, string> = {
  pendiente: "bg-amber-500",
  confirmado: "bg-blue-500",
  preparando: "bg-indigo-500",
  entregado: "bg-green-500",
  cancelado: "bg-red-500",
};

export default function OrdersIndex() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const { orders, summary, pagination, isLoading, fetchOrders } =
    useOrderStore();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const canManage = hasPermission(Permissions.MANAGE_ORDERS);
  const hasFilters = Boolean(search || status);

  useEffect(() => {
    fetchOrders(1, PER_PAGE, { search, status }).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  }, [fetchOrders, search, status]);

  const handlePageChange = ({ selected }: { selected: number }) => {
    fetchOrders(selected + 1, PER_PAGE, { search, status }).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Revisa y actualiza el estado de los pedidos de tu tienda."
        actions={
          canManage && (
            <Button onClick={() => navigate("/dashboard/orders/new")}>
              <Plus className="mr-2 size-4" />
              Nuevo pedido
            </Button>
          )
        }
      />

      {/* Doubles as the status filter: the number the shop is looking at is the
          same control it clicks to see those orders. */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_STATUSES.map((key) => {
            const isActive = status === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(isActive ? "" : key)}
                aria-pressed={isActive}
                className={`rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border/60 hover:border-border hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${STATUS_DOTS[key]}`}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {ORDER_STATUS_LABELS[key]}
                  </span>
                </span>
                <span className="mt-1 block text-2xl font-bold tabular-nums">
                  {summary[key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBar
          placeholder="Buscar por cliente, teléfono o número..."
          value={search}
          onSearch={setSearch}
          className="w-full sm:max-w-sm"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1.5 size-4" />
            Limpiar filtros
          </Button>
        )}
      </div>

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableLoadingRow
                  colSpan={COLUMN_COUNT}
                  label="Cargando pedidos..."
                />
              ) : orders.length === 0 ? (
                <TableEmptyRow
                  colSpan={COLUMN_COUNT}
                  icon={ShoppingBag}
                  title={
                    hasFilters
                      ? "Ningún pedido coincide con la búsqueda."
                      : "Todavía no hay pedidos."
                  }
                  description={
                    hasFilters
                      ? undefined
                      : "Cuando alguien compre en tu tienda, el pedido aparece aquí."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Limpiar filtros
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                orders.map((order) => (
                  // The whole row is a target as well as the button: the shop is
                  // already pointing at the row it wants. The button stays because
                  // it is the keyboard-reachable half of the same action.
                  <TableRow
                    key={order.id}
                    onClick={() => navigate(`/dashboard/orders/${order.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{order.number}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString("es-EC", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{order.customer_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {order.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {order.delivery_method_label}
                        </span>
                        {order.city && (
                          <span className="text-xs text-muted-foreground">
                            {order.city}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm">
                          {order.payment_method_label}
                        </span>
                        {/* Whether the receipt landed is the thing the shop
                            chases on a transfer, so it is visible from here. */}
                        {order.payment_method === "transferencia" && (
                          <Badge
                            variant="outline"
                            className={
                              order.payment_proof_url
                                ? "border-green-200 text-green-700"
                                : "border-amber-200 text-amber-700"
                            }
                          >
                            {order.payment_proof_url
                              ? "Con comprobante"
                              : "Sin comprobante"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold tabular-nums">
                          {formatPrice(order.total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {order.items_count}{" "}
                          {order.items_count === 1 ? "artículo" : "artículos"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={ORDER_STATUS_STYLES[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/dashboard/orders/${order.id}`);
                        }}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pagination.total_pages > 1 && (
        <Pagination
          currentPage={pagination.current_page - 1}
          pageCount={pagination.total_pages}
          totalCount={pagination.total_count}
          perPage={pagination.per_page}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
