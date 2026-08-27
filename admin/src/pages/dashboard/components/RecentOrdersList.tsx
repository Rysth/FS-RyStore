import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatPrice,
  type OrderStatus,
} from "@/types/store";

interface RecentOrder {
  id: number;
  number: string;
  customer_name: string;
  total: string;
  status: string;
  payment_method: string;
  created_at: string;
}

interface RecentOrdersListProps {
  orders: RecentOrder[];
  timeAgo: (iso: string) => string;
}

export function RecentOrdersList({ orders, timeAgo }: RecentOrdersListProps) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Pedidos recientes</CardTitle>
          <span className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            Ver todos
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay pedidos recientes
            </p>
          ) : (
            orders.map((o) => {
              const status = o.status as OrderStatus;

              return (
                <div key={o.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <span className="text-xs font-bold">
                      {o.number?.slice(-4) ?? o.id}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {o.customer_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {o.number} · {formatPrice(o.total)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          className={`text-xs px-1.5 py-0 ${ORDER_STATUS_STYLES[status] ?? ""}`}
                        >
                          {ORDER_STATUS_LABELS[status] ?? o.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(o.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
