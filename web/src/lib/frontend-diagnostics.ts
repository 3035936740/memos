// Write-only first-party diagnostics. This module deliberately does not import
// Connect or auth: reporting an RPC failure must never recurse or refresh tokens.
const REPORT_PATH = "/api/v1/diagnostics/frontend-errors";
const STORAGE_PREFIX = "memos-frontend-error:";
const MAX_PENDING = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TRACE = 24;

type DiagnosticKind = "unexpected-html" | "network-error" | "http-error";
type Trace = { at: string; type: string; target?: string; path?: string; requestId?: string; status?: number };
type DiagnosticRequest = {
  id: string;
  path: string;
  method: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  contentType: string;
  pagePath: string;
  authRetry: boolean;
};
type DiagnosticResponse = {
  status: number;
  path: string;
  origin: string;
  contentType: string;
  redirected: boolean;
  server: string;
  requestId: string;
  cacheStatus: string;
  cacheControl: string;
  retryAfter: string;
  edgeRequestId: string;
  via: string;
  mitigation: string;
  contentLength: string;
};
type DeliveryFailure = { at: string; attempt: number; reason: string };
type Report = {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  clientTime: string;
  kind: DiagnosticKind;
  message: string;
  stack: string;
  cause: string;
  context: {
    pagePath: string;
    referrerPath: string;
    pageAgeMs: number;
    timezone: string;
    language: string;
    visibility: string;
    online: boolean;
    navigationType: string;
    frontendAsset: string;
    style: string;
    theme: string;
    viewportWidth: number;
    viewportHeight: number;
    pixelRatio: number;
  };
  request: DiagnosticRequest;
  response: DiagnosticResponse;
  trace: Trace[];
};
type Pending = { report: Report; attempts: number; nextAttemptAt: number; previousFailure: string; failures: DeliveryFailure[] };

const sessionId = newID();
const trace: Trace[] = [];
const memoryPending = new Map<string, Pending>();
let initialized = false;
let sending = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function newID(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function diagnosticPath(value: string): string {
  if (!value) return "";
  try {
    const path = new URL(value, window.location.origin).pathname;
    return path.replace(/^(\/memos\/shares\/)[^/]+/, "$1[redacted]").slice(0, 512);
  } catch {
    return "";
  }
}

function safeStack(stack: string): string {
  return stack
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s)"<>]+/g, (value) => {
      try {
        return new URL(value).origin + diagnosticPath(value);
      } catch {
        return "[URL]";
      }
    })
    .slice(0, 4096);
}

export function recordDiagnosticTrace(type: string, details: Omit<Trace, "at" | "type"> = {}): void {
  trace.push({ at: new Date().toISOString(), type, ...details });
  // Busy bootstrap requests must not evict the click/navigation that triggered them.
  const requestEvent = type.startsWith("api-");
  if (trace.filter((event) => event.type.startsWith("api-") === requestEvent).length > MAX_TRACE / 2) {
    trace.splice(
      trace.findIndex((event) => event.type.startsWith("api-") === requestEvent),
      1,
    );
  }
  if (trace.length > MAX_TRACE) trace.shift();
}

function savePending(item: Pending): void {
  memoryPending.set(item.report.id, item);
  try {
    localStorage.setItem(STORAGE_PREFIX + item.report.id, JSON.stringify(item));
    memoryPending.delete(item.report.id);
  } catch {
    // With browser storage blocked, keep a bounded queue for this tab's lifetime.
  }
}

function removePending(id: string): void {
  memoryPending.delete(id);
  try {
    localStorage.removeItem(STORAGE_PREFIX + id);
  } catch {
    // In-memory fallback was already cleared.
  }
}

