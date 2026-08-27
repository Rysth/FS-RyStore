import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  Building2,
  ChevronRight,
  EyeOff,
  Facebook,
  Globe,
  Instagram,
  KeyRound,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Navigation,
  Palette,
  Phone,
  Save,
  Share2,
  Shield,
  Store as StoreIcon,
  Truck,
  Upload,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import PasswordInput from "../../../components/shared/PasswordInput";
import { useAuthStore } from "../../../stores/authStore";
import { useBusinessStore } from "../../../stores/businessStore";
import { useProfileStore } from "../../../stores/profileStore";
import { Permissions } from "../../../types/auth";
import { errorMessage } from "../../../utils/apiError";

interface BusinessFormData {
  name: string;
  slogan: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  address: string;
  maps_url: string;
  delivery_notes: string;
  bank_instructions: string;
  primary_color: string;
  notification_email: string;
  published: boolean;
  logo?: FileList;
}

interface ProfileFormData {
  fullname: string;
  username: string;
  email: string;
}

interface PasswordFormData {
  current_password: string;
  password: string;
  password_confirmation: string;
}

type SettingsTab = "profile" | "password" | "business";

const WHATSAPP_COUNTRY_CODES = [
  { value: "+593", label: "🇪🇨 +593" },
  { value: "+57", label: "🇨🇴 +57" },
  { value: "+51", label: "🇵🇪 +51" },
  { value: "+54", label: "🇦🇷 +54" },
  { value: "+56", label: "🇨🇱 +56" },
  { value: "+52", label: "🇲🇽 +52" },
  { value: "+1", label: "🇺🇸 +1" },
];

const DEFAULT_WHATSAPP_CODE = "+593";

function parseWhatsapp(value?: string | null): { code: string; local: string } {
  const raw = (value || "").trim().replace(/\s|-/g, "");
  if (!raw) return { code: DEFAULT_WHATSAPP_CODE, local: "" };

  const withPlus = raw.startsWith("+") ? raw : `+${raw}`;
  const matched = [...WHATSAPP_COUNTRY_CODES]
    .sort((a, b) => b.value.length - a.value.length)
    .find((c) => withPlus.startsWith(c.value));

  if (!matched) {
    return {
      code: DEFAULT_WHATSAPP_CODE,
      local: withPlus.replace(/^\+/, "").replace(/\D/g, ""),
    };
  }

  const local = withPlus.slice(matched.value.length).replace(/\D/g, "");
  return { code: matched.value, local };
}

