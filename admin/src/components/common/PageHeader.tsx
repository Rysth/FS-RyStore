import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Renders the back arrow to the left of the title. */
  backTo?: string;
  backLabel?: string;
  /** Buttons or badges pinned to the right edge. */
  actions?: ReactNode;
}

/**
 * The one header every dashboard page uses.
 *
 * It exists because the four index pages had each grown their own arrangement
 * of the same three parts — the titles sat at different heights and the primary
 * button wrapped differently on mobile, which reads as four half-finished
 * screens rather than one panel.
 */
export default function PageHeader({
  title,
  description,
  backTo,
  backLabel = "Volver",
  actions,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        {backTo && (
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 shrink-0"
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
