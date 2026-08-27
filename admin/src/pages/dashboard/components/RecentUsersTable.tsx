import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, CheckCircle2, XCircle } from "lucide-react";

interface RecentUser {
  id: number;
  fullname: string;
  username: string;
  email: string;
  roles: string[];
  verified: boolean;
  created_at: string;
}

interface RecentUsersTableProps {
  recentUsers: RecentUser[];
  usersThisMonth: number;
  timeAgo: (iso: string) => string;
}

export function RecentUsersTable({
  recentUsers,
  usersThisMonth,
  timeAgo,
}: RecentUsersTableProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle>Usuarios Recientes</CardTitle>
            <CardDescription className="mt-1">
              Últimos registros en el sistema
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1.5 w-fit">
            <UserPlus className="w-3.5 h-3.5" />
            {usersThisMonth} este mes
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  No hay usuarios registrados
                </TableCell>
              </TableRow>
            ) : (
              recentUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <span className="text-sm font-semibold">
                          {u.fullname
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{u.fullname}</div>
                        <div className="text-xs text-muted-foreground">
                          @{u.username}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((role) => (
                        <Badge key={role} variant="outline">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.verified ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-emerald-600"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Verificado
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-yellow-600"
                      >
                        <XCircle className="w-3 h-3" />
                        Pendiente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timeAgo(u.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Mostrando los últimos {recentUsers.length} usuarios registrados
      </CardFooter>
    </Card>
  );
}