export default function BusinessSettings() {
  const { user: currentUser, updateUser, hasPermission } =
    useAuthStore();
  const { business, isLoading, fetchBusiness, updateBusiness, error } =
    useBusinessStore();
  const {
    updateProfile,
    updatePassword,
    isLoading: isProfileLoading,
  } = useProfileStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [preview, setPreview] = useState<string | null>(null);
  const [whatsappCountryCode, setWhatsappCountryCode] = useState<string>(
    DEFAULT_WHATSAPP_CODE,
  );
  const [isProfileCooldown, setIsProfileCooldown] = useState(false);
  const [isPasswordCooldown, setIsPasswordCooldown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManageBusiness = hasPermission(Permissions.VIEW_BUSINESS);

  // ── Forms ────────────────────────────────────────────────

  const businessFormValues = useMemo(
    () =>
      business
        ? (() => {
            const parsedWhatsapp = parseWhatsapp(business.whatsapp);
            return {
              name: business.name || "",
              slogan: business.slogan || "",
              whatsapp: parsedWhatsapp.local,
              instagram: business.instagram || "",
              facebook: business.facebook || "",
              tiktok: business.tiktok || "",
              address: business.address || "",
              maps_url: business.maps_url || "",
              delivery_notes: business.delivery_notes || "",
              bank_instructions: business.bank_instructions || "",
              primary_color: business.primary_color || "#E11D48",
              notification_email: business.notification_email || "",
              // Undefined only before the API has answered; a store is live
              // unless it says otherwise.
              published: business.published !== false,
            };
          })()
        : undefined,
    [business],
  );
  const businessForm = useForm<BusinessFormData>({
    ...(businessFormValues ? { values: businessFormValues } : {}),
  });

  const profileFormValues = useMemo(
    () =>
      currentUser
        ? {
            fullname: currentUser.fullname || "",
            username: currentUser.username || "",
            email: currentUser.email || "",
          }
        : undefined,
    [currentUser],
  );
  const profileForm = useForm<ProfileFormData>({
    defaultValues: {
      fullname: currentUser?.fullname || "",
      username: currentUser?.username || "",
      email: currentUser?.email || "",
    },
    ...(profileFormValues ? { values: profileFormValues } : {}),
  });

  const passwordForm = useForm<PasswordFormData>({
    defaultValues: {
      current_password: "",
      password: "",
      password_confirmation: "",
    },
  });

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => {
    if (canManageBusiness) fetchBusiness();
  }, [fetchBusiness, canManageBusiness]);


  useEffect(() => {
    if (business?.logo_url) setPreview(business.logo_url);
  }, [business?.logo_url]);

  useEffect(() => {
    const parsedWhatsapp = parseWhatsapp(business?.whatsapp);
    setWhatsappCountryCode(parsedWhatsapp.code);
  }, [business?.whatsapp]);

  const logoFile = businessForm.watch("logo");
  useEffect(() => {
    if (logoFile && logoFile.length > 0) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(logoFile[0]);
    }
  }, [logoFile]);

  // ── Handlers ─────────────────────────────────────────────

  const onBusinessSubmit = async (data: BusinessFormData) => {
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("slogan", data.slogan || "");
      const whatsappLocal = (data.whatsapp || "").replace(/\D/g, "");
      formData.append(
        "whatsapp",
        whatsappLocal ? `${whatsappCountryCode}${whatsappLocal}` : "",
      );
      formData.append("instagram", data.instagram || "");
      formData.append("facebook", data.facebook || "");
      formData.append("tiktok", data.tiktok || "");
      formData.append("address", data.address || "");
      formData.append("maps_url", data.maps_url || "");
      formData.append("delivery_notes", data.delivery_notes || "");
      formData.append("bank_instructions", data.bank_instructions || "");
      formData.append("primary_color", data.primary_color || "");
      formData.append("notification_email", data.notification_email || "");
      // Multipart carries strings, so the boolean has to be spelled out for
      // Rails' type casting on the other side.
      formData.append("published", data.published ? "true" : "false");
      if (data.logo && data.logo[0]) formData.append("logo", data.logo[0]);
      await updateBusiness(formData);
      toast.success("Configuración de la tienda guardada");
    } catch (error) {
      toast.error(errorMessage(error, "Error al guardar configuración"));
    }
  };

  const onProfileSubmit = async (data: ProfileFormData) => {
    if (isProfileCooldown) return;
    try {
      setIsProfileCooldown(true);
      const updatedUser = await updateProfile(data);
      updateUser({ ...currentUser!, ...updatedUser });
      toast.success("Perfil actualizado exitosamente");
      setTimeout(() => setIsProfileCooldown(false), 3000);
    } catch (error) {
      toast.error(errorMessage(error, "Error al actualizar perfil"));
      setIsProfileCooldown(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    if (isPasswordCooldown) return;
    try {
      setIsPasswordCooldown(true);
      await updatePassword(data);
      toast.success("Contraseña actualizada exitosamente");
      passwordForm.reset();
      setTimeout(() => setIsPasswordCooldown(false), 3000);
    } catch (error) {
      toast.error(errorMessage(error, "Error al actualizar contraseña"));
      setIsPasswordCooldown(false);
    }
  };

  const logoRegister = businessForm.register("logo", {
    validate: {
      fileSize: (files: FileList | null | undefined) => {
        if (!files || files.length === 0) return true;
        return files[0].size > 2 * 1024 * 1024
          ? "El logo debe ser menor a 2MB"
          : true;
      },
      fileType: (files: FileList | null | undefined) => {
        if (!files || files.length === 0) return true;
        return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
          files[0].type,
        )
          ? true
          : "Solo se permiten archivos JPG, PNG o WEBP";
      },
    },
  });

  // ── Nav items ─────────────────────────────────────────────

  const navItems: {
    id: SettingsTab;
    label: string;
    icon: ReactNode;
    description: string;
  }[] = [
    {
      id: "profile",
      label: "Mi Perfil",
      icon: <User className="w-4 h-4" />,
      description: "Información personal",
    },
    {
      id: "password",
      label: "Contraseña",
      icon: <KeyRound className="w-4 h-4" />,
      description: "Seguridad de la cuenta",
    },
    ...(canManageBusiness
      ? [
          {
            id: "business" as SettingsTab,
            label: "Tienda",
            icon: <Building2 className="w-4 h-4" />,
            description: "Datos, entrega y pagos",
          },
        ]
      : []),
  ];

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administra tu cuenta y las preferencias del sistema.
        </p>
      </div>

      {error && (
        <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-56 shrink-0">
          <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-left w-full min-w-max lg:min-w-0 ${
                  activeTab === item.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span
                  className={
                    activeTab === item.id
                      ? "text-primary-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {activeTab === item.id && (
                  <ChevronRight className="w-3.5 h-3.5 hidden lg:block" />
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content Panel */}
        <div className="flex-1 min-w-0">
          {/* ── Profile Tab ─────────────────────────── */}
          {activeTab === "profile" && (
            <Card className="border-border/60">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base">Mi Perfil</h2>
                    <p className="text-xs text-muted-foreground">
                      Actualiza tu información personal
                    </p>
                  </div>
                </div>

                <Separator className="mb-6" />

                <form
                  onSubmit={profileForm.handleSubmit(onProfileSubmit)}
                  className="space-y-5"
                >
                  {/* Avatar row */}
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground text-xl font-bold shrink-0">
                      {currentUser?.fullname?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {currentUser?.fullname}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{currentUser?.username}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {currentUser?.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary capitalize"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="profile-fullname"
                        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Nombre Completo *
                      </Label>
                      <Input
                        id="profile-fullname"
                        placeholder="Juan Pérez"
                        className="h-9"
                        {...profileForm.register("fullname", {
                          required: "El nombre completo es requerido",
                        })}
                      />
                      {profileForm.formState.errors.fullname && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.fullname.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="profile-username"
                        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Nombre de Usuario *
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-sm text-muted-foreground">
                          @
                        </span>
                        <Input
                          id="profile-username"
                          placeholder="juanperez"
                          className="pl-7 h-9"
                          {...profileForm.register("username", {
                            required: "El nombre de usuario es requerido",
                            pattern: {
                              value: /^[a-zA-Z0-9_]+$/,
                              message: "Solo letras, números y guiones bajos",
                            },
                          })}
                        />
                      </div>
                      {profileForm.formState.errors.username && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.username.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="profile-email"
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Correo Electrónico *
                    </Label>
                    <Input
                      id="profile-email"
                      type="email"
                      placeholder="juan@ejemplo.com"
                      className="h-9"
                      {...profileForm.register("email", {
                        required: "El correo electrónico es requerido",
                        pattern: {
                          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                          message: "Formato de correo inválido",
                        },
                      })}
                    />
                    {profileForm.formState.errors.email && (
                      <p className="text-xs text-destructive">
                        {profileForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isProfileLoading || isProfileCooldown}
                      className="min-w-32"
                    >
                      {isProfileLoading || isProfileCooldown ? (
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5 mr-2" />
                      )}
                      {isProfileCooldown ? "Guardado" : "Guardar cambios"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ── Password Tab ─────────────────────────── */}
          {activeTab === "password" && (
            <Card className="border-border/60">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base">
                      Seguridad de la Cuenta
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Cambia tu contraseña de acceso
                    </p>
                  </div>
                </div>

                <Separator className="mb-6" />

                <form
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="space-y-5 max-w-md"
                >
                  <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-xs">
                      Necesitas tu contraseña actual para confirmar el cambio.
                      La nueva contraseña debe tener al menos 8 caracteres.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Contraseña Actual *
                    </Label>
                    <PasswordInput
                      register={passwordForm.register("current_password", {
                        required: "La contraseña actual es requerida",
                      })}
                      placeholder="••••••••"
                      name="current_password"
                      autoComplete="current-password"
                    />
                    {passwordForm.formState.errors.current_password && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.current_password.message}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nueva Contraseña *
                    </Label>
                    <PasswordInput
                      register={passwordForm.register("password", {
                        required: "La contraseña es requerida",
                        minLength: {
                          value: 8,
                          message: "Mínimo 8 caracteres",
                        },
                      })}
                      placeholder="••••••••"
                      name="password"
                      autoComplete="new-password"
                    />
                    {passwordForm.formState.errors.password && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Confirmar Nueva Contraseña *
                    </Label>
                    <PasswordInput
                      register={passwordForm.register("password_confirmation", {
                        required: "La confirmación es requerida",
                        validate: (value) =>
                          value === passwordForm.watch("password") ||
                          "Las contraseñas no coinciden",
                      })}
                      placeholder="••••••••"
                      name="password_confirmation"
                      autoComplete="new-password"
                    />
                    {passwordForm.formState.errors.password_confirmation && (
                      <p className="text-xs text-destructive">
                        {
                          passwordForm.formState.errors.password_confirmation
                            .message
                        }
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isProfileLoading || isPasswordCooldown}
                      className="min-w-36"
                    >
                      {isProfileLoading || isPasswordCooldown ? (
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5 mr-2" />
                      )}
                      {isPasswordCooldown
                        ? "Actualizada"
                        : "Actualizar contraseña"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ── Business Tab (admin/manager only) ────── */}
          {activeTab === "business" && canManageBusiness && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form
                  onSubmit={businessForm.handleSubmit(onBusinessSubmit)}
                  className="space-y-4"
                >
                  {/* Publish state — first, because it is the highest-impact
                      switch on this page: it decides whether buyers can see the
                      catalog at all. */}
                  <Card
                    className={
                      businessForm.watch("published")
                        ? "border-emerald-500/30"
                        : "border-amber-500/40"
                    }
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${
                              businessForm.watch("published")
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-amber-500/10 text-amber-600"
                            }`}
                          >
                            {businessForm.watch("published") ? (
                              <Globe className="w-5 h-5" />
                            ) : (
                              <EyeOff className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <h2 className="font-semibold text-base">
                              {businessForm.watch("published")
                                ? "Tienda en vivo"
                                : "Tienda fuera de línea"}
                            </h2>
                            <p className="text-xs text-muted-foreground max-w-md mt-0.5">
                              {businessForm.watch("published")
                                ? "Tus clientes pueden ver el catálogo y hacer pedidos."
                                : "Los clientes ven un aviso de que estás preparando la tienda. Quien ya hizo un pedido sigue viendo el suyo y puede subir su comprobante."}
                            </p>
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm shrink-0">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input"
                            {...businessForm.register("published")}
                          />
                          Visible para clientes
                        </label>
                      </div>

                      {!businessForm.watch("published") && (
                        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500 mt-4">
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription className="text-xs">
                            El cambio se aplica al guardar esta sección.
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  {/* Logo Card */}
                  <Card className="border-border/60">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-base">
                            Identidad de la Tienda
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Logo, nombre y eslogan
                          </p>
                        </div>
                      </div>

                      <Separator className="mb-6" />

                      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                        {/* Logo Upload */}
                        <div className="flex flex-col items-center gap-3 shrink-0">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                fileInputRef.current?.click();
                              }
                            }}
                            className="relative flex items-center justify-center w-28 h-28 overflow-hidden rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors group bg-muted/40"
                          >
                            {preview ? (
                              <>
                                <img
                                  src={preview}
                                  alt="Logo"
                                  className="object-contain w-full h-full bg-white"
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                                  <Upload className="w-5 h-5 text-white mb-1" />
                                  <span className="text-[10px] text-white font-medium">
                                    Cambiar
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-muted-foreground px-2">
                                <Upload className="w-6 h-6 mx-auto mb-1" />
                                <p className="text-[10px]">Subir logo</p>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground text-center">
                            PNG, JPG, WEBP · máx 2MB
                          </p>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            name={logoRegister.name}
                            onChange={logoRegister.onChange}
                            onBlur={logoRegister.onBlur}
                            ref={(el) => {
                              fileInputRef.current = el;
                              logoRegister.ref(el);
                            }}
                          />
                          {businessForm.formState.errors.logo && (
                            <p className="text-xs text-destructive text-center">
                              {businessForm.formState.errors.logo.message}
                            </p>
                          )}
                        </div>

                        {/* Name + Slogan */}
                        <div className="flex-1 grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Nombre del Negocio *
                            </Label>
                            <Input
                              placeholder="Nombre de tu tienda"
                              className="h-9"
                              {...businessForm.register("name", {
                                required: "El nombre es requerido",
                                maxLength: {
                                  value: 100,
                                  message: "Máximo 100 caracteres",
                                },
                              })}
                            />
                            {businessForm.formState.errors.name && (
                              <p className="text-xs text-destructive">
                                {businessForm.formState.errors.name.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Eslogan
                            </Label>
                            <Input
                              placeholder="Powered by RysthDesign"
                              className="h-9"
                              {...businessForm.register("slogan", {
                                maxLength: {
                                  value: 200,
                                  message: "Máximo 200 caracteres",
                                },
                              })}
                            />
                            {businessForm.formState.errors.slogan && (
                              <p className="text-xs text-destructive">
                                {businessForm.formState.errors.slogan.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Contact & Social Card */}
                  <Card className="border-border/60">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                          <Share2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-base">
                            Contacto y Redes Sociales
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Datos de contacto y presencia digital
                          </p>
                        </div>
                      </div>

                      <Separator className="mb-6" />

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Phone className="w-3 h-3" /> WhatsApp
                          </Label>
                          <div className="flex gap-2">
                            <select
                              value={whatsappCountryCode}
                              onChange={(e) =>
                                setWhatsappCountryCode(e.target.value)
                              }
                              className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
                              aria-label="Código de país WhatsApp"
                            >
                              {WHATSAPP_COUNTRY_CODES.map((country) => (
                                <option
                                  key={country.value}
                                  value={country.value}
                                >
                                  {country.label}
                                </option>
                              ))}
                            </select>
                            <Input
                              type="tel"
                              inputMode="numeric"
                              placeholder="985784621"
                              className="h-9"
                              {...businessForm.register("whatsapp", {
                                pattern: {
                                  value: /^\d{6,15}$/,
                                  message: "Número inválido",
                                },
                              })}
                            />
                          </div>
                          {businessForm.formState.errors.whatsapp && (
                            <p className="text-xs text-destructive">
                              {businessForm.formState.errors.whatsapp.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Instagram className="w-3 h-3" /> Instagram
                          </Label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-sm text-muted-foreground">
                              @
                            </span>
                            <Input
                              className="pl-7 h-9"
                              placeholder="usuario"
                              {...businessForm.register("instagram", {
                                pattern: {
                                  value: /^[a-zA-Z0-9._]+$/,
                                  message: "Usuario inválido",
                                },
                              })}
                            />
                          </div>
                          {businessForm.formState.errors.instagram && (
                            <p className="text-xs text-destructive">
                              {businessForm.formState.errors.instagram.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Facebook className="w-3 h-3" /> Facebook
                          </Label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-sm text-muted-foreground">
                              @
                            </span>
                            <Input
                              className="pl-7 h-9"
                              placeholder="usuario"
                              {...businessForm.register("facebook", {
                                pattern: {
                                  value: /^[a-zA-Z0-9.]+$/,
                                  message: "Usuario inválido",
                                },
                              })}
                            />
                          </div>
                          {businessForm.formState.errors.facebook && (
                            <p className="text-xs text-destructive">
                              {businessForm.formState.errors.facebook.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            TikTok
                          </Label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-sm text-muted-foreground">
                              @
                            </span>
                            <Input
                              className="pl-7 h-9"
                              placeholder="usuario"
                              {...businessForm.register("tiktok", {
                                pattern: {
                                  value: /^[a-zA-Z0-9._]+$/,
                                  message: "Usuario inválido",
                                },
                              })}
                            />
                          </div>
                          {businessForm.formState.errors.tiktok && (
                            <p className="text-xs text-destructive">
                              {businessForm.formState.errors.tiktok.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Store (delivery + payment) Card */}
                  <Card className="border-border/60">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
                          <StoreIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-base">
                            Entrega y Pagos
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Lo que verán tus clientes al finalizar el pedido
                          </p>
                        </div>
                      </div>

                      <Separator className="mb-6" />

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" /> Dirección del local
                          </Label>
                          <Input
                            placeholder="Av. Amazonas N34-100, Quito"
                            className="h-9"
                            {...businessForm.register("address", {
                              maxLength: {
                                value: 200,
                                message: "Máximo 200 caracteres",
                              },
                            })}
                          />
                          {businessForm.formState.errors.address && (
                            <p className="text-xs text-destructive">
                              {businessForm.formState.errors.address.message}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Se muestra a quienes eligen retiro en local.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Navigation className="w-3 h-3" /> Ubicación en
                            Google Maps
                          </Label>
                          <Input
                            placeholder="https://maps.app.goo.gl/..."
                            className="h-9"
                            {...businessForm.register("maps_url", {
                              maxLength: {
                                value: 500,
                                message: "Máximo 500 caracteres",
                              },
                              // Mirrors Business::MAPS_URL_FORMAT on the API so
                              // the shop sees the problem before submitting.
                              pattern: {
                                value:
                                  /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?\/maps|maps\.google\.[a-z]{2,3}(\.[a-z]{2})?\/)/i,
                                message:
                                  "Debe ser un enlace de Google Maps (ej. https://maps.app.goo.gl/...)",
                              },
                              setValueAs: (value: string) =>
                                (value || "").trim(),
                            })}
                          />
                          {businessForm.formState.errors.maps_url && (
                            <p className="text-xs text-destructive">
                              {businessForm.formState.errors.maps_url.message}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Abre Google Maps, busca tu local, toca Compartir y
                            pega aquí el enlace. Tus clientes verán un botón
                            "Cómo llegar".
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Truck className="w-3 h-3" /> Notas de entrega
                          </Label>
                          <Textarea
                            rows={3}
                            placeholder="Entregas en Quito de lunes a sábado. Costo de envío $3."
                            {...businessForm.register("delivery_notes", {
                              maxLength: {
                                value: 1000,
                                message: "Máximo 1000 caracteres",
                              },
                            })}
                          />
                          {businessForm.formState.errors.delivery_notes && (
                            <p className="text-xs text-destructive">
                              {
                                businessForm.formState.errors.delivery_notes
                                  .message
                              }
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Landmark className="w-3 h-3" /> Datos para
                            transferencia
                          </Label>
                          <Textarea
                            rows={3}
                            placeholder="Banco Pichincha · Ahorros 2201234567 · Nombre del titular · Cédula 1712345678"
                            {...businessForm.register("bank_instructions", {
                              maxLength: {
                                value: 1000,
                                message: "Máximo 1000 caracteres",
                              },
                            })}
                          />
                          {businessForm.formState.errors.bank_instructions && (
                            <p className="text-xs text-destructive">
                              {
                                businessForm.formState.errors.bank_instructions
                                  .message
                              }
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Mail className="w-3 h-3" /> Correo para avisos
                          </Label>
                          <Input
                            type="email"
                            placeholder="tucorreo@gmail.com"
                            {...businessForm.register("notification_email", {
                              pattern: {
                                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                message: "Ingresa un correo válido",
                              },
                            })}
                          />
                          {businessForm.formState.errors.notification_email ? (
                            <p className="text-xs text-destructive">
                              {
                                businessForm.formState.errors.notification_email
                                  .message
                              }
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Recibirás un aviso aquí cada vez que entre un
                              pedido o un comprobante. Déjalo vacío para no
                              recibir correos.
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Palette className="w-3 h-3" /> Color principal
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              className="h-9 w-16 p-1"
                              aria-label="Selector de color principal"
                              value={
                                businessForm.watch("primary_color") || "#E11D48"
                              }
                              onChange={(event) =>
                                businessForm.setValue(
                                  "primary_color",
                                  event.target.value,
                                  { shouldDirty: true },
                                )
                              }
                            />
                            <Input
                              placeholder="#E11D48"
                              className="h-9 max-w-40"
                              {...businessForm.register("primary_color", {
                                pattern: {
                                  value: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
                                  message: "Usa un color hexadecimal (#E11D48)",
                                },
                              })}
                            />
                          </div>
                          {businessForm.formState.errors.primary_color && (
                            <p className="text-xs text-destructive">
                              {
                                businessForm.formState.errors.primary_color
                                  .message
                              }
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Se usa en los botones y detalles de tu tienda
                            pública.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isLoading}
                      className="min-w-36"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5 mr-2" />
                      )}
                      Guardar configuración
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
