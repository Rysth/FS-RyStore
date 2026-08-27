import { memo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { chartColors, type AvailableChartColorsKeys } from "../../../../lib/chartUtils";

export interface RankingRow {
  name: string;
  value: number;
}

interface RankingChartProps {
  data: RankingRow[];
  className?: string;
  colors?: AvailableChartColorsKeys[];
  valueFormatter?: (value: number) => string;
}

const MAX_LABEL_LENGTH = 18;

function truncateLabel(name: string): string {
  return name.length > MAX_LABEL_LENGTH ? `${name.slice(0, MAX_LABEL_LENGTH - 1)}…` : name;
}

function RankingChartImpl({
  data,
  className,
  colors = ["emerald"],
  valueFormatter,
}: RankingChartProps) {
  const height = Math.max(data.length * 44 + 24, 160);
  const labelWidth =
    Math.max(...data.map((row) => truncateLabel(row.name).length), 10) * 7 + 12;

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.map((row) => ({ ...row, label: truncateLabel(row.name) }))}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            horizontal={false}
            strokeDasharray="3 3"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <XAxis
            type="number"
            tickFormatter={(value: number) =>
              valueFormatter ? valueFormatter(value) : String(value)
            }
            className="text-xs text-gray-600 dark:text-gray-400"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            className="text-xs text-gray-600 dark:text-gray-400"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
            formatter={(value) =>
              valueFormatter ? valueFormatter(Number(value)) : String(value)
            }
            labelClassName="text-gray-900 dark:text-gray-100 font-medium"
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            maxBarSize={22}
            background={{ fill: "transparent" }}
          >
            {data.map((row, index) => (
              <Cell
                key={row.name}
                className={chartColors[colors[index % colors.length]]?.fill}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const RankingChart = memo(RankingChartImpl);
