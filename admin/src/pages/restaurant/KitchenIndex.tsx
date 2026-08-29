import { useEffect } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "../../stores/authStore";
import { useRestaurantKitchenStore } from "../../stores/restaurantKitchenStore";

const CHANNEL_LABELS: Record<string, string> = {
  local: "Local",
  whatsapp: "WhatsApp",
  rappi: "Rappi",
  pedidosya: "PedidosYa",
  self_order: "Autoservicio",
};

interface Props {
  kiosk?: boolean;
}

export default function KitchenIndex({ kiosk = false }: Props) {
  const { orders, isLoading, error, fetchOrders, markReady } = useRestaurantKitchenStore();
  const { logout } = useAuthStore();

  useEffect(() => {
    fetchOrders().catch(() => undefined);
    const timer = window.setInterval(() => {
      fetchOrders().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [fetchOrders]);

  async function handleReady(id: number) {
    try {
      await markReady(id);
      toast.success("Pedido marcado como listo");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo marcar el pedido");
    }
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <section className={kiosk ? "min-h-screen space-y-5 bg-background p-4 md:p-6" : "space-y-4"}>
      <div className={kiosk ? "flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4" : undefined}>
        <div>
          <p className="text-sm font-medium text-muted-foreground">HungerApp</p>
          <h1 className={kiosk ? "text-4xl font-black tracking-tight" : "text-2xl font-bold tracking-tight"}>
            Cocina
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pantalla de cocina para TV: pedidos grandes, sin precios, sin métricas
            visibles y botón LISTO con refresco por polling.
          </p>
        </div>
        {kiosk ? (
          <Button type="button" variant="outline" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading && orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Cargando cocina...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">No hay pedidos en cocina</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Los pedidos cobrados desde Comanda aparecerán aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className={kiosk ? "grid gap-5 md:grid-cols-2 2xl:grid-cols-4" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
          {orders.map((order) => (
            <article
              key={order.id}
              className={`rounded-2xl border shadow-sm ${kiosk ? "p-6" : "p-5"} ${
                order.status === "ready"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={kiosk ? "text-5xl font-black tabular-nums" : "text-3xl font-black tabular-nums"}>
                    #{order.number}
                  </p>
                  <p className={kiosk ? "mt-2 text-2xl font-bold" : "mt-1 text-lg font-semibold"}>
                    {order.customer_name}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                  {CHANNEL_LABELS[order.channel] ?? order.channel}
                </span>
              </div>

              <ul className="mt-5 space-y-4">
                {order.items.map((item) => (
                  <li key={item.id} className="rounded-xl bg-background/70 p-4">
                    <p className={kiosk ? "text-2xl font-black" : "text-lg font-bold"}>
                      {item.quantity} x {item.product_name}
                    </p>
                    {item.removed_ingredients.length > 0 ? (
                      <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                        Sin {item.removed_ingredients.join(", sin ")}
                      </p>
                    ) : null}
                    {item.extras.length > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Extras: {item.extras.map((extra) => extra.name).join(", ")}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-2 rounded-lg bg-muted p-2 text-sm">{item.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                className="mt-5 h-12 w-full text-base font-bold"
                variant={order.status === "ready" ? "secondary" : "default"}
                disabled={order.status === "ready"}
                onClick={() => handleReady(order.id)}
              >
                {order.status === "ready" ? "LISTO" : "Marcar LISTO"}
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
