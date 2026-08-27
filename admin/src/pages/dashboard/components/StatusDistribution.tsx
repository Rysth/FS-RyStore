import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatusItem {
  status: string;
  label: string;
  count: number;
}

interface StatusDistributionProps {
  total: number;
  statuses: StatusItem[];
}

const statusColor: Record<string, string> = {
  pendiente: "bg-amber-500 text-amber-700",
  confirmado: "bg-blue-500 text-blue-700",
  preparando: "bg-violet-500 text-violet-700",
  entregado: "bg-emerald-500 text-emerald-700",
  cancelado: "bg-rose-500 text-rose-700",
};

export function StatusDistribution({
  total,
  statuses,
}: StatusDistributionProps) {
  const visibleStatuses = statuses.filter((status) => status.count > 0);
  const max = Math.max(...statuses.map((status) => status.count), 1);

  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Pedidos por estado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="rounded-xl bg-muted/50 p-4">
          <p className="text-3xl font-bold tabular-nums">{total}</p>
          <p className="text-xs text-muted-foreground">pedidos registrados</p>
        </div>

        {visibleStatuses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Aún no hay pedidos para graficar.
          </p>
        ) : (
          <div className="space-y-3">
            {statuses.map((status) => {
              const pct = total > 0 ? Math.round((status.count / total) * 100) : 0;
              const width = `${Math.max((status.count / max) * 100, status.count > 0 ? 8 : 0)}%`;
              const color = statusColor[status.status] || "bg-slate-500 text-slate-700";

              return (
                <div key={status.status} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className={`font-medium ${color.split(" ")[1] ?? ""}`}>
                      {status.label}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {status.count} · {pct}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${color.split(" ")[0]}`}
                      style={{ width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
