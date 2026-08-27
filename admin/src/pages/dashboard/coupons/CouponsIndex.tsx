import { useEffect, useReducer, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "../../../components/common/PageHeader";
import SearchBar from "../../../components/common/SearchBar";
import Pagination from "../../../components/common/Pagination";
import {
  TableEmptyRow,
  TableLoadingRow,
} from "../../../components/common/TableStates";
import { useAuthStore } from "../../../stores/authStore";
import { useCouponStore, type CouponFormData } from "../../../stores/couponStore";
import { Permissions } from "../../../types/auth";
import { formatPrice, type Coupon } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

const COLUMN_COUNT = 6;

interface CouponsState {
  formOpen: boolean;
  deleteOpen: boolean;
  selected: Coupon | null;
}

type CouponsAction =
  | { type: "OPEN_CREATE" }
  | { type: "OPEN_UPDATE"; payload: Coupon }
  | { type: "OPEN_DELETE"; payload: Coupon }
  | { type: "CLOSE" };

const initialState: CouponsState = {
  formOpen: false,
  deleteOpen: false,
  selected: null,
};

function couponsReducer(state: CouponsState, action: CouponsAction): CouponsState {
  switch (action.type) {
    case "OPEN_CREATE":
      return { formOpen: true, deleteOpen: false, selected: null };
    case "OPEN_UPDATE":
      return { formOpen: true, deleteOpen: false, selected: action.payload };
    case "OPEN_DELETE":
      return { formOpen: false, deleteOpen: true, selected: action.payload };
    case "CLOSE":
      return initialState;
    default:
      return state;
  }
}

interface CouponFormValues {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  active: boolean;
  starts_at: string;
  expires_at: string;
  usage_limit: string;
  min_order_total: string;
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export default function CouponsIndex() {
  const { hasPermission } = useAuthStore();
  const { coupons, pagination, isLoading, fetchCoupons, createCoupon, updateCoupon, deleteCoupon } =
    useCouponStore();

  const [state, dispatch] = useReducer(couponsReducer, initialState);
  const [search, setSearch] = useState("");
  const canManage = hasPermission(Permissions.MANAGE_COUPONS);

  const form = useForm<CouponFormValues>({
    defaultValues: {
      code: "",
      discount_type: "percentage",
      discount_value: "",
      active: true,
      starts_at: "",
      expires_at: "",
      usage_limit: "",
      min_order_total: "",
    },
  });

  useEffect(() => {
    fetchCoupons(1, search).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  }, [fetchCoupons, search]);

  useEffect(() => {
    if (!state.formOpen) return;
    const coupon = state.selected;
    form.reset({
      code: coupon?.code || "",
      discount_type: coupon?.discount_type || "percentage",
      discount_value: coupon?.discount_value || "",
      active: coupon ? coupon.active : true,
      starts_at: toDateInput(coupon?.starts_at ?? null),
      expires_at: toDateInput(coupon?.expires_at ?? null),
      usage_limit: coupon?.usage_limit ? String(coupon.usage_limit) : "",
      min_order_total: coupon?.min_order_total || "",
    });
  }, [state.formOpen, state.selected, form]);

  const handlePageChange = ({ selected }: { selected: number }) => {
    fetchCoupons(selected + 1, search).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  };

  const onSubmit = async (values: CouponFormValues) => {
    const payload: CouponFormData = {
      code: values.code.trim(),
      discount_type: values.discount_type,
      discount_value: Number(values.discount_value),
      active: values.active,
      starts_at: values.starts_at || null,
      expires_at: values.expires_at || null,
      usage_limit: values.usage_limit ? Number(values.usage_limit) : null,
      min_order_total: values.min_order_total ? Number(values.min_order_total) : null,
    };

    try {
      if (state.selected) {
        await updateCoupon(state.selected.id, payload);
        toast.success("Cupón actualizado correctamente");
      } else {
        await createCoupon(payload);
        toast.success("Cupón creado correctamente");
      }
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "Error al guardar el cupón"));
    }
  };

  const handleDelete = async () => {
    if (!state.selected) return;
    try {
      await deleteCoupon(state.selected.id);
      toast.success("Cupón eliminado correctamente");
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "Error al eliminar el cupón"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cupones"
        description="Crea códigos de descuento para tus campañas en redes sociales."
        actions={
          canManage && (
            <Button onClick={() => dispatch({ type: "OPEN_CREATE" })}>
              <Plus className="mr-2 size-4" />
              Nuevo cupón
            </Button>
          )
        }
      />

      <SearchBar
        placeholder="Buscar por código..."
        value={search}
        onSearch={setSearch}
        className="w-full sm:max-w-sm"
      />

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && coupons.length === 0 ? (
                <TableLoadingRow colSpan={COLUMN_COUNT} label="Cargando cupones..." />
              ) : coupons.length === 0 ? (
                <TableEmptyRow
                  colSpan={COLUMN_COUNT}
                  icon={Tag}
                  title={search ? "Ningún cupón coincide con la búsqueda." : "Aún no has creado cupones."}
                  description={
                    search ? undefined : "Los cupones aplican un descuento en el checkout de la tienda."
                  }
                  action={
                    !search && canManage ? (
                      <Button variant="outline" size="sm" onClick={() => dispatch({ type: "OPEN_CREATE" })}>
                        <Plus className="mr-2 size-4" />
                        Crear primer cupón
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                coupons.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-medium">{coupon.code}</TableCell>
                    <TableCell>
                      {coupon.discount_type === "percentage"
                        ? `${Number(coupon.discount_value)}%`
                        : formatPrice(coupon.discount_value)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {coupon.expires_at
                        ? `Hasta ${new Date(coupon.expires_at).toLocaleDateString("es-EC")}`
                        : "Sin vencimiento"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {coupon.usage_count}
                      {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={coupon.active ? "default" : "secondary"}>
                        {coupon.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => dispatch({ type: "OPEN_UPDATE", payload: coupon })}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            onClick={() => dispatch({ type: "OPEN_DELETE", payload: coupon })}
                            aria-label={`Eliminar ${coupon.code}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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

      <Dialog open={state.formOpen} onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{state.selected ? "Editar cupón" : "Nuevo cupón"}</DialogTitle>
            <DialogDescription>
              El código se guarda en mayúsculas y el cliente lo escribe al pagar.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Código *</Label>
              <Input
                id="coupon-code"
                placeholder="INSTA10"
                className="uppercase"
                {...form.register("code", {
                  required: "El código es requerido",
                  maxLength: { value: 40, message: "Máximo 40 caracteres" },
                })}
              />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-type">Tipo de descuento</Label>
                <select
                  id="coupon-type"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("discount_type")}
                >
                  <option value="percentage">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="coupon-value">
                  Valor * {form.watch("discount_type") === "percentage" ? "(%)" : "($)"}
                </Label>
                <Input
                  id="coupon-value"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("discount_value", { required: "El valor es requerido" })}
                />
                {form.formState.errors.discount_value && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.discount_value.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-starts">Desde</Label>
                <Input id="coupon-starts" type="date" {...form.register("starts_at")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-expires">Hasta</Label>
                <Input id="coupon-expires" type="date" {...form.register("expires_at")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-usage-limit">Límite de usos</Label>
                <Input
                  id="coupon-usage-limit"
                  type="number"
                  min="1"
                  placeholder="Ilimitado"
                  {...form.register("usage_limit")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-min-order">Compra mínima ($)</Label>
                <Input
                  id="coupon-min-order"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Sin mínimo"
                  {...form.register("min_order_total")}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                {...form.register("active")}
              />
              Activo
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => dispatch({ type: "CLOSE" })}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {state.selected ? "Guardar cambios" : "Crear cupón"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={state.deleteOpen} onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Eliminar cupón</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el cupón <span className="font-semibold text-foreground">{state.selected?.code}</span>.
              Los pedidos que ya lo usaron conservan su descuento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => dispatch({ type: "CLOSE" })}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
