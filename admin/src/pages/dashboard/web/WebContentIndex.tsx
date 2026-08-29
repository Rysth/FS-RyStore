import { useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import toast from "react-hot-toast";
import { FileText, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PageHeader from "../../../components/common/PageHeader";
import { useAuthStore } from "../../../stores/authStore";
import { useWebContentStore, type BranchFormData } from "../../../stores/webContentStore";
import { Permissions } from "../../../types/auth";
import type { Branch, DownloadableCatalog } from "../../../types/store";
import { errorMessage } from "../../../utils/apiError";

type BranchFormValues = BranchFormData;

interface CatalogFormValues {
  title: string;
  description: string;
  active: boolean;
  cover_image: FileList | null;
  file: FileList | null;
}

interface PageState {
  branchOpen: boolean;
  catalogOpen: boolean;
  deleteOpen: boolean;
  selectedBranch: Branch | null;
  selectedCatalog: DownloadableCatalog | null;
  deleteType: "branch" | "catalog" | null;
}

type PageAction =
  | { type: "OPEN_BRANCH"; payload?: Branch }
  | { type: "OPEN_CATALOG"; payload?: DownloadableCatalog }
  | { type: "OPEN_DELETE_BRANCH"; payload: Branch }
  | { type: "OPEN_DELETE_CATALOG"; payload: DownloadableCatalog }
  | { type: "CLOSE" };

const initialState: PageState = {
  branchOpen: false,
  catalogOpen: false,
  deleteOpen: false,
  selectedBranch: null,
  selectedCatalog: null,
  deleteType: null,
};

function reducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case "OPEN_BRANCH":
      return { ...initialState, branchOpen: true, selectedBranch: action.payload ?? null };
    case "OPEN_CATALOG":
      return { ...initialState, catalogOpen: true, selectedCatalog: action.payload ?? null };
    case "OPEN_DELETE_BRANCH":
      return { ...initialState, deleteOpen: true, selectedBranch: action.payload, deleteType: "branch" };
    case "OPEN_DELETE_CATALOG":
      return { ...initialState, deleteOpen: true, selectedCatalog: action.payload, deleteType: "catalog" };
    case "CLOSE":
      return initialState;
    default:
      return state;
  }
}

