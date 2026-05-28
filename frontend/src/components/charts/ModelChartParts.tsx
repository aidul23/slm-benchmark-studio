import type { ReactElement } from "react";

import { inferModelProvider, shortModelName } from "../../lib/modelProviders";
import { ModelProviderIcon } from "../ModelProviderIcon";

/** Recharts X-axis tick: provider logo + truncated model name (AA-style). */
export function ModelChartAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}): ReactElement {
  const model = payload?.value ?? "";
  const provider = inferModelProvider(model);

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-36} y={0} width={72} height={56} className="overflow-visible">
        <div className="flex flex-col items-center justify-start gap-0.5 pt-1">
          <ModelProviderIcon providerId={provider.id} size={18} />
          <span
            className="max-w-[68px] truncate text-center text-[9px] leading-tight text-ink-500"
            title={model}
          >
            {shortModelName(model, 16)}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

/** Value label rendered inside the bar (white text on brand color). */
export function BarInsideLabel(props: Record<string, unknown> & {
  formatter?: (value: number) => string;
}): ReactElement | null {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  const { formatter } = props;
  if (height < 14 || value === 0) return null;
  const text = formatter ? formatter(value) : String(Math.round(value));
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={11}
      fontWeight={600}
    >
      {text}
    </text>
  );
}

/** Default chart margins when using logo axis ticks. */
export const MODEL_CHART_MARGINS = { top: 12, right: 16, left: 4, bottom: 8 };
export const MODEL_CHART_XAXIS_HEIGHT = 64;
