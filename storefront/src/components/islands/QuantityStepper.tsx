import { MinusIcon, PlusIcon } from "./icons";

interface Props {
  quantity: number;
  onChange: (quantity: number) => void;
  max?: number | null;
  size?: "sm" | "md";
  label?: string;
}

export default function QuantityStepper({
  quantity,
  onChange,
  max,
  size = "md",
  label = "Cantidad",
}: Props) {
  const atMax = max != null && quantity >= max;
  const button =
    size === "sm"
      ? "flex size-8 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-40"
      : "flex size-10 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-40";
  const icon = size === "sm" ? "size-3.5" : "size-4";

  return (
    <div
      className="inline-flex items-center rounded-full border border-border"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={button}
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 1}
        aria-label="Quitar una unidad"
      >
        <MinusIcon className={icon} />
      </button>
      <span
        className={`min-w-8 text-center font-medium tabular-nums ${size === "sm" ? "text-sm" : ""}`}
        aria-live="polite"
      >
        {quantity}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(quantity + 1)}
        disabled={atMax}
        aria-label="Agregar una unidad"
      >
        <PlusIcon className={icon} />
      </button>
    </div>
  );
}
