import clsx from "clsx";

import { inferModelProvider } from "../lib/modelProviders";
import { ModelProviderIcon } from "./ModelProviderIcon";

interface Props {
  name: string;
  /** Stack provider icon + label under the model name. */
  layout?: "stack" | "inline";
  showProvider?: boolean;
  align?: "center" | "start";
  className?: string;
  nameClassName?: string;
  providerClassName?: string;
}

export default function ModelLabel({
  name,
  layout = "stack",
  showProvider = true,
  align = "center",
  className,
  nameClassName,
  providerClassName,
}: Props) {
  const provider = inferModelProvider(name);

  if (!showProvider) {
    return <span className={clsx(nameClassName, className)}>{name}</span>;
  }

  if (layout === "inline") {
    return (
      <span className={clsx("inline-flex items-center gap-1.5", className)}>
        <ModelProviderIcon providerId={provider.id} size={14} />
        <span className={nameClassName}>{name}</span>
      </span>
    );
  }

  return (
    <div
      className={clsx(
        "inline-flex flex-col gap-0.5",
        align === "start" ? "items-start" : "items-center",
        className,
      )}
    >
      <span className={clsx("font-mono text-sm leading-tight", nameClassName)}>{name}</span>
      <span
        className={clsx(
          "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
          providerClassName ?? "text-ink-400",
        )}
      >
        <ModelProviderIcon providerId={provider.id} size={12} />
        {provider.label}
      </span>
    </div>
  );
}
