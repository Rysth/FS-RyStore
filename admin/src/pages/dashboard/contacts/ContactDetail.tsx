import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Loader2, Mail, MapPin, Phone, Receipt, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "../../../components/common/PageHeader";
import { useAuthStore } from "../../../stores/authStore";
import { useCustomerStore } from "../../../stores/customerStore";
import { Permissions } from "../../../types/auth";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatPrice,
} from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

interface ContactFormValues {
  name: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const {
    selectedCustomer: customer,
    selectedCustomerOrders: orders,
    isLoadingDetail,
    fetchCustomer,
    updateCustomer,
  } = useCustomerStore();

  const [isSaving, setIsSaving] = useState(false);
  const canManage = hasPermission(Permissions.MANAGE_CONTACTS);

  const form = useForm<ContactFormValues>({
    defaultValues: { name: "", email: "", address: "", city: "", notes: "" },
  });

  useEffect(() => {
    if (!id) return;
    fetchCustomer(Number(id)).catch((error) => {
      toast.error(errorMessage(error, "Error al cargar el contacto"));
      navigate("/dashboard/contacts");
    });
  }, [id, fetchCustomer, navigate]);

  useEffect(() => {
    if (!customer) return;
    form.reset({
      name: customer.name || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
      notes: customer.notes || "",
    });
  }, [customer, form]);

  const onSubmit = async (values: ContactFormValues) => {
    if (!customer) return;
    setIsSaving(true);
    try {
      await updateCustomer(customer.id, values);
      toast.success("Contacto actualizado correctamente");
    } catch (error) {
      toast.error(errorMessage(error, "Error al actualizar el contacto"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingDetail || !customer || String(customer.id) !== id) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backTo="/dashboard/contacts"
        backLabel="Volver a contactos"
        title={customer.name || "Sin nombre"}
        description={customer.phone}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-xl">
            <CardContent className="space-y-4 pt-6">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Receipt className="size-3.5" />
                Historial de pedidos
              </p>

              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este contacto todavía no tiene pedidos.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
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
                          <Badge className={ORDER_STATUS_STYLES[order.status]}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatPrice(order.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-xl">
            <CardContent className="space-y-4 pt-6">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Phone className="size-3.5" />
                Resumen
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="font-semibold">{customer.orders_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total gastado</p>
                  <p className="font-semibold tabular-nums">
                    {formatPrice(customer.total_spent)}
                  </p>
                </div>
              </div>
              <a
                href={`tel:${customer.phone}`}
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                {customer.phone}
              </a>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardContent className="pt-6">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Nombre</Label>
                  <Input
                    id="contact-name"
                    disabled={!canManage}
                    {...form.register("name", { maxLength: 120 })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">
                    <span className="flex items-center gap-1.5">
                      <Mail className="size-3.5" />
                      Correo electrónico
                    </span>
                  </Label>
                  <Input
                    id="contact-email"
                    type="email"
                    disabled={!canManage}
                    {...form.register("email", {
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Ingresa un correo válido",
                      },
                    })}
                  />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-address">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      Dirección
                    </span>
                  </Label>
                  <Input id="contact-address" disabled={!canManage} {...form.register("address")} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-city">Ciudad</Label>
                  <Input id="contact-city" disabled={!canManage} {...form.register("city")} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-notes">
                    <span className="flex items-center gap-1.5">
                      <StickyNote className="size-3.5" />
                      Notas
                    </span>
                  </Label>
                  <Textarea
                    id="contact-notes"
                    rows={3}
                    disabled={!canManage}
                    {...form.register("notes", { maxLength: 1000 })}
                  />
                </div>

                {canManage && (
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Guardar cambios
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
