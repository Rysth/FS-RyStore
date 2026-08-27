import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, CheckCircle2, XCircle } from "lucide-react";

export interface Activity {
  id: string;
  type: "new_order" | "delivered" | "cancelled";
  title: string;
  description: string;
  time: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const iconMap = {
  new_order: { icon: ShoppingCart, bg: "bg-emerald-50", color: "text-emerald-600" },
  delivered: { icon: CheckCircle2, bg: "bg-teal-50", color: "text-teal-600" },
  cancelled: { icon: XCircle, bg: "bg-rose-50", color: "text-rose-600" },
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Actividad reciente</CardTitle>
          <span className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            Ver todo
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin actividad reciente
            </p>
          ) : (
            activities.map((activity) => {
              const config = iconMap[activity.type];
              const Icon = config.icon;
              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">
                          {activity.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {activity.description}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                        {activity.time}
                      </span>
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
