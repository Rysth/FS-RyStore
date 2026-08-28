import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Plus, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichTextEditor from "../../../components/shared/RichTextEditor";
import ProductGalleryManager from "./ProductGalleryManager";
import ProductVideoManager from "./ProductVideoManager";
import { useProductStore } from "../../../stores/productStore";
import { useCategoryStore } from "../../../stores/categoryStore";
import type { Product } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";
import { htmlToText, isHtmlEmpty } from "../../../utils/html";

const LIST_PATH = "/dashboard/products";
const FORM_ID = "product-form";

const MAX_DESCRIPTION_TEXT = 2000;

// Tier rows stay as strings while editing, like every other numeric field here.
interface TierRow {
  min_quantity: string;
  unit_price: string;
}

interface OptionTypeRow {
  name: string;
  values: string;
}

interface VariantDraft {
  sku: string;
  price: string;
  stock: string;
}

interface ProductFormValues {
  name: string;
  kind: "product" | "service";
  description: string;
  price: string;
  compare_at_price: string;
  category_id: string;
  image: FileList | null;
  stock: string;
  active: boolean;
  price_tiers: TierRow[];
  option_types: OptionTypeRow[];
}

const MAX_PRICE_TIERS = 8;
const MAX_OPTION_TYPES = 3;
const MAX_OPTION_VALUES = 20;
const MAX_VARIANTS = 100;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EMPTY_VALUES: ProductFormValues = {
  name: "",
  kind: "product",
  description: "",
  price: "",
  compare_at_price: "",
  category_id: "",
  image: null,
  stock: "",
  active: true,
  price_tiers: [],
  option_types: [],
};

function splitOptionValues(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;

      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parsedOptionTypes(rows: OptionTypeRow[]) {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      values: splitOptionValues(row.values),
    }))
    .filter((row) => row.name && row.values.length > 0);
}

function buildVariantOptions(
  axes: ReturnType<typeof parsedOptionTypes>,
): Record<string, string>[] {
  if (axes.length === 0) return [];

  return axes.reduce<Record<string, string>[]>((rows, axis) => {
    const baseRows = rows.length > 0 ? rows : [ {} ];
    return baseRows.flatMap((row) =>
      axis.values.map((value) => ({ ...row, [axis.name]: value })),
    );
  }, []);
}

function variantKey(options: Record<string, string>): string {
  return JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));
}

function variantLabel(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(" · ");
}

/**
 * Create and edit a product, on its own route.
 *
 * It was a dialog first. The form is long — description editor, wholesale
 * ladder, image — and a dialog gave it a scrollbar inside a scrollbar while
 * making the work impossible to link to or reload. As a page it also survives a
 * refresh mid-edit.
 */
