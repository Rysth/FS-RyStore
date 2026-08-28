import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ImageOff, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import SearchBar from "../../../components/common/SearchBar";
import Pagination from "../../../components/common/Pagination";
import PageHeader from "../../../components/common/PageHeader";
import {
  TableEmptyRow,
  TableLoadingRow,
} from "../../../components/common/TableStates";
import { useAuthStore } from "../../../stores/authStore";
import { useCategoryStore } from "../../../stores/categoryStore";
import { useProductStore } from "../../../stores/productStore";
import { Permissions } from "../../../types/auth";
import { formatPrice, type Product } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

const PER_PAGE = 12;

interface ProductsState {
  search: string;
  categoryId: string;
  deleteOpen: boolean;
  selected: Product | null;
  selectedIds: number[];
  bulkOpen: boolean;
}

type ProductsAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_CATEGORY"; payload: string }
  | { type: "OPEN_DELETE"; payload: Product }
  | { type: "CLOSE" }
  | { type: "TOGGLE_ID"; payload: number }
  | { type: "SET_IDS"; payload: number[] }
  | { type: "OPEN_BULK" }
  | { type: "CLOSE_BULK" };

const initialState: ProductsState = {
  search: "",
  categoryId: "",
  deleteOpen: false,
  selected: null,
  selectedIds: [],
  bulkOpen: false,
};

function productsReducer(
  state: ProductsState,
  action: ProductsAction,
): ProductsState {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, search: action.payload, selectedIds: [] };
    case "SET_CATEGORY":
      return { ...state, categoryId: action.payload, selectedIds: [] };
    case "OPEN_DELETE":
      return { ...state, deleteOpen: true, selected: action.payload };
    case "CLOSE":
      return { ...state, deleteOpen: false, selected: null };
    case "TOGGLE_ID": {
      const ids = state.selectedIds.includes(action.payload)
        ? state.selectedIds.filter((id) => id !== action.payload)
        : [...state.selectedIds, action.payload];
      return { ...state, selectedIds: ids };
    }
    case "SET_IDS":
      return { ...state, selectedIds: action.payload };
    case "OPEN_BULK":
      return { ...state, bulkOpen: true };
    case "CLOSE_BULK":
      return { ...state, bulkOpen: false };
    default:
      return state;
  }
}

