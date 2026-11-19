import { expect, it } from "vitest";
import { assistantErrorKey } from "./assistantError";

it.each([
  ["Configure API key first", "configureFirst"],
  ["AI service unreachable", "aiConnectionError"],
  ["Network setup failed", "aiConnectionError"],
  ["AI request timed out", "aiTimeout"],
  ["AI service returned HTTP 401", "aiInvalidKey"],
  ["AI service returned HTTP 402", "aiRateLimit"],
  ["AI service returned HTTP 403", "aiAccessDenied"],
  ["AI service returned HTTP 404", "aiModelUnavailable"],
  ["AI service returned HTTP 400", "aiRequestRejected"],
  ["AI service returned HTTP 422", "aiRequestRejected"],
  ["AI output limit reached", "aiEmptyResponse"],
  ["No AI response text", "aiEmptyResponse"],
  ["AI service returned HTTP 429", "aiRateLimit"],
  ["AI service returned HTTP 503", "aiServiceUnavailable"],
  ["unexpected error with sensitive details", "aiError"],
])("maps %s without displaying raw error details", (message, key)=>{
  expect(assistantErrorKey(message)).toBe(key);
  expect(assistantErrorKey(new Error(message))).toBe(key);
});
