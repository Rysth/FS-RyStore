import { useEffect, useReducer, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  GripVertical,
  ImageOff,
  Loader2,
  Plus,
  Star,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import {
  TableEmptyRow,
  TableLoadingRow,
} from "../../../components/common/TableStates";
import { useAuthStore } from "../../../stores/authStore";
import { useCategoryStore } from "../../../stores/categoryStore";
import { Permissions } from "../../../types/auth";
import type { Category } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

interface CategoriesState {
  formOpen: boolean;
  deleteOpen: boolean;
  selected: Category | null;
}

type CategoriesAction =
  | { type: "OPEN_CREATE" }
  | { type: "OPEN_UPDATE"; payload: Category }
  | { type: "OPEN_DELETE"; payload: Category }
  | { type: "CLOSE" };

const initialState: CategoriesState = {
  formOpen: false,
  deleteOpen: false,
  selected: null,
};

function categoriesReducer(
  state: CategoriesState,
  action: CategoriesAction,
): CategoriesState {
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

interface CategoryFormValues {
  name: string;
  active: boolean;
  featured: boolean;
  image: FileList | null;
}

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export default function CategoriesIndex() {
  const { hasPermission } = useAuthStore();
  const {
    categories,
    isLoading,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  } = useCategoryStore();

  const [state, dispatch] = useReducer(categoriesReducer, initialState);
  const [confirmName, setConfirmName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [rows, setRows] = useState<Category[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canManage = hasPermission(Permissions.MANAGE_CATALOG);

  const form = useForm<CategoryFormValues>({
    defaultValues: { name: "", active: true, featured: false, image: null },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    fetchCategories().catch((error) =>
      toast.error(errorMessage(error, "Ocurrió un error inesperado")),
    );
  }, [fetchCategories]);

  // Local copy so a drag can be applied optimistically and rolled back.
  useEffect(() => {
    setRows(categories);
  }, [categories]);

  useEffect(() => {
    if (!state.formOpen) return;
    form.reset({
      name: state.selected?.name || "",
      active: state.selected ? state.selected.active : true,
      featured: state.selected ? state.selected.featured : false,
      image: null,
    });
    setPreview(state.selected?.image_url || null);
    setRemoveImage(false);
  }, [state.formOpen, state.selected, form]);

  const imageRegister = form.register("image", {
    validate: {
      fileSize: (files) =>
        !files || files.length === 0
          ? true
          : files[0].size > 2 * 1024 * 1024
            ? "La imagen debe ser menor a 2MB"
            : true,
      fileType: (files) =>
        !files || files.length === 0
          ? true
          : ACCEPTED_IMAGE_TYPES.includes(files[0].type)
            ? true
            : "Solo se permiten archivos JPG, PNG o WEBP",
    },
  });

  const imageFile = form.watch("image");
  useEffect(() => {
    if (imageFile && imageFile.length > 0) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(imageFile[0]);
      setRemoveImage(false);
    }
  }, [imageFile]);

  const onSubmit = async (values: CategoryFormValues) => {
    const file = values.image && values.image.length > 0 ? values.image[0] : null;

    // Only pay the multipart cost when there is actually a file to move.
    let payload: FormData | { name: string; active: boolean; featured: boolean };
    if (file || removeImage) {
      const formData = new FormData();
      formData.append("category[name]", values.name.trim());
      formData.append("category[active]", String(values.active));
      formData.append("category[featured]", String(values.featured));
      if (file) formData.append("image", file);
      if (removeImage) formData.append("remove_image", "true");
      payload = formData;
    } else {
      payload = {
        name: values.name.trim(),
        active: values.active,
        featured: values.featured,
      };
    }

    try {
      if (state.selected) {
        await updateCategory(state.selected.id, payload);
        toast.success("Categoría actualizada correctamente");
      } else {
        await createCategory(payload);
        toast.success("Categoría creada correctamente");
      }
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "Error al guardar la categoría"));
    }
  };

  const handleDelete = async () => {
    if (!state.selected) return;
    try {
      await deleteCategory(state.selected.id);
      toast.success("Categoría eliminada correctamente");
      dispatch({ type: "CLOSE" });
      setConfirmName("");
    } catch (error) {
      toast.error(errorMessage(error, "Error al eliminar la categoría"));
    }
  };

  const handleToggleFeatured = async (category: Category) => {
    try {
      await updateCategory(category.id, {
        name: category.name,
        active: category.active,
        featured: !category.featured,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Error al actualizar la categoría"));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const previous = rows;
    const oldIndex = rows.findIndex((row) => row.id === active.id);
    const newIndex = rows.findIndex((row) => row.id === over.id);
    const reordered = arrayMove(rows, oldIndex, newIndex);

    setRows(reordered);
    setIsReordering(true);

    try {
      await reorderCategories(reordered.map((row) => row.id));
      toast.success("Orden actualizado");
    } catch (error) {
      setRows(previous);
      toast.error(errorMessage(error, "Error al reordenar las categorías"));
    } finally {
      setIsReordering(false);
    }
  };

  const columnCount = canManage ? 6 : 4;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías"
        description="Organiza tu catálogo. Arrastra para cambiar el orden en la tienda y marca como destacadas las que aparecen en las burbujas."
        actions={
          canManage && (
            <Button onClick={() => dispatch({ type: "OPEN_CREATE" })}>
              <Plus className="mr-2 size-4" />
              Nueva categoría
            </Button>
          )
        }
      />

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && <TableHead className="w-10" />}
                  <TableHead className="w-16">Imagen</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Estado</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Acciones</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && rows.length === 0 ? (
                  <TableLoadingRow
                    colSpan={columnCount}
                    label="Cargando categorías..."
                  />
                ) : rows.length === 0 ? (
                  <TableEmptyRow
                    colSpan={columnCount}
                    icon={Tags}
                    title="Aún no has creado categorías."
                    description="Las categorías agrupan tu catálogo y son las burbujas que ve el cliente."
                    action={
                      canManage ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => dispatch({ type: "OPEN_CREATE" })}
                        >
                          <Plus className="mr-2 size-4" />
                          Crear primera categoría
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <SortableContext
                    items={rows.map((row) => row.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {rows.map((category) => (
                      <SortableCategoryRow
                        key={category.id}
                        category={category}
                        canManage={canManage}
                        isReordering={isReordering}
                        onEdit={() =>
                          dispatch({ type: "OPEN_UPDATE", payload: category })
                        }
                        onDelete={() => {
                          setConfirmName("");
                          dispatch({ type: "OPEN_DELETE", payload: category });
                        }}
                        onToggleFeatured={() => handleToggleFeatured(category)}
                      />
                    ))}
                  </SortableContext>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </CardContent>
      </Card>

      {/* Create / Update */}
      <Dialog
        open={state.formOpen}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {state.selected ? "Editar categoría" : "Nueva categoría"}
            </DialogTitle>
            <DialogDescription>
              Las categorías ocultas no se muestran en la tienda.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Nombre *</Label>
              <Input
                id="category-name"
                placeholder="Ropa, Accesorios, Cosméticos..."
                {...form.register("name", {
                  required: "El nombre es requerido",
                  maxLength: { value: 60, message: "Máximo 60 caracteres" },
                })}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Imagen de la burbuja</Label>
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
                  className="group relative flex size-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary/50"
                >
                  {preview && !removeImage ? (
                    <>
                      <img
                        src={preview}
                        alt="Vista previa"
                        className="size-full object-cover"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Upload className="mb-0.5 size-4 text-white" />
                        <span className="text-[10px] font-medium text-white">
                          Cambiar
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="px-2 text-center text-muted-foreground">
                      <Upload className="mx-auto mb-0.5 size-4" />
                      <p className="text-[10px]">Subir</p>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    Se muestra como círculo arriba del catálogo. JPG, PNG o WEBP,
                    máximo 2MB.
                  </p>
                  {state.selected?.image_url && !removeImage && (
                    <button
                      type="button"
                      className="text-[11px] text-destructive underline"
                      onClick={() => {
                        setRemoveImage(true);
                        setPreview(null);
                        form.setValue("image", null);
                      }}
                    >
                      Quitar imagen
                    </button>
                  )}
                  {removeImage && (
                    <p className="text-[11px] text-muted-foreground">
                      La imagen se quitará al guardar.
                    </p>
                  )}
                </div>
              </div>

              {/* Register once and fan the parts out by hand, so the local ref
                  can coexist with RHF's — same as BusinessSettings.tsx. */}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                name={imageRegister.name}
                onChange={imageRegister.onChange}
                onBlur={imageRegister.onBlur}
                ref={(element) => {
                  fileInputRef.current = element;
                  imageRegister.ref(element);
                }}
              />
              {form.formState.errors.image && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.image.message as string}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                {...form.register("active")}
              />
              Visible en la tienda
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                {...form.register("featured")}
              />
              Destacada en las burbujas del catálogo
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
                {state.selected ? "Guardar cambios" : "Crear categoría"}
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
              Eliminar categoría
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los productos de esta categoría no se eliminan, pero quedarán
                  sin categoría. Escribe{" "}
                  <span className="font-semibold text-foreground">
                    {state.selected?.name}
                  </span>{" "}
                  para confirmar.
                </p>
                <Input
                  value={confirmName}
                  onChange={(event) => setConfirmName(event.target.value)}
                  placeholder={state.selected?.name}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => dispatch({ type: "CLOSE" })}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={confirmName !== state.selected?.name || isLoading}
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

interface SortableRowProps {
  category: Category;
  canManage: boolean;
  isReordering: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFeatured: () => void;
}

function SortableCategoryRow({
  category,
  canManage,
  isReordering,
  onEdit,
  onDelete,
  onToggleFeatured,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id, disabled: !canManage });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 bg-muted" : undefined}
    >
      {canManage && (
        <TableCell className="w-10">
          <button
            type="button"
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:opacity-40"
            disabled={isReordering}
            aria-label={`Reordenar ${category.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        </TableCell>
      )}

      <TableCell>
        {category.image_url ? (
          <img
            src={category.image_url}
            alt={category.name}
            className="size-10 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImageOff className="size-4" />
          </span>
        )}
      </TableCell>

      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{category.name}</span>
          <span className="text-xs text-muted-foreground">/{category.slug}</span>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        {category.products_count ?? 0}
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={category.active ? "default" : "secondary"}>
            {category.active ? "Activa" : "Oculta"}
          </Badge>
          {category.featured && (
            <Badge variant="outline" className="gap-1">
              <Star className="size-3 fill-current" />
              Destacada
            </Badge>
          )}
        </div>
      </TableCell>

      {canManage && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onToggleFeatured}
              aria-label={
                category.featured
                  ? `Quitar ${category.name} de destacadas`
                  : `Destacar ${category.name}`
              }
              title={category.featured ? "Quitar de destacadas" : "Destacar"}
            >
              <Star
                className={`size-4 ${category.featured ? "fill-current text-amber-500" : "text-muted-foreground"}`}
              />
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              aria-label={`Eliminar ${category.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