export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const {
    fetchProduct,
    createProduct,
    updateProduct,
    uploadProductImage,
    removeProductImage,
  } = useProductStore();
  const { categories, fetchCategories } = useCategoryStore();

  const form = useForm<ProductFormValues>({ defaultValues: EMPTY_VALUES });
  const tiers = useFieldArray({ control: form.control, name: "price_tiers" });
  const optionTypes = useFieldArray({ control: form.control, name: "option_types" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({});
  // Only the edit route waits on a record; /new renders immediately.
  const [isLoadingProduct, setIsLoadingProduct] = useState(isEditing);
  // Saving is two requests and the second one — the photo — is by far the
  // slower. Naming the current step is the difference between "nothing is
  // happening" and "it is uploading my picture".
  const [saveStep, setSaveStep] = useState<"idle" | "saving" | "uploading">(
    "idle",
  );
  const isSaving = form.formState.isSubmitting;

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
  const productKind = form.watch("kind");
  const optionTypeRows = form.watch("option_types");
  const variantAxes = parsedOptionTypes(optionTypeRows);
  const variantOptions = buildVariantOptions(variantAxes);
  const variantLimitExceeded = variantOptions.length > MAX_VARIANTS;
  useEffect(() => {
    if (imageFile && imageFile.length > 0) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(imageFile[0]);
      setRemoveImage(false);
    }
  }, [imageFile]);

  useEffect(() => {
    if (categories.length === 0) {
      fetchCategories().catch(() => {
        // The categories dropdown is optional — the product still saves without it
      });
    }
  }, [categories.length, fetchCategories]);

  // Loaded here rather than handed down, because the route can be opened cold:
  // pasted URL, refresh, or a bookmark.
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setIsLoadingProduct(true);

    fetchProduct(Number(id))
      .then((loaded) => {
        if (cancelled) return;
        setProduct(loaded);
        form.reset({
          name: loaded.name,
          kind: loaded.kind || "product",
          description: loaded.description || "",
          price: loaded.price,
          compare_at_price: loaded.compare_at_price || "",
          category_id: loaded.category_id ? String(loaded.category_id) : "",
          image: null,
          stock: loaded.stock != null ? String(loaded.stock) : "",
          active: loaded.active,
          price_tiers: (loaded.price_tiers || []).map((tier) => ({
            min_quantity: String(tier.min_quantity),
            unit_price: tier.unit_price,
          })),
          option_types: (loaded.option_types || []).map((axis) => ({
            name: axis.name,
            values: axis.values.join(", "),
          })),
        });
        setVariantDrafts(
          Object.fromEntries(
            (loaded.variants || []).map((variant) => [
              variantKey(variant.options),
              {
                sku: variant.sku || "",
                price: variant.price || "",
                stock: variant.stock != null ? String(variant.stock) : "",
              },
            ]),
          ),
        );
        setPreview(loaded.image_url || null);
        setRemoveImage(false);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(errorMessage(error, "No se pudo cargar el producto"));
        navigate(LIST_PATH, { replace: true });
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProduct(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, fetchProduct, form, navigate]);

  const onSubmit = async (values: ProductFormValues) => {
    const axes = parsedOptionTypes(values.option_types);
    const options = buildVariantOptions(axes);

    if (options.length > MAX_VARIANTS) {
      toast.error(`Un producto no puede tener más de ${MAX_VARIANTS} variantes`);
      return;
    }

    const payload = {
      name: values.name.trim(),
      kind: values.kind,
      // An editor the shop cleared still reports "<p><br></p>". Sending "" is
      // what clears the stored description; sending that markup would keep an
      // empty Descripción block alive in the storefront.
      description: isHtmlEmpty(values.description) ? "" : values.description,
      price: values.price,
      compare_at_price: values.compare_at_price
        ? values.compare_at_price
        : null,
      category_id: values.category_id ? Number(values.category_id) : null,
      // An empty stock means "don't track inventory for this product"
      stock: values.kind === "service" || values.stock === "" ? null : Number(values.stock),
      active: values.active,
      // Always sent: an empty array is how the API is told to clear the ladder.
      price_tiers: values.price_tiers
        .filter((row) => row.min_quantity !== "" || row.unit_price !== "")
        .map((row) => ({
          min_quantity: Number(row.min_quantity),
          unit_price: row.unit_price,
        }))
        .sort((a, b) => a.min_quantity - b.min_quantity),
      option_types: values.kind === "service" ? [] : axes,
      variants:
        values.kind === "service"
          ? []
          : options.map((option) => {
              const draft = variantDrafts[variantKey(option)] || {
                sku: "",
                price: "",
                stock: "",
              };

              return {
                options: option,
                sku: draft.sku.trim() || null,
                price: draft.price.trim() || null,
                stock: draft.stock.trim() === "" ? null : Number(draft.stock),
              };
            }),
    };

    const file = values.image && values.image.length > 0 ? values.image[0] : null;

    let productId: number;
    setSaveStep("saving");
    try {
      if (product) {
        await updateProduct(product.id, payload);
        productId = product.id;
      } else {
        productId = (await createProduct(payload)).id;
      }
    } catch (error) {
      setSaveStep("idle");
      toast.error(errorMessage(error, "Error al guardar el producto"));
      return;
    }

    // The picture is a second request, so it can fail on its own. The product
    // is already saved by then — say so instead of implying nothing happened.
    try {
      if (file) {
        setSaveStep("uploading");
        await uploadProductImage(productId, file);
      } else if (removeImage) {
        await removeProductImage(productId);
      }
    } catch (error) {
      setSaveStep("idle");
      toast.error(
        errorMessage(error, "El producto se guardó, pero la imagen no"),
      );
      navigate(LIST_PATH);
      return;
    }

    toast.success(
      product ? "Producto actualizado correctamente" : "Producto creado correctamente",
    );
    // Left as-is on the happy path: navigating away unmounts this, and
    // clearing it first would flash the idle label for a frame.
    navigate(LIST_PATH);
  };

  if (isLoadingProduct) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 text-muted-foreground"
            onClick={() => navigate(LIST_PATH)}
          >
            <ArrowLeft className="mr-1.5 size-4" />
            Productos
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {product ? "Editar producto" : "Nuevo producto"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los productos ocultos no aparecen en la tienda pública.
          </p>
        </div>

        {/* Actions live in the header, reachable without scrolling to the end.
            They sit outside the <form>, so they reach it by id — which is what
            the HTML form attribute is for. */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isSaving}
            onClick={() => navigate(LIST_PATH)}
          >
            Cancelar
          </Button>
          {/* Gated on RHF's isSubmitting, not the store's isLoading: the store
              flips isLoading back to false the moment the product is saved,
              which is precisely when the slow image upload starts — so the
              button used to come back to life mid-save and accept another
              click. isSubmitting spans the whole handler. */}
          <Button
            type="submit"
            form={FORM_ID}
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {saveStep === "uploading"
              ? "Subiendo imagen..."
              : saveStep === "saving"
                ? "Guardando..."
                : product
                  ? "Guardar cambios"
                  : "Crear producto"}
          </Button>
        </div>
      </div>

      {/* Two columns from lg up: what the shop writes on the left, the switches
          it flips on the right. A single narrow column was the dialog's
          constraint, not the page's. */}
      <form
        id={FORM_ID}
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-3 lg:items-start"
      >
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-border/60">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="product-name">Nombre *</Label>
            <Input
              id="product-name"
              placeholder="Vestido floral verano"
              {...form.register("name", {
                required: "El nombre es requerido",
                maxLength: { value: 120, message: "Máximo 120 caracteres" },
              })}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-description">Descripción</Label>
            <Controller
              control={form.control}
              name="description"
              rules={{
                // Measured on visible text, matching the server rule, so the
                // markup the editor adds never counts against the shop.
                validate: (value) =>
                  htmlToText(value).length <= MAX_DESCRIPTION_TEXT ||
                  `Máximo ${MAX_DESCRIPTION_TEXT} caracteres`,
              }}
              render={({ field }) => (
                <RichTextEditor
                  id="product-description"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Material, tallas disponibles, detalles..."
                  invalid={!!form.formState.errors.description}
                />
              )}
            />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="product-price">Precio *</Label>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="32.90"
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
              <Label htmlFor="product-compare-price">Precio anterior</Label>
              <Input
                id="product-compare-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="45.00"
                {...form.register("compare_at_price", {
                  validate: (value) => {
                    if (!value) return true;
                    const price = Number(form.getValues("price"));
                    return (
                      Number(value) > price ||
                      "Debe ser mayor al precio de venta"
                    );
                  },
                })}
              />
              {form.formState.errors.compare_at_price && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.compare_at_price.message}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Se muestra tachado como precio de oferta.
              </p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>Precios por mayor</Label>
                <p className="text-[11px] text-muted-foreground">
                  El precio baja solo cuando el comprador llega a la cantidad
                  mínima. Cada escala debe ser más barata que la anterior.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={tiers.fields.length >= MAX_PRICE_TIERS}
                onClick={() => {
                  tiers.append({ min_quantity: "", unit_price: "" });
                  // Validation is per-field, so stale errors on other rows
                  // linger unless the whole array is re-checked.
                  void form.trigger("price_tiers");
                }}
              >
                <Plus className="mr-1 size-3.5" />
                Agregar escala
              </Button>
            </div>

            {tiers.fields.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                Sin escalas. Este producto se vende siempre al precio de venta.
              </p>
            ) : (
              <ul className="space-y-2">
                {tiers.fields.map((field, index) => (
                  <li key={field.id} className="space-y-1">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label
                          htmlFor={`tier-qty-${index}`}
                          className="text-[11px] font-normal text-muted-foreground"
                        >
                          Desde (unidades)
                        </Label>
                        <Input
                          id={`tier-qty-${index}`}
                          type="number"
                          min="1"
                          step="1"
                          placeholder="6"
                          {...form.register(
                            `price_tiers.${index}.min_quantity` as const,
                            {
                              required: "Requerido",
                              validate: (value) => {
                                if (Number(value) < 1)
                                  return "Debe ser mayor o igual a 1";
                                const rows = form.getValues("price_tiers");
                                const duplicated = rows.filter(
                                  (row, position) =>
                                    position !== index &&
                                    row.min_quantity !== "" &&
                                    Number(row.min_quantity) === Number(value),
                                );
                                return (
                                  duplicated.length === 0 ||
                                  "Ya existe una escala con esta cantidad"
                                );
                              },
                            },
                          )}
                        />
                      </div>

                      <div className="flex-1 space-y-1">
                        <Label
                          htmlFor={`tier-price-${index}`}
                          className="text-[11px] font-normal text-muted-foreground"
                        >
                          Precio c/u
                        </Label>
                        <Input
                          id={`tier-price-${index}`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="4.20"
                          {...form.register(
                            `price_tiers.${index}.unit_price` as const,
                            {
                              required: "Requerido",
                              validate: (value) => {
                                if (Number(value) < 0)
                                  return "Debe ser mayor o igual a 0";

                                const price = Number(form.getValues("price"));
                                if (price && Number(value) > price) {
                                  return "No puede ser mayor al precio de venta";
                                }

                                // A wholesale ladder must get cheaper as the
                                // quantity grows, matching the server rule.
                                const rows = form.getValues("price_tiers");
                                const current = Number(
                                  rows[index]?.min_quantity,
                                );
                                const previous = rows
                                  .filter(
                                    (row, position) =>
                                      position !== index &&
                                      row.min_quantity !== "" &&
                                      Number(row.min_quantity) < current,
                                  )
                                  .sort(
                                    (a, b) =>
                                      Number(a.min_quantity) -
                                      Number(b.min_quantity),
                                  )
                                  .at(-1);

                                if (
                                  previous &&
                                  Number(value) >= Number(previous.unit_price)
                                ) {
                                  return "Debe ser menor al del tramo anterior";
                                }
                                return true;
                              },
                            },
                          )}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          tiers.remove(index);
                          // Removing a row leaves errors keyed to indexes that
                          // no longer exist.
                          void form.trigger("price_tiers");
                        }}
                        aria-label={`Eliminar escala ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {(form.formState.errors.price_tiers?.[index]
                      ?.min_quantity ||
                      form.formState.errors.price_tiers?.[index]
                        ?.unit_price) && (
                      <p className="text-xs text-destructive">
                        {
                          (form.formState.errors.price_tiers[index]
                            ?.min_quantity?.message ||
                            form.formState.errors.price_tiers[index]?.unit_price
                              ?.message) as string
                        }
                      </p>
                    )}
                  </li>
                ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {productKind !== "service" && (
            <Card className="border-border/60">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label>Opciones y variantes</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Úsalo para tallas, colores u otras combinaciones. Escribe
                      los valores separados por comas.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={optionTypes.fields.length >= MAX_OPTION_TYPES}
                    onClick={() => optionTypes.append({ name: "", values: "" })}
                  >
                    <Plus className="mr-1 size-3.5" />
                    Agregar opción
                  </Button>
                </div>

                {optionTypes.fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                    Sin variantes. El producto usa el stock general del panel derecho.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {optionTypes.fields.map((field, index) => (
                      <div key={field.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[12rem_1fr_auto]">
                        <div className="space-y-1">
                          <Label htmlFor={`option-name-${index}`} className="text-[11px] font-normal text-muted-foreground">
                            Opción
                          </Label>
                          <Input
                            id={`option-name-${index}`}
                            placeholder="Talla"
                            {...form.register(`option_types.${index}.name` as const, {
                              validate: (value) => {
                                if (!value.trim()) return "Requerido";
                                const names = form
                                  .getValues("option_types")
                                  .map((row) => row.name.trim().toLowerCase())
                                  .filter(Boolean);
                                return names.filter((name) => name === value.trim().toLowerCase()).length <= 1 || "Nombre repetido";
                              },
                            })}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`option-values-${index}`} className="text-[11px] font-normal text-muted-foreground">
                            Valores
                          </Label>
                          <Input
                            id={`option-values-${index}`}
                            placeholder="S, M, L"
                            {...form.register(`option_types.${index}.values` as const, {
                              validate: (value) => {
                                const values = splitOptionValues(value);
                                if (values.length === 0) return "Agrega al menos un valor";
                                return values.length <= MAX_OPTION_VALUES || `Máximo ${MAX_OPTION_VALUES} valores`;
                              },
                            })}
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="self-end text-muted-foreground hover:text-destructive"
                          onClick={() => optionTypes.remove(index)}
                          aria-label={`Eliminar opción ${index + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>

                        {(form.formState.errors.option_types?.[index]?.name ||
                          form.formState.errors.option_types?.[index]?.values) && (
                          <p className="text-xs text-destructive sm:col-span-3">
                            {
                              (form.formState.errors.option_types[index]?.name?.message ||
                                form.formState.errors.option_types[index]?.values?.message) as string
                            }
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {variantLimitExceeded ? (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Esta combinación genera {variantOptions.length} variantes. El máximo es {MAX_VARIANTS}.
                  </p>
                ) : variantOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div>
                      <Label>Matriz de variantes</Label>
                      <p className="text-[11px] text-muted-foreground">
                        El precio vacío usa el precio principal. El stock vacío significa sin control de inventario.
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Variante</th>
                            <th className="px-3 py-2 font-medium">SKU</th>
                            <th className="px-3 py-2 font-medium">Precio</th>
                            <th className="px-3 py-2 font-medium">Stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantOptions.map((option) => {
                            const key = variantKey(option);
                            const draft = variantDrafts[key] || { sku: "", price: "", stock: "" };

                            return (
                              <tr key={key} className="border-t border-border">
                                <td className="px-3 py-2 text-xs font-medium">
                                  {variantLabel(option)}
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={draft.sku}
                                    placeholder="Opcional"
                                    onChange={(event) =>
                                      setVariantDrafts((current) => ({
                                        ...current,
                                        [key]: { ...draft, sku: event.target.value },
                                      }))
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={draft.price}
                                    placeholder={form.watch("price") || "Principal"}
                                    onChange={(event) =>
                                      setVariantDrafts((current) => ({
                                        ...current,
                                        [key]: { ...draft, price: event.target.value },
                                      }))
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={draft.stock}
                                    placeholder="Sin control"
                                    onChange={(event) =>
                                      setVariantDrafts((current) => ({
                                        ...current,
                                        [key]: { ...draft, stock: event.target.value },
                                      }))
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-border/60">
            <CardContent className="space-y-3 p-5">
              <Label>Visibilidad</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  {...form.register("active")}
                />
                Visible en la tienda
              </label>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-4 p-5">
              <Label>Organización</Label>

              <div className="space-y-1.5">
                <Label
                  htmlFor="product-kind"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Tipo
                </Label>
                <select
                  id="product-kind"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("kind")}
                >
                  <option value="product">Producto físico</option>
                  <option value="service">Servicio digital</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Los servicios no manejan stock y se pagan solo por transferencia.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="product-category"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Categoría
                </Label>
                <select
                  id="product-category"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("category_id")}
                >
                  <option value="">Sin categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="product-stock"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Stock
                </Label>
                <Input
                  id="product-stock"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Sin control de stock"
                  disabled={productKind === "service"}
                  {...form.register("stock", {
                    min: { value: 0, message: "Debe ser mayor o igual a 0" },
                  })}
                />
                {form.formState.errors.stock && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.stock.message}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {productKind === "service"
                    ? "Los servicios no descuentan inventario."
                    : "Déjalo vacío si no llevas control de inventario."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-5 p-5">
              {product ? (
                <>
                  <ProductGalleryManager
                    product={product}
                    onChanged={setProduct}
                  />
                  <div className="border-t border-border/60 pt-5">
                    <ProductVideoManager
                      product={product}
                      onChanged={setProduct}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Galería</Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Sin imágenes en la galería todavía.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled
                    >
                      <Upload className="mr-1.5 size-3.5" />
                      Agregar imágenes
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      La principal se usa en el catálogo y al compartir por WhatsApp. Hasta 3 fotos, JPG, PNG o WEBP, máximo 2MB cada una.
                    </p>
                  </div>
                  <div className="border-t border-border/60 pt-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Video</Label>
                      </div>
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Video className="size-3.5" />
                        Este producto todavía no tiene video.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled
                      >
                        <Upload className="mr-1.5 size-3.5" />
                        Subir video
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        Un solo video por producto, de máximo 45 segundos. MP4, WEBM o MOV, hasta 20MB. Se muestra junto a las fotos en la ficha del producto.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                    Guarda el producto primero para poder agregar galería y video.
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-1.5 p-5">
            <Label>{product ? "Imagen única (heredada)" : "Imagen"}</Label>
            <div className="flex items-start gap-3">
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
                className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary/50"
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
                  Se muestra en el catálogo y al compartir el producto por
                  WhatsApp. JPG, PNG o WEBP, máximo 2MB.
                </p>
                {product?.image_url && !removeImage && (
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
                can coexist with RHF's — same as CategoriesIndex.tsx. */}
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
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
