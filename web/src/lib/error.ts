import { ConnectError } from "@connectrpc/connect";
import i18n from "@/i18n";

export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof ConnectError) {
    return error.rawMessage || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return fallback;
}

export function handleError(
  error: unknown,
  toast: (message: string) => void,
  options?: {
    context?: string;
    fallbackMessage?: string;
    onError?: (error: unknown) => void;
  },
): void {
  const contextPrefix = options?.context ? `${options.context}: ` : "";
  const fallback = options?.fallbackMessage;
  // Derive raw message first, then map certain backend messages to i18n keys.
  const raw = getErrorMessage(error, fallback);

  let mapped = raw;
  // Map backend blocked-word response to a localized message.
  if (typeof raw === "string" && raw.includes("content contains a blocked word")) {
    mapped = i18n.t("editor.blocked-word");
  }

  const errorMessage = options?.context ? `${contextPrefix}${mapped}` : mapped;

  console.error(error);
  toast(errorMessage);
  options?.onError?.(error);
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
