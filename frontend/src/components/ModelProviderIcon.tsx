import type { ModelProviderId } from "../lib/modelProviders";

interface IconProps {
  size?: number;
  className?: string;
}

/** Minimal brand marks (simplified geometry + official-ish brand colors). */
function MetaIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#0866FF"
        d="M12 2.5c-2.8 0-5.1 1.6-6.3 4.1-.6 1.2-.9 2.6-.9 4 0 3.8 3.1 6.9 6.9 6.9 1.5 0 2.9-.5 4-1.3 1.1.8 2.5 1.3 4 1.3 3.8 0 6.9-3.1 6.9-6.9 0-1.4-.3-2.8-.9-4C17.1 4.1 14.8 2.5 12 2.5Zm-3.8 5.2c1.1-1.5 2.6-2.4 3.8-2.4s2.7.9 3.8 2.4c-1.1 1.5-2.6 2.4-3.8 2.4s-2.7-.9-3.8-2.4Z"
      />
    </svg>
  );
}

function GoogleIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.7a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3-4.5 3-7.5Z" />
      <path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.2v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.2 13.6A6 6 0 0 1 6 12c0-.6.1-1.1.2-1.6v-2.7H2.2A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.5l3.1-2.9Z" />
      <path fill="#EA4335" d="M12 5.8c1.5 0 2.9.5 3.9 1.5l2.9-2.9C17.2 2.9 14.8 2 12 2 7.7 2 4 4.5 2.2 8.7l3.1 2.7C6.2 8.8 8.9 5.8 12 5.8Z" />
    </svg>
  );
}

function MistralIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#F7D046" />
      <path fill="#1a1a1a" d="M6 7h2.5v10H6V7Zm4.5 0H13v10h-2.5V7Zm4.5 0H19v10h-2.5V7Z" />
    </svg>
  );
}

function MicrosoftIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="3" width="8.5" height="8.5" fill="#F25022" />
      <rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}

function AlibabaIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#FF6A00" />
      <path
        fill="#fff"
        d="M6.5 8.5c2.2-.3 4.3-.3 6.5 0 1.8.2 3.2 1.2 3.2 2.6 0 1.1-.8 2-2.1 2.5 1.6.5 2.6 1.5 2.6 2.9 0 2-2.4 3.2-5.8 3.2H6.5V8.5Zm3.2 3.6h2.1c1 0 1.6-.4 1.6-1.1 0-.7-.6-1.1-1.6-1.1H9.7v2.2Zm0 4.4h2.6c1.2 0 1.9-.5 1.9-1.2 0-.8-.7-1.2-1.9-1.2H9.7v2.4Z"
      />
    </svg>
  );
}

function OpenAIIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#10A37F"
        d="M12 2a9.8 9.8 0 0 0-8.3 4.6 9.8 9.8 0 0 0 3.4 13.4 9.8 9.8 0 0 0 13.4-3.4A9.8 9.8 0 0 0 12 2Zm0 2.2c1.6 0 3.1.5 4.3 1.4L9.6 12.3A5.8 5.8 0 0 1 12 4.2Zm-4.8 2.1A5.8 5.8 0 0 1 12 6.2c1.2 0 2.3.3 3.3.9l-6.8 6.8A5.8 5.8 0 0 1 7.2 6.3ZM12 17.8a5.8 5.8 0 0 1-3.3-1l6.8-6.8c.6 1 .9 2.1.9 3.3 0 1.6-.5 3.1-1.4 4.3l-3-3.8Z"
      />
    </svg>
  );
}

function AnthropicIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#D4A27F" />
      <path fill="#1a1a1a" d="M12 5 7 17h2.2l1-2.6h3.6l1 2.6H17L12 5Zm-1.1 7.2 1.1-3 1.1 3h-2.2Z" />
    </svg>
  );
}

function DeepSeekIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#4D6BFE" />
      <path fill="#fff" d="M7 8h10v2H7V8Zm0 4h7v2H7v-2Z" />
    </svg>
  );
}

function OllamaIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#1a1a1a" />
      <circle cx="12" cy="10" r="4" fill="#fff" />
      <path fill="#fff" d="M8 16c0-2.2 1.8-4 4-4s4 1.8 4 4v1H8v-1Z" opacity="0.9" />
    </svg>
  );
}

const ICONS: Record<ModelProviderId, (props: IconProps) => JSX.Element> = {
  meta: MetaIcon,
  google: GoogleIcon,
  mistral: MistralIcon,
  microsoft: MicrosoftIcon,
  alibaba: AlibabaIcon,
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
  deepseek: DeepSeekIcon,
  ollama: OllamaIcon,
};

export function ModelProviderIcon({
  providerId,
  size = 14,
  className,
}: {
  providerId: ModelProviderId;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[providerId] ?? OllamaIcon;
  return <Icon size={size} className={className} />;
}
