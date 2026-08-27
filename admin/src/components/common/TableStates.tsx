import { type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";

interface TableLoadingRowProps {
  colSpan: number;
  label: string;
}

/**
 * Loading and empty rows for every table in the dashboard.
 *
 * Each index page used to inline its own copy, and they had already drifted:
 * different heights, different icon sizes, and hard-coded colSpans that no
 * longer matched their own column count once a permission hid a column.
 */
export function TableLoadingRow({ colSpan, label }: TableLoadingRowProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-32 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface TableEmptyRowProps {
  colSpan: number;
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Usually the "create the first one" button, when the user may create. */
  action?: ReactNode;
}

export function TableEmptyRow({
  colSpan,
  icon: Icon,
  title,
  description,
  action,
}: TableEmptyRowProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-48 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      </TableCell>
    </TableRow>
  );
}
