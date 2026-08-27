import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

interface RecentUser {
  id: number;
  fullname: string;
  username: string;
  email: string;
  roles: string[];
  verified: boolean;
  created_at: string;
}

interface RecentUsersListProps {
  users: RecentUser[];
  timeAgo: (iso: string) => string;
}

export function RecentUsersList({ users, timeAgo }: RecentUsersListProps) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Usuarios recientes</CardTitle>
          <span className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            Ver todos
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay usuarios recientes
            </p>
          ) : (
            users.map((u) => {
              const initials = u.fullname
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              // Consistent avatar color based on fullname
              const colors = [
                "bg-emerald-100 text-emerald-700",
                "bg-amber-100 text-amber-700",
                "bg-violet-100 text-violet-700",
                "bg-rose-100 text-rose-700",
                "bg-sky-100 text-sky-700",
              ];
              const colorIdx = u.fullname.length % colors.length;
              const avatarColor = colors[colorIdx];

              return (
                <div key={u.id} className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarColor}`}
                  >
                    <span className="text-xs font-bold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.fullname}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {u.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {u.verified ? (
                          <Badge
                            variant="outline"
                            className="gap-1 text-emerald-600 text-xs px-1.5 py-0"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Verificado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 text-amber-600 text-xs px-1.5 py-0"
                          >
                            <XCircle className="w-3 h-3" />
                            Pendiente
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(u.created_at)}
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