function pendingReports(): Pending[] {
  const items = new Map(memoryPending);
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
      (key): key is string => !!key?.startsWith(STORAGE_PREFIX),
    );
    for (const key of keys) {
      try {
        const item = JSON.parse(localStorage.getItem(key) ?? "null") as Pending | null;
        if (!item?.report || item.report.schemaVersion !== 1 || key !== STORAGE_PREFIX + item.report.id) {
          localStorage.removeItem(key);
          continue;
        }
        items.set(item.report.id, item);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Restricted storage still leaves the memory queue available.
  }
  const valid = [...items.values()].filter((item) => {
    const age = Date.now() - Date.parse(item.report.clientTime);
    if (!Number.isFinite(age) || age > MAX_AGE_MS || age < -60_000) {
      removePending(item.report.id);
      return false;
    }
    return true;
  });
  valid.sort((a, b) => a.report.clientTime.localeCompare(b.report.clientTime));
  while (valid.length > MAX_PENDING) {
    const oldest = valid.shift();
    if (oldest) removePending(oldest.report.id);
  }
  return valid;
}

function scheduleFlush(delay = 0): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(
    () => {
      timer = undefined;
      void flushReports();
    },
    Math.max(0, delay),
  );
}

async function flushReports(): Promise<void> {
  if (sending || !navigator.onLine) return;
  const queue = pendingReports();
  if (queue.length === 0) return;
  const now = Date.now();
  const item = queue.find((pending) => pending.nextAttemptAt <= now);
  if (!item) {
    scheduleFlush(Math.min(...queue.map((pending) => pending.nextAttemptAt)) - now);
    return;
  }
  sending = true;
  item.attempts++;
  // Reserve the next retry before sending, including when a tab closes mid-request.
  item.nextAttemptAt = now + Math.min(300_000, 2000 * 2 ** Math.min(item.attempts - 1, 8));
  savePending(item);
  try {
    const response = await globalThis.fetch(REPORT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        ...item.report,
        delivery: {
          attempt: item.attempts,
          queuedForMs: Math.max(0, now - Date.parse(item.report.clientTime)),
          previousFailure: item.previousFailure,
          failures: item.failures || [],
        },
      }),
    });
    if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
      if (response.status === 429) item.nextAttemptAt = now + 60_000;
      throw new Error(`Report HTTP ${response.status}, ${response.headers.get("Content-Type") ?? "unknown type"}`);
    }
    const ack = (await response.json()) as { saved?: boolean; id?: string };
    if (ack.saved !== true || ack.id !== item.report.id) throw new Error("Report acknowledgement missing");
    removePending(item.report.id);
  } catch (error) {
    item.previousFailure = error instanceof Error ? error.message.slice(0, 128) : "Report delivery failed";
    item.failures = [
      ...(item.failures || []),
      { at: new Date().toISOString(), attempt: item.attempts, reason: item.previousFailure },
    ].slice(-8);
    savePending(item);
    console.warn("[Diagnostics] Report kept for retry", { id: item.report.id, attempt: item.attempts, reason: item.previousFailure });
  } finally {
    sending = false;
    // Drain other events without repeatedly trying one failed report.
    scheduleFlush(250);
  }
}

export function initializeFrontendDiagnostics(): void {
  if (initialized) return;
  initialized = true;
  recordDiagnosticTrace("page-load", { path: diagnosticPath(location.href) });
  document.addEventListener(
    "click",
    (event) => {
      const element = event.target instanceof Element ? event.target.closest("a,button,input,select,[role='button']") : null;
      if (!element) return;
      // Describe the control, never its text, field value, title, or editor contents.
      const slot = element.getAttribute("data-slot");
      const type = element instanceof HTMLInputElement ? element.type : "";
      const target = [element.tagName.toLowerCase(), slot ? `[${slot.slice(0, 48)}]` : "", type].filter(Boolean).join(" ");
      const href = element instanceof HTMLAnchorElement ? element.href : "";
      recordDiagnosticTrace("click", { target, path: diagnosticPath(href) });
    },
    true,
  );
  document.addEventListener("submit", () => recordDiagnosticTrace("form-submit", { path: diagnosticPath(location.href) }), true);
  window.addEventListener("online", () => {
    recordDiagnosticTrace("online");
    scheduleFlush();
  });
  window.addEventListener("offline", () => recordDiagnosticTrace("offline"));
  document.addEventListener("visibilitychange", () => {
    recordDiagnosticTrace(`visibility-${document.visibilityState}`);
    scheduleFlush();
  });
  window.addEventListener("pagehide", () => {
    void flushReports();
  });
  scheduleFlush();
}

