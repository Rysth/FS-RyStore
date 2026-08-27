"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { chartColors, type AvailableChartColorsKeys } from "../lib/chartUtils";

interface DonutChartProps {
  data: Record<string, string | number>[];
  category: string;
  value: string;
  className?: string;
  colors?: AvailableChartColorsKeys[];
  valueFormatter?: (value: number) => string;
}

export const DonutChart = ({
  data,
  category,
  value,
  className,
  colors = ["blue", "emerald", "violet", "amber", "gray"],
  valueFormatter,
}: DonutChartProps) => {
  return (
    <div className={cn("w-full h-80", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={120}
            paddingAngle={2}
            dataKey={value}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${entry[category] ?? index}`}
                fill={`var(--color-${colors[index % colors.length]})`}
                className={chartColors[colors[index % colors.length]]?.fill}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={valueFormatter}
            labelClassName="text-gray-900 dark:text-gray-100"
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
