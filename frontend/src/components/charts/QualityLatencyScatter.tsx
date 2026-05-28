import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Legend,
} from "recharts";

import { modelChartStyle } from "../../lib/modelProviders";
import type { ModelSummary } from "../../types";

interface Props {
  data: ModelSummary[];
}

export default function QualityLatencyScatter({ data }: Props) {
  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center text-sm text-ink-400">No data to plot.</div>;
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
          <XAxis
            type="number"
            dataKey="x"
            name="Latency (ms)"
            unit="ms"
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Overall score"
            domain={[0, 5]}
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
          />
          <ZAxis type="number" dataKey="z" range={[60, 200]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value: number, name: string) => {
              if (name === "Latency (ms)") return `${Number(value).toFixed(0)} ms`;
              if (name === "Overall score") return Number(value).toFixed(2);
              return value;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.map((row) => {
            const style = modelChartStyle(row.model_name);
            return (
              <Scatter
                key={row.model_name}
                name={row.model_name}
                data={[
                  {
                    x: row.avg_latency_ms ?? 0,
                    y: row.avg_overall ?? 0,
                    z: row.count,
                  },
                ]}
                fill={style.color}
              />
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
