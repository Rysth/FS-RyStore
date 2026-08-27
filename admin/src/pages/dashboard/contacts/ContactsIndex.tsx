import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCustomerStore } from "../../../stores/customerStore";
import { Permissions } from "../../../types/auth";
import { formatPrice } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

const COLUMN_COUNT = 4;

interface ContactFormValues {
  name: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
}

const EMPTY_FORM: ContactFormValues = {
  name: "",
  phone: "",
  address: "",
  city: "",
  notes: "",
};

export default function ContactsIndex() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const { customers, pagination, isLoading, fetchCustomers, createCustomer } =
    useCustomerStore();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const canManage = hasPermission(Permissions.MANAGE_CONTACTS);

  const form = useForm<ContactFormValues>({ defaultValues: EMPTY_FORM });

  useEffect(() => {
    fetchCustomers(1, search).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  }, [fetchCustomers, search]);

  useEffect(() => {
    if (formOpen) form.reset(EMPTY_FORM);
  }, [formOpen, form]);

  const handlePageChange = ({ selected }: { selected: number }) => {
    fetchCustomers(selected + 1, search).catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  };

  const onSubmit = async (values: ContactFormValues) => {
    setIsCreating(true);
    try {
      const customer = await createCustomer({
        name: values.name.trim() || undefined,
        phone: values.phone.trim(),
        address: values.address.trim() || undefined,
        city: values.city.trim() || undefined,
        notes: values.notes.trim() || undefined,
      });
      toast.success("Contacto creado correctamente");
      setFormOpen(false);
      navigate(`/dashboard/contacts/${customer.id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Error al crear el contacto"));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contactos"
        description="Los clientes que han comprado en tu tienda, agrupados por teléfono."
        actions={
          canManage && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 size-4" />
              Nuevo contacto
            </Button>
          )
        }
      />

      <SearchBar
        placeholder="Buscar por nombre o teléfono..."
        value={search}
        onSearch={setSearch}
        className="w-full sm:max-w-sm"
      />

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead className="text-right">Total gastado</TableHead>
                <TableHead>Última compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && customers.length === 0 ? (
                <TableLoadingRow colSpan={COLUMN_COUNT} label="Cargando contactos..." />
              ) : customers.length === 0 ? (
                <TableEmptyRow
                  colSpan={COLUMN_COUNT}
                  icon={Users}
                  title={
                    search
                      ? "Ningún contacto coincide con la búsqueda."
                      : "Aún no tienes contactos."
                  }
                  description={
                    search
                      ? undefined
                      : "Cada pedido crea o actualiza el contacto de ese teléfono."
                  }
                  action={
                    !search && canManage ? (
                      <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                        <Plus className="mr-2 size-4" />
                        Crear primer contacto
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    onClick={() => navigate(`/dashboard/contacts/${customer.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {customer.name || "Sin nombre"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {customer.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {customer.orders_count}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatPrice(customer.total_spent)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {customer.last_order_at
                        ? new Date(customer.last_order_at).toLocaleDateString("es-EC", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo contacto</DialogTitle>
            <DialogDescription>
              Úsalo para un cliente que todavía no ha hecho un pedido. Si ese
              teléfono ya compra en tu tienda, se vinculará solo la próxima vez.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contact-new-phone">Teléfono *</Label>
              <Input
                id="contact-new-phone"
                placeholder="0987654321"
                {...form.register("phone", {
                  required: "El teléfono es requerido",
                  pattern: {
                    value: /^\+?[\d\s-]{7,20}$/,
                    message: "Ingresa un teléfono válido",
                  },
                })}
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-new-name">Nombre</Label>
              <Input
                id="contact-new-name"
                {...form.register("name", { maxLength: 120 })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-new-address">Dirección</Label>
                <Input id="contact-new-address" {...form.register("address")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-new-city">Ciudad</Label>
                <Input id="contact-new-city" {...form.register("city")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-new-notes">Notas</Label>
              <Textarea id="contact-new-notes" rows={2} {...form.register("notes", { maxLength: 1000 })} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating && <Loader2 className="mr-2 size-4 animate-spin" />}
                Crear contacto
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