export function startDiagnosticRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): (response?: Response, networkError?: unknown) => void {
  if (!initialized) return () => {};
  const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  const method = init?.method || (input instanceof Request ? input.method : "GET");
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const initiatorStack = safeStack(new Error("API request initiated").stack || "");
  const request: DiagnosticRequest = {
    id: newID(),
    path: diagnosticPath(url),
    method,
    startedAt: new Date().toISOString(),
    completedAt: "",
    durationMs: 0,
    contentType: headers.get("Content-Type") || "",
    pagePath: diagnosticPath(location.href),
    authRetry: headers.get("X-Retry") === "true",
  };
  const started = performance.now();
  recordDiagnosticTrace("api-start", { path: request.path, requestId: request.id });
  return (response?: Response, networkError?: unknown): void => {
    request.completedAt = new Date().toISOString();
    request.durationMs = Math.round(performance.now() - started);
    recordDiagnosticTrace("api-end", { path: request.path, requestId: request.id, status: response?.status ?? 0 });
    const contentType = response?.headers.get("Content-Type") || "";
    const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
    const html = mediaType === "text/html" || mediaType === "application/xhtml+xml";
    // Cancelled navigation requests are expected and should not fill the log.
    if (!html && (response?.ok || (!response && networkError instanceof Error && networkError.name === "AbortError"))) return;
    const kind: DiagnosticKind = html ? "unexpected-html" : response ? "http-error" : "network-error";
    const message = html
      ? "API returned HTML instead of an RPC response"
      : response
        ? `API HTTP ${response.status}`
        : "API network request failed";
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const report: Report = {
      schemaVersion: 1,
      id: newID(),
      sessionId,
      clientTime: request.completedAt,
      kind,
      message,
      stack: initiatorStack,
      cause: networkError instanceof Error ? safeStack(`${networkError.name}: ${networkError.message}`).slice(0, 256) : "",
      context: {
        pagePath: diagnosticPath(location.href),
        referrerPath: diagnosticPath(document.referrer),
        pageAgeMs: Math.round(performance.now()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        visibility: document.visibilityState,
        online: navigator.onLine,
        navigationType: navigation?.type || "unknown",
        frontendAsset: diagnosticPath([...document.scripts].find((script) => script.type === "module")?.src || ""),
        style: document.documentElement.dataset.style || "default",
        theme: document.documentElement.dataset.theme || "",
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        pixelRatio: devicePixelRatio,
      },
      request,
      response: {
        status: response?.status ?? 0,
        path: diagnosticPath(response?.url || ""),
        origin: response?.url ? new URL(response.url).origin : "",
        contentType,
        redirected: response?.redirected ?? false,
        server: response?.headers.get("Server") || "",
        requestId: response?.headers.get("X-Request-Id") || response?.headers.get("CF-Ray") || "",
        cacheStatus: response?.headers.get("CF-Cache-Status") || response?.headers.get("X-Cache") || "",
        cacheControl: response?.headers.get("Cache-Control") || "",
        retryAfter: response?.headers.get("Retry-After") || "",
        edgeRequestId: response?.headers.get("CF-Ray") || "",
        via: response?.headers.get("Via") || "",
        mitigation: response?.headers.get("CF-Mitigated") || "",
        contentLength: response?.headers.get("Content-Length") || "",
      },
      trace: trace.map((event) => ({ ...event })),
    };
    savePending({ report, attempts: 0, nextAttemptAt: Date.now(), previousFailure: "", failures: [] });
    pendingReports();
    scheduleFlush();
  };
}
