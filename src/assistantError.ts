import type { TranslationKey } from "./i18n";

// Keep raw network/provider errors out of the UI; they can contain technical
// details and do not reliably identify a connectivity failure's root cause.
export function assistantErrorKey(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Configure API key first")) return "configureFirst";
  if (message.includes("AI request timed out")) return "aiTimeout";
  if (message.includes("AI output limit reached") || message.includes("No AI response text")) return "aiEmptyResponse";
  if (message.includes("AI service unreachable") || message.includes("Network setup failed")) return "aiConnectionError";
  const status = message.match(/AI service returned HTTP (\d{3})/)?.[1];
  if (status === "401") return "aiInvalidKey";
  if (status === "403") return "aiAccessDenied";
  if (status === "404") return "aiModelUnavailable";
  if (status === "400" || status === "422") return "aiRequestRejected";
  if (status === "429" || status === "402") return "aiRateLimit";
  if (status?.startsWith("5")) return "aiServiceUnavailable";
  return "aiError";
}
