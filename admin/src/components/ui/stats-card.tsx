import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  trend?: {
    value: string;
    isPositive: boolean;
    label?: string;
  };
  badge?: {
    text: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
  };
  className?: string;
  children?: ReactNode;
  variant?: "default" | "minimal" | "colored";
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10",
  trend,
  className = "",
  children,
  variant = "default",
}: StatsCardProps) {
  if (variant === "minimal") {
    return (
      <div className={cn("p-4 rounded-xl bg-muted/40", className)}>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {title}
        </p>
        {children || (
          <p className="text-lg font-semibold tabular-nums">{value}</p>
        )}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    );
  }

  if (variant === "colored") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm",
          className,
        )}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {children || (
              <p className="text-2xl font-bold tracking-tight tabular-nums">
                {value}
              </p>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.isPositive ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {trend.isPositive ? "↑" : "↓"} {trend.value}
                </span>
                {trend.label && (
                  <span className="text-xs text-muted-foreground">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl",
                iconBgColor,
              )}
            >
              <Icon className={cn("h-6 w-6", iconColor)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {children || (
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {value}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              iconBgColor,
            )}
          >
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
        )}
      </div>
      {(description || trend) && (
        <div className="pt-3 mt-3 border-t">
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-emerald-600" : "text-red-600",
                )}
              >
                {trend.isPositive ? "↑" : "↓"} {trend.value}
              </span>
              {trend.label && (
                <span className="text-xs text-muted-foreground">
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
