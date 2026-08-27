"use client";

import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { chartColors, type AvailableChartColorsKeys } from "../lib/chartUtils";

interface AreaChartProps {
  data: Record<string, string | number>[];
  index: string;
  categories: string[];
  className?: string;
  colors?: AvailableChartColorsKeys[];
  valueFormatter?: (value: number) => string;
  onValueChange?: (value: Record<string, string | number>) => void;
}

export const AreaChart = ({
  data,
  index,
  categories,
  className,
  colors = ["blue", "emerald"],
  valueFormatter,
}: AreaChartProps) => {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <XAxis
            dataKey={index}
            className="text-sm text-gray-600 dark:text-gray-400"
          />
          <YAxis
            className="text-sm text-gray-600 dark:text-gray-400"
            tickFormatter={valueFormatter}
          />
          <Tooltip
            formatter={valueFormatter}
            labelClassName="text-gray-900 dark:text-gray-100"
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
            }}
          />
          {categories.map((category, index) => (
            <Area
              key={category}
              type="monotone"
              dataKey={category}
              stroke={`var(--color-${colors[index % colors.length]})`}
              fill={`var(--color-${colors[index % colors.length]})`}
              fillOpacity={0.3}
              className={chartColors[colors[index % colors.length]]?.stroke}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
};
