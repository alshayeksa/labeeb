import { Check, KeyRound, Globe2 } from "./icons";
import type { AiProvider } from "./bridge";
export const aiDefaults: Record<AiProvider, string> = { openai: "gpt-4.1-mini", deepseek: "deepseek-flash", claude: "claude-sonnet-5-5", custom: "" };
export function providerName(provider: AiProvider, ar: boolean) {
  return {openai: "OpenAI", deepseek: "DeepSeek", claude: "Claude", custom: ar ? "مخصّص" : "Custom"}[provider];
}
export default function AiProviderPicker({ value, onChange, disabled, ar }: {value: AiProvider; onChange: (value: AiProvider) => void; disabled: boolean; ar: boolean}) {
  return <fieldset className="ai-provider-picker" disabled={disabled}>
    <legend className="field-label">{ar ? "مزوّد الذكاء الاصطناعي" : "AI provider"}</legend>
    <div className="ai-provider-grid">
      {(["openai", "deepseek", "claude", "custom"] as const).map(provider => <label key={provider} className={`ai-provider-card ${value === provider ? "is-selected" : ""}`}>
        <input type="radio" name="ai-provider" aria-label={providerName(provider, ar)} value={provider} checked={value === provider} onChange={() => onChange(provider)}/>
        <span className={`ai-provider-symbol ${provider}`} aria-hidden="true">{provider === "custom" ? <Globe2 size={20}/> : <KeyRound size={20}/>}</span>
        <span className="ai-provider-copy"><strong>{providerName(provider, ar)}</strong><small>{provider === "custom" ? (ar ? "ربط خدمتك" : "Your connection") : provider === "claude" ? "Anthropic" : provider === "deepseek" ? "DeepSeek API" : "OpenAI API"}</small></span>
        <span className="ai-provider-check" aria-hidden="true">{value === provider && <Check size={16}/>}</span>
      </label>)}
    </div>
  </fieldset>;
}
