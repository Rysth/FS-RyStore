import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ImageOff, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

// Creating and editing live on their own routes now, so the only dialog left
// here is the delete confirmation — which is the one place a modal is right,
// since it interrupts on purpose.
interface ProductsState {
  search: string;
  categoryId: string;
  deleteOpen: boolean;
  selected: Product | null;
}

type ProductsAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_CATEGORY"; payload: string }
  | { type: "OPEN_DELETE"; payload: Product }
  | { type: "CLOSE" };

const initialState: ProductsState = {
  search: "",
  categoryId: "",
  deleteOpen: false,
  selected: null,
};

function productsReducer(
  state: ProductsState,
  action: ProductsAction,
): ProductsState {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, search: action.payload };
    case "SET_CATEGORY":
      return { ...state, categoryId: action.payload };
    case "OPEN_DELETE":
      return { ...state, deleteOpen: true, selected: action.payload };
    case "CLOSE":
      return { ...state, deleteOpen: false, selected: null };
    default:
      return state;
  }
}

export default function ProductsIndex() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const { products, pagination, isLoading, fetchProducts, deleteProduct } =
    useProductStore();
  const { categories, fetchCategories } = useCategoryStore();

  const [state, dispatch] = useReducer(productsReducer, initialState);
  const [confirmName, setConfirmName] = useState("");
  const canManage = hasPermission(Permissions.MANAGE_CATALOG);
  const hasFilters = Boolean(state.search || state.categoryId);
  // Acciones only renders for managers, so an empty row that spans a fixed 6
  // used to leave a stray column behind for everyone else.
  const columnCount = canManage ? 6 : 5;

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

  // No reload helper any more: saving navigates back here, and the effect above
  // refetches on mount.
  const handlePageChange = ({ selected }: { selected: number }) => {
    fetchProducts(selected + 1, PER_PAGE, {
      search: state.search,
      category_id: state.categoryId,
    }).catch((error) => toast.error(errorMessage(error, "Ocurrió un error inesperado")));
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

      <Card className="rounded-xl p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
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
    </div>
  );
}
