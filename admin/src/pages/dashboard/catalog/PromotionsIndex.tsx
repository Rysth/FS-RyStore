import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Gift,
  ImageOff,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  TableEmptyRow,
  TableLoadingRow,
} from "../../../components/common/TableStates";
import { useAuthStore } from "../../../stores/authStore";
import { useProductStore } from "../../../stores/productStore";
import { usePromotionStore } from "../../../stores/promotionStore";
import { Permissions } from "../../../types/auth";
import { formatPrice, type Product, type Promotion } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

// Mirrors Promotion::MIN_ITEMS / MAX_ITEMS on the server. Kept here too so the
// shop is told before a round trip, not after one.
const MIN_ITEMS = 2;
const MAX_ITEMS = 6;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface PromotionsState {
  formOpen: boolean;
  deleteOpen: boolean;
  selected: Promotion | null;
}

type PromotionsAction =
  | { type: "OPEN_CREATE" }
  | { type: "OPEN_UPDATE"; payload: Promotion }
  | { type: "OPEN_DELETE"; payload: Promotion }
  | { type: "CLOSE" };

const initialState: PromotionsState = {
  formOpen: false,
  deleteOpen: false,
  selected: null,
};

function promotionsReducer(
  state: PromotionsState,
  action: PromotionsAction,
): PromotionsState {
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

interface PromotionFormValues {
  name: string;
  description: string;
  price: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
}

/** One chosen product plus how many units of it the combo includes. */
interface PickedItem {
  product_id: number;
  name: string;
  price: string;
  image_url: string | null;
  quantity: number;
}

const EMPTY_VALUES: PromotionFormValues = {
  name: "",
  description: "",
  price: "",
  active: true,
  starts_at: "",
  ends_at: "",
};

/** The API sends ISO timestamps; <input type="datetime-local"> wants no zone. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function PromotionsIndex() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission(Permissions.MANAGE_CATALOG);

  const {
    promotions,
    isLoading,
    fetchPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    uploadPromotionImage,
    removePromotionImage,
  } = usePromotionStore();
  const { products, fetchProducts } = useProductStore();

  const [state, dispatch] = useReducer(promotionsReducer, initialState);
  const [items, setItems] = useState<PickedItem[]>([]);
  const [search, setSearch] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<PromotionFormValues>({ defaultValues: EMPTY_VALUES });

  useEffect(() => {
    void fetchPromotions().catch(() => undefined);
  }, [fetchPromotions]);

  // The picker searches the catalog server-side rather than filtering a page of
  // it in memory: a shop with 300 products would otherwise only ever find the
  // first twelve.
  useEffect(() => {
    if (!state.formOpen) return;

    const timer = setTimeout(() => {
      void fetchProducts(1, 20, {
        search: search.trim() || undefined,
        active: "true",
      }).catch(() => undefined);
    }, 250);

    return () => clearTimeout(timer);
  }, [state.formOpen, search, fetchProducts]);

  useEffect(() => {
    if (!state.formOpen) return;

    const promotion = state.selected;
    form.reset(
      promotion
        ? {
            name: promotion.name,
            description: promotion.description ?? "",
            price: promotion.price,
            active: promotion.active,
            starts_at: toLocalInput(promotion.starts_at),
            ends_at: toLocalInput(promotion.ends_at),
          }
        : EMPTY_VALUES,
    );
    setItems(
      promotion
        ? promotion.items.map((item) => ({
            product_id: item.product_id,
            name: item.product_name ?? "Producto eliminado",
            price: item.product_price ?? "0",
            image_url: item.image_url,
            quantity: item.quantity,
          }))
        : [],
    );
    setSearch("");
  }, [state.formOpen, state.selected, form]);

  // What the bundle costs at list price, so the shop sees the discount it is
  // about to give while it types the combo price.
  const regularTotal = useMemo(
    () =>
      items.reduce(
        (total, item) => total + Number(item.price || 0) * item.quantity,
        0,
      ),
    [items],
  );

  const comboPrice = Number(form.watch("price") || 0);
  const savings = regularTotal - comboPrice;

  function addProduct(product: Product) {
    setItems((current) => {
      if (current.some((item) => item.product_id === product.id)) return current;
      if (current.length >= MAX_ITEMS) {
        toast.error(`Un combo no puede tener más de ${MAX_ITEMS} productos`);
        return current;
      }
      // A product sold in sizes or colours has no single thing to put in the
      // bundle, and the combo card has nowhere to ask which one — the server
      // refuses these too.
      if (product.option_types?.length) {
        toast.error(`${product.name} tiene variantes y no puede ir en un combo`);
        return current;
      }

      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          quantity: 1,
        },
      ];
    });
  }

  function setItemQuantity(productId: number, quantity: number) {
    setItems((current) =>
      current.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) }
          : item,
      ),
    );
  }

  function removeItem(productId: number) {
    setItems((current) => current.filter((item) => item.product_id !== productId));
  }

  const onSubmit = async (values: PromotionFormValues) => {
    if (items.length < MIN_ITEMS) {
      toast.error(`Elige al menos ${MIN_ITEMS} productos para el combo`);
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      price: values.price,
      active: values.active,
      // Empty means "no window", which the API stores as null.
      starts_at: values.starts_at || null,
      ends_at: values.ends_at || null,
      items: items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      })),
    };

    try {
      if (state.selected) {
        await updatePromotion(state.selected.id, payload);
        toast.success("Combo actualizado correctamente");
      } else {
        await createPromotion(payload);
        toast.success("Combo creado correctamente");
      }
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar el combo"));
    }
  };

  async function handleImage(fileList: FileList | null) {
    const file = fileList?.[0];
    const promotion = state.selected;
    if (!file || !promotion) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("La imagen debe ser JPG, PNG o WEBP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen debe ser menor a 2MB");
      return;
    }

    setImageBusy(true);
    try {
      const updated = await uploadPromotionImage(promotion.id, file);
      dispatch({ type: "OPEN_UPDATE", payload: updated });
      toast.success("Imagen actualizada");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo subir la imagen"));
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveImage() {
    const promotion = state.selected;
    if (!promotion) return;

    setImageBusy(true);
    try {
      const updated = await removePromotionImage(promotion.id);
      dispatch({ type: "OPEN_UPDATE", payload: updated });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo quitar la imagen"));
    } finally {
      setImageBusy(false);
    }
  }

  const handleDelete = async () => {
    if (!state.selected) return;

    try {
      await deletePromotion(state.selected.id);
      toast.success("Combo eliminado correctamente");
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo eliminar el combo"));
    }
  };

  const pickedIds = new Set(items.map((item) => item.product_id));
  const columnCount = canManage ? 6 : 5;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Combos y promociones"
        description="Junta varios productos y véndelos a un precio especial. Los combos activos aparecen destacados al inicio de la tienda."
        actions={
          canManage && (
            <Button onClick={() => dispatch({ type: "OPEN_CREATE" })}>
              <Plus className="mr-2 size-4" />
              Nuevo combo
            </Button>
          )
        }
      />

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Imagen</TableHead>
                <TableHead>Combo</TableHead>
                <TableHead>Incluye</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && (
                  <TableHead className="text-right">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && promotions.length === 0 ? (
                <TableLoadingRow colSpan={columnCount} label="Cargando combos..." />
              ) : promotions.length === 0 ? (
                <TableEmptyRow
                  colSpan={columnCount}
                  icon={Gift}
                  title="Aún no has creado combos."
                  description="Un combo junta productos distintos a un precio especial y se destaca en la página principal de la tienda."
                  action={
                    canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => dispatch({ type: "OPEN_CREATE" })}
                      >
                        <Plus className="mr-2 size-4" />
                        Crear primer combo
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                promotions.map((promotion) => (
                  <TableRow key={promotion.id}>
                    <TableCell>
                      {promotion.image_url ? (
                        <img
                          src={promotion.image_url}
                          alt={promotion.name}
                          className="size-10 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ImageOff className="size-4" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{promotion.name}</p>
                      {promotion.ends_at && (
                        <p className="text-xs text-muted-foreground">
                          Hasta el{" "}
                          {new Date(promotion.ends_at).toLocaleDateString("es-EC")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="truncate text-sm text-muted-foreground">
                        {promotion.items
                          .map((item) => `${item.product_name} x${item.quantity}`)
                          .join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold">
                          {formatPrice(promotion.price)}
                        </span>
                        {Number(promotion.savings) > 0 && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(promotion.regular_total)}
                          </span>
                        )}
                      </div>
                      {promotion.discount_percent > 0 && (
                        <span className="text-xs text-emerald-600">
                          -{promotion.discount_percent}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* `live` and `active` differ while a combo is switched on
                          but outside its dates — the shop needs to see which. */}
                      {promotion.live ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          En la tienda
                        </Badge>
                      ) : promotion.active ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Fuera de fecha
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Oculto</Badge>
                      )}
                      {promotion.available_units != null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {promotion.available_units} disponibles
                        </p>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            dispatch({ type: "OPEN_UPDATE", payload: promotion })
                          }
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            dispatch({ type: "OPEN_DELETE", payload: promotion })
                          }
                          aria-label={`Eliminar ${promotion.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Update */}
      <Dialog
        open={state.formOpen}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {state.selected ? "Editar combo" : "Nuevo combo"}
            </DialogTitle>
            <DialogDescription>
              Elige los productos, ponle un precio al conjunto y el combo se
              destaca al inicio de la tienda.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="promotion-name">Nombre *</Label>
              <Input
                id="promotion-name"
                placeholder="Combo cuidado facial"
                {...form.register("name", {
                  required: "El nombre es requerido",
                  maxLength: { value: 80, message: "Máximo 80 caracteres" },
                })}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="promotion-description">Descripción</Label>
              <Textarea
                id="promotion-description"
                rows={2}
                placeholder="Todo lo que necesitas para tu rutina de noche."
                {...form.register("description", {
                  maxLength: { value: 600, message: "Máximo 600 caracteres" },
                })}
              />
              {form.formState.errors.description && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Product picker */}
            <div className="space-y-2">
              <Label>Productos del combo *</Label>

              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Todavía no has elegido productos. Un combo necesita al menos{" "}
                  {MIN_ITEMS}.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.product_id}
                      className="flex items-center gap-2 rounded-lg border border-border p-2"
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="size-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ImageOff className="size-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(item.price)} c/u
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() =>
                            setItemQuantity(item.product_id, item.quantity - 1)
                          }
                          aria-label={`Quitar una unidad de ${item.name}`}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() =>
                            setItemQuantity(item.product_id, item.quantity + 1)
                          }
                          aria-label={`Agregar una unidad de ${item.name}`}
                        >
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.product_id)}
                          aria-label={`Sacar ${item.name} del combo`}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar productos para agregar..."
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <ul className="max-h-44 overflow-y-auto">
                  {products.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-muted-foreground">
                      No encontramos productos con ese nombre.
                    </li>
                  ) : (
                    products.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          disabled={pickedIds.has(product.id)}
                          onClick={() => addProduct(product)}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"
                        >
                          <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">
                            {product.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatPrice(product.price)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="promotion-price">Precio del combo *</Label>
                <Input
                  id="promotion-price"
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register("price", {
                    required: "El precio es requerido",
                    min: { value: 0, message: "Debe ser mayor o igual a 0" },
                  })}
                />
                {form.formState.errors.price && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.price.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Por separado costaría</Label>
                <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm">
                  <span className="font-medium">{formatPrice(regularTotal)}</span>
                  {savings > 0 && comboPrice > 0 && (
                    <span className="text-xs text-emerald-600">
                      ahorra {formatPrice(savings)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="promotion-starts">Desde (opcional)</Label>
                <Input
                  id="promotion-starts"
                  type="datetime-local"
                  {...form.register("starts_at")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promotion-ends">Hasta (opcional)</Label>
                <Input
                  id="promotion-ends"
                  type="datetime-local"
                  {...form.register("ends_at")}
                />
              </div>
            </div>

            {/* The picture needs a promotion id to attach to, so it appears once
                the combo exists — same rule as a product's gallery. */}
            {state.selected ? (
              <div className="space-y-1.5">
                <Label>Imagen del combo</Label>
                <div className="flex items-center gap-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    className="group relative flex size-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 hover:border-primary/50"
                  >
                    {state.selected.image_url ? (
                      <img
                        src={state.selected.image_url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <Upload className="mx-auto mb-0.5 size-4" />
                        <p className="text-[10px]">Subir</p>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      Opcional. Sin imagen propia, la tienda muestra la foto del
                      primer producto del combo. JPG, PNG o WEBP, máximo 2MB.
                    </p>
                    {imageBusy && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    {state.selected.image_url && !imageBusy && (
                      <button
                        type="button"
                        className="text-[11px] text-destructive underline"
                        onClick={() => void handleRemoveImage()}
                      >
                        Quitar imagen
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => void handleImage(event.target.files)}
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Podrás subir una imagen propia del combo después de crearlo.
              </p>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                {...form.register("active")}
              />
              Visible en la tienda
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => dispatch({ type: "CLOSE" })}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {state.selected ? "Guardar cambios" : "Crear combo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog
        open={state.deleteOpen}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Eliminar combo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina «{state.selected?.name}» de la tienda. Los productos que
              lo componen no se tocan, y los pedidos que ya lo compraron
              conservan su detalle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => dispatch({ type: "CLOSE" })}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
