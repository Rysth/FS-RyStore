"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { chartColors, type AvailableChartColorsKeys } from "../lib/chartUtils";

interface ComboChartProps {
  data: Record<string, string | number>[];
  index: string;
  enableBiaxial?: boolean;
  className?: string;
  barSeries: {
    categories: string[];
    yAxisLabel?: string;
    colors?: AvailableChartColorsKeys[];
  };
  lineSeries: {
    categories: string[];
    showYAxis?: boolean;
    yAxisLabel?: string;
    colors?: AvailableChartColorsKeys[];
    yAxisWidth?: number;
  };
}

export const ComboChart = ({
  data,
  index,
  enableBiaxial = false,
  className,
  barSeries,
  lineSeries,
}: ComboChartProps) => {
  return (
    <div className={cn("w-full h-80", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <XAxis
            dataKey={index}
            className="text-sm text-gray-600 dark:text-gray-400"
          />
          <YAxis
            yAxisId="left"
            className="text-sm text-gray-600 dark:text-gray-400"
          />
          {enableBiaxial && lineSeries.showYAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              width={lineSeries.yAxisWidth || 60}
              className="text-sm text-gray-600 dark:text-gray-400"
            />
          )}
          <Tooltip
            labelClassName="text-gray-900 dark:text-gray-100"
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
            }}
          />
          {barSeries.categories.map((category, index) => (
            <Bar
              key={category}
              yAxisId="left"
              dataKey={category}
              fill={`var(--color-${
                (barSeries.colors || ["blue"])[
                  index % (barSeries.colors || ["blue"]).length
                ]
              })`}
              className={
                chartColors[
                  (barSeries.colors || ["blue"])[
                    index % (barSeries.colors || ["blue"]).length
                  ]
                ]?.fill
              }
            />
          ))}
          {lineSeries.categories.map((category, index) => (
            <Line
              key={category}
              yAxisId={enableBiaxial ? "right" : "left"}
              type="monotone"
              dataKey={category}
              stroke={`var(--color-${
                (lineSeries.colors || ["amber"])[
                  index % (lineSeries.colors || ["amber"]).length
                ]
              })`}
              strokeWidth={3}
              dot={false}
              className={
                chartColors[
                  (lineSeries.colors || ["amber"])[
                    index % (lineSeries.colors || ["amber"]).length
                  ]
                ]?.stroke
              }
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