export default function WebContentIndex() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission(Permissions.MANAGE_CATALOG);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [confirmName, setConfirmName] = useState("");
  const {
    business,
    branches,
    downloadableCatalogs,
    isLoading,
    fetchWebContent,
    updateBusinessContent,
    createBranch,
    updateBranch,
    deleteBranch,
    createDownloadableCatalog,
    updateDownloadableCatalog,
    deleteDownloadableCatalog,
  } = useWebContentStore();

  const businessForm = useForm({
    defaultValues: { about_title: "", about_body: "", contact_intro: "" },
  });
  const branchForm = useForm<BranchFormValues>({
    defaultValues: emptyBranchValues(),
  });
  const catalogForm = useForm<CatalogFormValues>({
    defaultValues: emptyCatalogValues(),
  });

  useEffect(() => {
    fetchWebContent().catch((error) =>
      toast.error(errorMessage(error, "No se pudo cargar el contenido web")),
    );
  }, [fetchWebContent]);

  useEffect(() => {
    businessForm.reset({
      about_title: business?.about_title || "",
      about_body: business?.about_body || "",
      contact_intro: business?.contact_intro || "",
    });
  }, [business, businessForm]);

  useEffect(() => {
    if (!state.branchOpen) return;
    branchForm.reset(
      state.selectedBranch
        ? {
            name: state.selectedBranch.name,
            address: state.selectedBranch.address || "",
            hours: state.selectedBranch.hours || "",
            phone: state.selectedBranch.phone || "",
            whatsapp: state.selectedBranch.whatsapp || "",
            maps_url: state.selectedBranch.maps_url || "",
            active: state.selectedBranch.active,
          }
        : emptyBranchValues(),
    );
  }, [branchForm, state.branchOpen, state.selectedBranch]);

  useEffect(() => {
    if (!state.catalogOpen) return;
    catalogForm.reset(
      state.selectedCatalog
        ? {
            title: state.selectedCatalog.title,
            description: state.selectedCatalog.description || "",
            active: state.selectedCatalog.active,
            cover_image: null,
            file: null,
          }
        : emptyCatalogValues(),
    );
  }, [catalogForm, state.catalogOpen, state.selectedCatalog]);

  const saveBusiness = async (values: { about_title: string; about_body: string; contact_intro: string }) => {
    try {
      await updateBusinessContent({
        about_title: values.about_title.trim() || null,
        about_body: values.about_body.trim() || null,
        contact_intro: values.contact_intro.trim() || null,
      });
      toast.success("Información web actualizada correctamente");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar la información"));
    }
  };

  const saveBranch = async (values: BranchFormValues) => {
    try {
      const payload: BranchFormData = {
        name: values.name.trim(),
        address: clean(values.address),
        hours: clean(values.hours),
        phone: clean(values.phone),
        whatsapp: clean(values.whatsapp),
        maps_url: clean(values.maps_url),
        active: values.active,
      };

      if (state.selectedBranch) {
        await updateBranch(state.selectedBranch.id, payload);
        toast.success("Sucursal actualizada correctamente");
      } else {
        await createBranch(payload);
        toast.success("Sucursal creada correctamente");
      }
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar la sucursal"));
    }
  };

  const saveCatalog = async (values: CatalogFormValues) => {
    try {
      const formData = new FormData();
      formData.append("downloadable_catalog[title]", values.title.trim());
      formData.append("downloadable_catalog[description]", values.description.trim());
      formData.append("downloadable_catalog[active]", String(values.active));
      if (values.cover_image && values.cover_image[0]) formData.append("cover_image", values.cover_image[0]);
      if (values.file && values.file[0]) formData.append("file", values.file[0]);

      if (state.selectedCatalog) {
        await updateDownloadableCatalog(state.selectedCatalog.id, formData);
        toast.success("Catálogo actualizado correctamente");
      } else {
        await createDownloadableCatalog(formData);
        toast.success("Catálogo creado correctamente");
      }
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar el catálogo"));
    }
  };

  const deleteSelected = async () => {
    try {
      if (state.deleteType === "branch" && state.selectedBranch) {
        await deleteBranch(state.selectedBranch.id);
        toast.success("Sucursal eliminada correctamente");
      }
      if (state.deleteType === "catalog" && state.selectedCatalog) {
        await deleteDownloadableCatalog(state.selectedCatalog.id);
        toast.success("Catálogo eliminado correctamente");
      }
      setConfirmName("");
      dispatch({ type: "CLOSE" });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo eliminar"));
    }
  };

  const deleteName = state.selectedBranch?.name || state.selectedCatalog?.title || "";
  const deleteEnabled = confirmName.trim() === deleteName;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sitio web"
        description="Administra las secciones informativas, sucursales y catálogos descargables de la tienda."
      />

      {isLoading && !business ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card className="border-border/60">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Información principal</h2>
                <p className="text-sm text-muted-foreground">
                  Este contenido alimenta la página “Sobre nosotros” y el bloque de contacto.
                </p>
              </div>
              <form className="space-y-4" onSubmit={businessForm.handleSubmit(saveBusiness)}>
                <div className="space-y-1.5">
                  <Label htmlFor="about-title">Título</Label>
                  <Input
                    id="about-title"
                    placeholder="Sobre nosotros"
                    disabled={!canManage}
                    {...businessForm.register("about_title", {
                      maxLength: { value: 120, message: "Máximo 120 caracteres" },
                    })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="about-body">Sobre nosotros</Label>
                  <Textarea
                    id="about-body"
                    rows={7}
                    placeholder="Cuenta la historia, especialidad y propuesta de valor del negocio."
                    disabled={!canManage}
                    {...businessForm.register("about_body", {
                      maxLength: { value: 4000, message: "Máximo 4000 caracteres" },
                    })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-intro">Texto de contacto</Label>
                  <Textarea
                    id="contact-intro"
                    rows={3}
                    placeholder="Indica cómo pueden contactarte o qué tipo de atención ofreces."
                    disabled={!canManage}
                    {...businessForm.register("contact_intro", {
                      maxLength: { value: 800, message: "Máximo 800 caracteres" },
                    })}
                  />
                </div>
                {canManage && (
                  <Button type="submit" disabled={businessForm.formState.isSubmitting}>
                    {businessForm.formState.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Guardar información
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          <SectionCard
            title="Sucursales"
            description="Aparecen en Contacto y pueden marcarse como disponibilidad informativa en cada producto."
            action={
              canManage && (
                <Button type="button" size="sm" onClick={() => dispatch({ type: "OPEN_BRANCH" })}>
                  <Plus className="mr-1.5 size-4" />
                  Nueva sucursal
                </Button>
              )
            }
          >
            {branches.length === 0 ? (
              <EmptyState icon={<MapPin className="size-5" />} text="Todavía no hay sucursales." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {branches.map((branch) => (
                  <div key={branch.id} className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{branch.name}</h3>
                        {branch.address && <p className="mt-1 text-sm text-muted-foreground">{branch.address}</p>}
                      </div>
                      <Badge variant={branch.active ? "default" : "secondary"}>
                        {branch.active ? "Activa" : "Oculta"}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {branch.hours && <p>Horario: {branch.hours}</p>}
                      {branch.phone && <p>Teléfono: {branch.phone}</p>}
                      {branch.whatsapp && <p>WhatsApp: {branch.whatsapp}</p>}
                    </div>
                    {canManage && (
                      <div className="mt-4 flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "OPEN_BRANCH", payload: branch })}>
                          <Pencil className="mr-1.5 size-3.5" />
                          Editar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => dispatch({ type: "OPEN_DELETE_BRANCH", payload: branch })}>
                          <Trash2 className="mr-1.5 size-3.5" />
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Catálogos descargables"
            description="Sube PDFs con una portada para campañas, listas de precios o promociones."
            action={
              canManage && (
                <Button type="button" size="sm" onClick={() => dispatch({ type: "OPEN_CATALOG" })}>
                  <Plus className="mr-1.5 size-4" />
                  Nuevo catálogo
                </Button>
              )
            }
          >
            {downloadableCatalogs.length === 0 ? (
              <EmptyState icon={<FileText className="size-5" />} text="Todavía no hay catálogos PDF." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {downloadableCatalogs.map((catalog) => (
                  <div key={catalog.id} className="overflow-hidden rounded-lg border border-border/60">
                    <div className="flex aspect-[4/3] items-center justify-center bg-muted/50">
                      {catalog.cover_image_url ? (
                        <img src={catalog.cover_image_url} alt={catalog.title} className="size-full object-cover" />
                      ) : (
                        <FileText className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{catalog.title}</h3>
                        <Badge variant={catalog.active ? "default" : "secondary"}>
                          {catalog.active ? "Activo" : "Oculto"}
                        </Badge>
                      </div>
                      {catalog.description && <p className="text-sm text-muted-foreground">{catalog.description}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" asChild>
                          <a href={catalog.file_url} target="_blank" rel="noopener noreferrer">Ver PDF</a>
                        </Button>
                        {canManage && (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "OPEN_CATALOG", payload: catalog })}>
                              Editar
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => dispatch({ type: "OPEN_DELETE_CATALOG", payload: catalog })}>
                              Eliminar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      <Dialog open={state.branchOpen} onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state.selectedBranch ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
            <DialogDescription>Estos datos se muestran en la página de contacto.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={branchForm.handleSubmit(saveBranch)}>
            <TextField label="Nombre *" id="branch-name" register={branchForm.register("name", { required: "El nombre es requerido" })} />
            <TextField label="Dirección" id="branch-address" register={branchForm.register("address")} />
            <TextField label="Horario" id="branch-hours" register={branchForm.register("hours")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Teléfono" id="branch-phone" register={branchForm.register("phone")} />
              <TextField label="WhatsApp" id="branch-whatsapp" register={branchForm.register("whatsapp")} />
            </div>
            <TextField label="Google Maps" id="branch-maps" register={branchForm.register("maps_url")} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 rounded border-input" {...branchForm.register("active")} />
              Mostrar sucursal
            </label>
            <Button type="submit" disabled={branchForm.formState.isSubmitting}>
              {branchForm.formState.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar sucursal
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={state.catalogOpen} onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state.selectedCatalog ? "Editar catálogo" : "Nuevo catálogo"}</DialogTitle>
            <DialogDescription>La portada es opcional. El PDF es obligatorio al crear.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={catalogForm.handleSubmit(saveCatalog)}>
            <TextField label="Título *" id="catalog-title" register={catalogForm.register("title", { required: "El título es requerido" })} />
            <div className="space-y-1.5">
              <Label htmlFor="catalog-description">Descripción</Label>
              <Textarea id="catalog-description" rows={3} {...catalogForm.register("description")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="catalog-cover">Portada</Label>
                <Input id="catalog-cover" type="file" accept="image/jpeg,image/png,image/webp" {...catalogForm.register("cover_image")} />
                <p className="text-[11px] text-muted-foreground">JPG, PNG o WEBP, máximo 2MB.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catalog-file">PDF {state.selectedCatalog ? "" : "*"}</Label>
                <Input id="catalog-file" type="file" accept="application/pdf" {...catalogForm.register("file")} />
                <p className="text-[11px] text-muted-foreground">Máximo 15MB.</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 rounded border-input" {...catalogForm.register("active")} />
              Mostrar catálogo
            </label>
            <Button type="submit" disabled={catalogForm.formState.isSubmitting}>
              {catalogForm.formState.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar catálogo
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={state.deleteOpen} onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {state.deleteType === "catalog" ? "catálogo" : "sucursal"}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Escribe <strong>{deleteName}</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} placeholder={deleteName} />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmName("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!deleteEnabled} onClick={deleteSelected}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function emptyBranchValues(): BranchFormValues {
  return { name: "", address: "", hours: "", phone: "", whatsapp: "", maps_url: "", active: true };
}

function emptyCatalogValues(): CatalogFormValues {
  return { title: "", description: "", active: true, cover_image: null, file: null };
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || "";
  return trimmed ? trimmed : null;
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
      {icon}
      {text}
    </div>
  );
}

function TextField({
  id,
  label,
  register,
}: {
  id: string;
  label: string;
  register: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...register} />
    </div>
  );
}
