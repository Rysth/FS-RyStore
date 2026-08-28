import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { useStore } from "@nanostores/react";
import { cartItems, clearCart, lineKey, totalAmount } from "../../lib/cart";
import { ApiError, submitCheckout, validateCoupon } from "../../lib/api";
import { formatPrice } from "../../lib/format";
import { lineTotal, unitPriceFor } from "../../lib/pricing";
import {
  DELIVERY_METHODS,
  PAYMENT_METHODS,
  type CouponPreview,
  type DeliveryMethod,
  type PaymentMethod,
} from "../../types/store";
import { SpinnerIcon } from "./icons";
import { useMounted } from "../../lib/useMounted";

/**
 * The shop's delivery_notes are deliberately not rendered here. It is free text,
 * so a price written into it ("costo de envío $3") looked like a quote the
 * checkout would honour — but there is no shipping-cost field in the system and
 * nothing ever added it to the total. This shop also uses different couriers at
 * different prices, so the cost is agreed on WhatsApp instead of quoted here.
 */

interface FieldErrors {
  customer_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  terms?: string;
}

const DELIVERY_OPTIONS: {
  value: DeliveryMethod;
  label: string;
  hint: string;
}[] = [
  { value: DELIVERY_METHODS.DOMICILIO, label: "Envío a domicilio", hint: "Coordinamos por WhatsApp" },
  { value: DELIVERY_METHODS.RETIRO, label: "Retiro en local", hint: "Te avisamos cuando esté listo" },
];

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  label: string;
  hint: string;
}[] = [
  { value: PAYMENT_METHODS.EFECTIVO, label: "Efectivo contra entrega", hint: "Pagas al recibir" },
  { value: PAYMENT_METHODS.TRANSFERENCIA, label: "Transferencia bancaria", hint: "Subes el comprobante después" },
];