export default function ProductsIndex() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const { products, pagination, isLoading, fetchProducts, deleteProduct, bulkUpdateProducts } =
    useProductStore();
  const { categories, fetchCategories } = useCategoryStore();

  const [state, dispatch] = useReducer(productsReducer, initialState);
  const [confirmName, setConfirmName] = useState("");
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [bulkActive, setBulkActive] = useState<boolean | null>(null);
  const canManage = hasPermission(Permissions.MANAGE_CATALOG);
  const hasFilters = Boolean(state.search || state.categoryId);

  const allSelected =
    products.length > 0 && products.every((p) => state.selectedIds.includes(p.id));
  const someSelected =
    products.some((p) => state.selectedIds.includes(p.id)) && !allSelected;

  const columnCount = canManage ? 7 : 6;

  const clearFilters = () => {
    dispatch({ type: "SET_SEARCH", payload: "" });
    dispatch({ type: "SET_CATEGORY", payload: "" });
  };

  useEffect(() => {
    fetchCategories().catch(() => {
      // The filter is optional — the list still works without categories
    });
  }, [fetchCategories]);

  useEffect(() => {
    fetchProducts(1, PER_PAGE, {
      search: state.search,
      category_id: state.categoryId,
    }).catch((error) => toast.error(errorMessage(error, "Ocurrió un error inesperado")));
  }, [fetchProducts, state.search, state.categoryId]);

  const handlePageChange = ({ selected }: { selected: number }) => {
    fetchProducts(selected + 1, PER_PAGE, {
      search: state.search,
      category_id: state.categoryId,
    }).catch((error) => toast.error(errorMessage(error, "Ocurrió un error inesperado")));
    dispatch({ type: "SET_IDS", payload: [] });
  };

  const handleDelete = async () => {
    if (!state.selected) return;
    try {
      await deleteProduct(state.selected.id);
      toast.success("Producto eliminado correctamente");
      dispatch({ type: "CLOSE" });
      setConfirmName("");
    } catch (error) {
      toast.error(errorMessage(error, "Error al eliminar el producto"));
    }
  };

  const handleBulkApply = async () => {
    if (state.selectedIds.length === 0) return;
    const payload: { category_id?: number | null; active?: boolean } = {};
    if (bulkCategory !== "") payload.category_id = bulkCategory === "null" ? null : Number(bulkCategory);
    if (bulkActive !== null) payload.active = bulkActive;

    if (Object.keys(payload).length === 0) {
      toast.error("Selecciona al menos un cambio");
      return;
    }

    try {
      await bulkUpdateProducts(state.selectedIds, payload);
      toast.success("Productos actualizados correctamente");
      dispatch({ type: "CLOSE_BULK" });
      dispatch({ type: "SET_IDS", payload: [] });
      setBulkCategory("");
      setBulkActive(null);
      await fetchProducts(pagination.current_page, PER_PAGE, {
        search: state.search,
        category_id: state.categoryId,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Error al actualizar los productos"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description="Administra el catálogo que ven tus clientes en la tienda."
        actions={
          canManage && (
            <Button onClick={() => navigate("/dashboard/products/new")}>
              <Plus className="mr-2 size-4" />
              Nuevo producto
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBar
          placeholder="Buscar productos..."
          value={state.search}
          onSearch={(term) => dispatch({ type: "SET_SEARCH", payload: term })}
          className="w-full sm:max-w-sm"
        />

        <select
          value={state.categoryId}
          onChange={(event) =>
            dispatch({ type: "SET_CATEGORY", payload: event.target.value })
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {canManage && state.selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-sm font-medium">
            {state.selectedIds.length} seleccionado(s)
          </span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Cambiar categoría"
          >
            <option value="">Cambiar categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="null">Sin categoría</option>
          </select>
          <select
            value={bulkActive === null ? "" : String(bulkActive)}
            onChange={(e) =>
              setBulkActive(e.target.value === "" ? null : e.target.value === "true")
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Cambiar estado"
          >
            <option value="">Cambiar estado…</option>
            <option value="true">Visible</option>
            <option value="false">Oculto</option>
          </select>
          <Button size="sm" onClick={() => dispatch({ type: "OPEN_BULK" })}>
            Aplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dispatch({ type: "SET_IDS", payload: [] });
              setBulkCategory("");
              setBulkActive(null);
            }}
          >
            Limpiar
          </Button>
        </div>
      )}

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          dispatch({
                            type: "SET_IDS",
                            payload: products.map((p) => p.id),
                          });
                        } else {
                          dispatch({ type: "SET_IDS", payload: [] });
                        }
                      }}
                      aria-label="Seleccionar todos"
                    />
                  </TableHead>
                )}
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && (
                  <TableHead className="text-right">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableLoadingRow
                  colSpan={columnCount}
                  label="Cargando productos..."
                />
              ) : products.length === 0 ? (
                <TableEmptyRow
                  colSpan={columnCount}
                  icon={Package}
                  title={
                    hasFilters
                      ? "Ningún producto coincide con la búsqueda."
                      : "Todavía no hay productos."
                  }
                  description={
                    hasFilters
                      ? undefined
                      : "Sube tu primer producto para que aparezca en la tienda."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Limpiar filtros
                      </Button>
                    ) : canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/dashboard/products/new")}
                      >
                        <Plus className="mr-2 size-4" />
                        Crear primer producto
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    {canManage && (
                      <TableCell className="w-10">
                        <Checkbox
                          checked={state.selectedIds.includes(product.id)}
                          onCheckedChange={() =>
                            dispatch({ type: "TOGGLE_ID", payload: product.id })
                          }
                          aria-label={`Seleccionar ${product.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageOff className="size-4" />
                            </div>
                          )}
                        </div>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {product.category_name || "Sin categoría"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {formatPrice(product.price)}
                        </span>
                        {product.compare_at_price && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(product.compare_at_price)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.stock == null ? (
                        <span className="text-muted-foreground">Sin control</span>
                      ) : product.stock === 0 ? (
                        <span className="font-medium text-destructive">
                          Agotado
                        </span>
                      ) : (
                        product.stock
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.active ? "default" : "secondary"}>
                        {product.active ? "Visible" : "Oculto"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate(`/dashboard/products/${product.id}/edit`)
                            }
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setConfirmName("");
                              dispatch({ type: "OPEN_DELETE", payload: product });
                            }}
                            aria-label={`Eliminar ${product.name}`}
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

      <AlertDialog
        open={state.deleteOpen}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Eliminar producto
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Esta acción no se puede deshacer. Escribe{" "}
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

      <Dialog open={state.bulkOpen} onOpenChange={(open) => !open && dispatch({ type: "CLOSE_BULK" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar productos en lote</DialogTitle>
            <DialogDescription>
              Se aplicarán los cambios a {state.selectedIds.length} producto(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {bulkCategory !== "" && (
              <p>
                <span className="font-medium">Categoría:</span>{" "}
                {bulkCategory === "null"
                  ? "Sin categoría"
                  : categories.find((c) => String(c.id) === bulkCategory)?.name || bulkCategory}
              </p>
            )}
            {bulkActive !== null && (
              <p>
                <span className="font-medium">Estado:</span>{" "}
                {bulkActive ? "Visible" : "Oculto"}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => dispatch({ type: "CLOSE_BULK" })}>
              Cancelar
            </Button>
            <Button onClick={handleBulkApply} disabled={isLoading}>
              Aplicar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