export default function CheckoutForm() {
  const mounted = useMounted();
  const items = useStore(cartItems);
  const amount = useStore(totalAmount);
  const visibleItems = mounted ? items : [];
  const visibleAmount = mounted ? amount : 0;

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [checkoutFaxConfirmation, setCheckoutFaxConfirmation] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(
    DELIVERY_METHODS.DOMICILIO,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PAYMENT_METHODS.EFECTIVO,
  );

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingFocusId = useRef<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const serviceOnly = visibleItems.length > 0 && visibleItems.every((item) => item.kind === "service");
  const availableDeliveryOptions = serviceOnly
    ? DELIVERY_OPTIONS.filter((option) => option.value === DELIVERY_METHODS.RETIRO)
    : DELIVERY_OPTIONS;
  const availablePaymentOptions = serviceOnly
    ? PAYMENT_OPTIONS.filter((option) => option.value === PAYMENT_METHODS.TRANSFERENCIA)
    : PAYMENT_OPTIONS;
  const effectiveDeliveryMethod = serviceOnly ? DELIVERY_METHODS.RETIRO : deliveryMethod;
  const effectivePaymentMethod = serviceOnly ? PAYMENT_METHODS.TRANSFERENCIA : paymentMethod;
  const needsAddress = !serviceOnly && effectiveDeliveryMethod === DELIVERY_METHODS.DOMICILIO;

  useEffect(() => {
    if (!serviceOnly) return;

    setDeliveryMethod(DELIVERY_METHODS.RETIRO);
    setPaymentMethod(PAYMENT_METHODS.TRANSFERENCIA);
    setAddress("");
    setCity("");
  }, [serviceOnly]);

  useEffect(() => {
    if (!pendingFocusId.current) return;

    const element = document.getElementById(pendingFocusId.current);
    if (!(element instanceof HTMLElement)) return;

    pendingFocusId.current = null;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => element.focus({ preventScroll: true }), 250);
  }, [fieldErrors, error]);

  function focusField(id: string) {
    pendingFocusId.current = id;
  }

  function fieldFromServerError(caught: unknown): keyof FieldErrors | null {
    const messages = caught instanceof ApiError ? caught.details : [];
    const text = [
      caught instanceof Error ? caught.message : "",
      ...messages,
    ].join(" ").toLowerCase();

    if (text.includes("nombre") || text.includes("customer_name")) return "customer_name";
    if (text.includes("teléfono") || text.includes("telefono") || text.includes("phone")) return "phone";
    if (text.includes("correo") || text.includes("email")) return "email";
    if (text.includes("dirección") || text.includes("direccion") || text.includes("address")) return "address";
    if (text.includes("ciudad") || text.includes("city")) return "city";

    return null;
  }

  async function handleApplyCoupon() {
    const code = couponInput.trim();
    if (!code) return;

    setIsApplyingCoupon(true);
    setCouponError(null);

    try {
        const preview = await validateCoupon(
          code,
          visibleItems.map((item) =>
            item.promotion_id
              ? { promotion_id: item.promotion_id, quantity: item.quantity }
            : {
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
              },
        ),
      );
      setAppliedCoupon(preview);
    } catch (caught) {
      setAppliedCoupon(null);
      setCouponError(
        caught instanceof Error ? caught.message : "No pudimos aplicar el cupón.",
      );
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput("");
  }

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!customerName.trim()) errors.customer_name = "Ingresa tu nombre";
    if (!phone.trim()) {
      errors.phone = "Ingresa tu teléfono";
    } else if (!/^\+?[\d\s-]{7,20}$/.test(phone.trim())) {
      errors.phone = "Ingresa un teléfono válido";
    }
    if (!email.trim()) {
      errors.email = "Ingresa tu correo electrónico";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Ingresa un correo válido";
    }
    if (needsAddress && !address.trim()) {
      errors.address = "La dirección es requerida para envíos a domicilio";
    }
    if (!acceptsTerms) {
      errors.terms = "Debes aceptar los Términos y la Política de Privacidad";
    }

    setFieldErrors(errors);
    const firstError = Object.keys(errors)[0];
    if (firstError) focusField(firstError);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);

    if (visibleItems.length === 0) {
      setError("Tu carrito está vacío.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const { order } = await submitCheckout(
        {
          customer_name: customerName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: serviceOnly ? "" : address.trim(),
          city: serviceOnly ? "" : city.trim(),
          notes: notes.trim(),
          checkout_fax_confirmation: checkoutFaxConfirmation.trim(),
          payment_method: effectivePaymentMethod,
          delivery_method: effectiveDeliveryMethod,
        },
        // A combo line sends its promotion instead of a product: the server
        // prices it from the promotion and draws down every product inside it.
        visibleItems.map((item) =>
          item.promotion_id
            ? { promotion_id: item.promotion_id, quantity: item.quantity }
            : {
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
              },
        ),
        appliedCoupon?.coupon.code,
      );

      // The order is already in the database at this point. Only now do we drop
      // the cart and hand the buyer over to the confirmation page, which opens
      // WhatsApp — so an abandoned message still leaves a record for the shop.
      clearCart();
      window.location.href = `/pedido/${order.token}`;
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "No pudimos registrar tu pedido. Inténtalo de nuevo.";
      const field = fieldFromServerError(caught);

      setError(message);
      if (field) {
        setFieldErrors((current) => ({ ...current, [field]: message }));
        focusField(field);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      setIsSubmitting(false);
    }
  }

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          Tu carrito está vacío.
        </p>
        <a
          href="/"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--rystore-primary)" }}
        >
          Ver productos
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="checkout_fax_confirmation">No completar</label>
        <input
          id="checkout_fax_confirmation"
          name="checkout_fax_confirmation"
          type="text"
          value={checkoutFaxConfirmation}
          onChange={(event) => setCheckoutFaxConfirmation(event.target.value)}
          tabIndex={-1}
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4">
          <h2 className="text-base font-semibold">Tus datos</h2>

          <Field
            id="customer_name"
            label="Nombre completo"
            value={customerName}
            onChange={setCustomerName}
            error={fieldErrors.customer_name}
            autoComplete="name"
          />
          <Field
            id="phone"
            label="Teléfono (WhatsApp)"
            value={phone}
            onChange={setPhone}
            error={fieldErrors.phone}
            type="tel"
            autoComplete="tel"
            placeholder="0987654321"
          />
          <Field
            id="email"
            label="Correo electrónico"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            type="email"
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
          />
          {!serviceOnly && (
            <>
              <Field
                id="city"
                label="Ciudad"
                value={city}
                onChange={setCity}
                error={fieldErrors.city}
                autoComplete="address-level2"
              />
              <Field
                id="address"
                label={needsAddress ? "Dirección" : "Dirección (opcional)"}
                value={address}
                onChange={setAddress}
                error={fieldErrors.address}
                autoComplete="street-address"
              />
            </>
          )}

          <div>
            <label htmlFor="notes" className="mb-1.5 block text-sm font-medium">
              Notas (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2"
              style={{ ["--tw-ring-color" as string]: "var(--rystore-primary)" }}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
          <h2 className="text-base font-semibold">Entrega</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableDeliveryOptions.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                hint={option.hint}
                isSelected={effectiveDeliveryMethod === option.value}
                onSelect={() => setDeliveryMethod(option.value)}
              />
            ))}
          </div>
          {serviceOnly && (
            <p className="text-xs text-muted-foreground">
              Los servicios digitales no requieren dirección de entrega. Los coordinamos por WhatsApp.
            </p>
          )}
          {needsAddress && (
            <p className="text-xs text-muted-foreground">
              El costo del envío se coordina por WhatsApp según tu ubicación y
              el servicio de entrega.
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
          <h2 className="text-base font-semibold">Pago</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {availablePaymentOptions.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                hint={option.hint}
                isSelected={effectivePaymentMethod === option.value}
                onSelect={() => setPaymentMethod(option.value)}
              />
            ))}
          </div>

          {/* The bank details deliberately are not here. They belong to a real
              order, so they appear on the confirmation page once the order
              exists — that way the account number is only handed out with an
              order number to reconcile it against, and the 30-minute window
              starts from a moment the server actually recorded. */}
          {effectivePaymentMethod === PAYMENT_METHODS.TRANSFERENCIA && (
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              Al confirmar el pedido te mostramos los datos de la cuenta y
              tendrás 30 minutos para hacer la transferencia y subir el
              comprobante.
            </p>
          )}
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-border/60 bg-card p-4 lg:sticky lg:top-20">
        <h2 className="text-base font-semibold">Tu pedido</h2>

        <ul className="space-y-2 text-sm">
          {visibleItems.map((item) => (
            <li key={lineKey(item)} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="font-medium">{item.quantity} x</span> {item.name}
                {item.variant_label && (
                  <span className="block text-xs text-muted-foreground">
                    {item.variant_label}
                  </span>
                )}
                {item.details && (
                  <span className="block text-xs text-muted-foreground">
                    {item.details}
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">
                  {formatPrice(unitPriceFor(item, item.quantity))} c/u
                </span>
              </span>
              <span className="shrink-0 font-medium">
                {formatPrice(lineTotal(item))}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border/60 pt-3">
          {appliedCoupon ? (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span>
                Cupón <span className="font-semibold">{appliedCoupon.coupon.code}</span>
              </span>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Quitar
              </button>
            </div>
          ) : (
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(event) => {
                  setCouponInput(event.target.value);
                  setCouponError(null);
                }}
                placeholder="Código de cupón"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2"
                style={{ ["--tw-ring-color" as string]: "var(--rystore-primary)" }}
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={isApplyingCoupon || !couponInput.trim()}
                className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                {isApplyingCoupon ? "..." : "Aplicar"}
              </button>
            </div>
          )}
          {couponError && (
            <p className="mb-2 text-xs text-destructive">{couponError}</p>
          )}

          {appliedCoupon && (
            <div className="mb-1 flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
                <span>{formatPrice(visibleAmount)}</span>
              </div>
          )}
          {appliedCoupon && (
            <div className="mb-1 flex items-center justify-between text-sm text-emerald-600">
              <span>Descuento</span>
              <span>-{formatPrice(appliedCoupon.discount_amount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatPrice(appliedCoupon ? appliedCoupon.total : visibleAmount)}</span>
          </div>
        </div>

        <div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              id="terms"
              type="checkbox"
              checked={acceptsTerms}
              onChange={(event) => {
                setAcceptsTerms(event.target.checked);
                if (event.target.checked) {
                  setFieldErrors((current) => ({ ...current, terms: undefined }));
                }
              }}
              aria-invalid={Boolean(fieldErrors.terms)}
              className="mt-0.5 size-4 shrink-0 rounded border-border"
            />
            <span>
              He leído y acepto los{" "}
              <a
                href="/terminos-y-privacidad"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Términos y Condiciones y la Política de Privacidad
              </a>
              , incluido el tratamiento de mis datos personales conforme a la
              Ley Orgánica de Protección de Datos Personales del Ecuador.
            </span>
          </label>
          {fieldErrors.terms && (
            <p className="mt-1 text-xs text-destructive">{fieldErrors.terms}</p>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--rystore-primary)" }}
        >
          {isSubmitting && <SpinnerIcon className="size-4" />}
          {isSubmitting ? "Registrando pedido..." : "Enviar pedido por WhatsApp"}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Tu pedido queda registrado aunque no envíes el mensaje.
        </p>
      </aside>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-transparent focus:ring-2 ${
          error ? "border-destructive" : "border-border"
        }`}
        style={{ ["--tw-ring-color" as string]: "var(--rystore-primary)" }}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function OptionCard({
  label,
  hint,
  isSelected,
  onSelect,
}: {
  label: string;
  hint: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`rounded-xl border p-3 text-left transition-colors ${
        isSelected ? "border-transparent bg-muted/60 ring-2" : "border-border hover:bg-muted/40"
      }`}
      style={
        isSelected
          ? ({ ["--tw-ring-color" as string]: "var(--rystore-primary)" } as CSSProperties)
          : undefined
      }
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
