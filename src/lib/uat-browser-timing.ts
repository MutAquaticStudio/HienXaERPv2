// Opt-in, tab-local UAT measurements. Never collect URLs, identities or business values.
export const timingKey = "hienxa-uat-browser-timing-v1";
export type TimingMetric = "ADMIN_SHELL_BROWSER" | "DASHBOARD_BROWSER_CONTENT";
export type TimingSample = { metric: TimingMetric; durationMs: number; status: "READY" | "ERROR" | "TIMEOUT" | "INTERRUPTED"; clock: "SAME_DOCUMENT" | "CROSS_DOCUMENT"; sequence: number; action: string };
type Pending = { metric: TimingMetric; id: string; startAbsolute: number; origin: number; relative: number; action: string; control?: string; expanded?: boolean };
type TimingState = { version: 1; samples: TimingSample[]; pending: Pending | null; environment: { userAgent: string; width: number; height: number; pixelRatio: number; hardwareConcurrency: number; networkRttEstimateMs: number | null }; storageError?: boolean };
let state: TimingState | null = null;
let frame = 0;
let lastClick = 0;
const changeEvent = "hienxa-uat-timing-change";

export function percentile(values: readonly number[], fraction: number) {
  if (fraction < 0 || fraction > 1 || !Number.isFinite(fraction) || values.some((n) => !Number.isFinite(n) || n < 0)) throw new Error("INVALID_TIMING_VALUES");
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function dashboardReadiness(expected: string, observed: { response: string | null; filters: string | null; kpi: string | null; content: string | null }) {
  if (!expected || observed.response !== expected) return "PENDING";
  const parts = [observed.filters, observed.kpi, observed.content];
  if (parts.includes("error")) return "ERROR";
  return parts.every((part) => part === "ready") ? "READY" : "PENDING";
}

export function timingVerdict(samples: readonly TimingSample[], budgetMs: number) {
  if (!samples.length) return "PENDING";
  const p95 = percentile(samples.map((s) => s.durationMs), 0.95)!;
  return samples.every((s) => s.status === "READY") && p95 < budgetMs ? "PASS" : "FAIL";
}

export function timingSnapshot() {
  return state ? JSON.parse(JSON.stringify(state)) as TimingState : null;
}

export function subscribeTiming(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

function publish() {
  if (!state) return;
  try { sessionStorage.setItem(timingKey, JSON.stringify(state)); } catch { state.storageError = true; }
  window.dispatchEvent(new Event(changeEvent));
}

function absoluteNow() { return performance.timeOrigin + performance.now(); }
function eventAbsolute(event: Event) {
  return event.timeStamp > 1e12 ? event.timeStamp : performance.timeOrigin + event.timeStamp;
}

function finish(status: TimingSample["status"]) {
  if (!state?.pending) return;
  const pending = state.pending;
  const durationMs = absoluteNow() - pending.startAbsolute;
  if (!Number.isFinite(durationMs) || durationMs < 0) { state.storageError = true; state.pending = null; publish(); return; }
  const clock = pending.origin === performance.timeOrigin ? "SAME_DOCUMENT" : "CROSS_DOCUMENT";
  performance.mark(`hx-uat-${pending.id}-ready`);
  if (clock === "SAME_DOCUMENT") {
    performance.measure(`hx-uat-${pending.id}`, { start: pending.relative, end: performance.now() });
  }
  state.samples.push({ metric: pending.metric, durationMs, status, clock, sequence: state.samples.length + 1, action: pending.action });
  state.pending = null;
  publish();
}

function readiness(pending: Pending): "READY" | "ERROR" | "PENDING" {
  if (pending.metric === "DASHBOARD_BROWSER_CONTENT") {
    return dashboardReadiness(pending.id, {
      response: document.querySelector("[data-uat-dashboard-request]")?.getAttribute("data-uat-dashboard-request") ?? null,
      filters: document.querySelector("[data-uat-dashboard-filters]")?.getAttribute("data-uat-dashboard-filters") ?? null,
      kpi: document.querySelector("[data-uat-dashboard-kpi]")?.getAttribute("data-uat-dashboard-kpi") ?? null,
      content: document.querySelector("[data-uat-dashboard-content]")?.getAttribute("data-uat-dashboard-content") ?? null,
    });
  }
  const sidebar = document.getElementById("app-sidebar");
  if (!sidebar) return "PENDING";
  if (pending.control?.startsWith("nav-")) {
    const group = document.getElementById(pending.control);
    const button = sidebar.querySelector(`button[aria-controls="${pending.control}"]`);
    return button?.getAttribute("aria-expanded") === String(pending.expanded) && group?.hidden === !pending.expanded ? "READY" : "PENDING";
  }
  const rect = sidebar.getBoundingClientRect();
  const ready = pending.expanded
    ? sidebar.classList.contains("open") && rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5
    : !sidebar.classList.contains("open") && rect.right <= 0.5;
  return ready ? "READY" : "PENDING";
}

function poll() {
  cancelAnimationFrame(frame);
  const tick = () => {
    const pending = state?.pending;
    if (!pending) return;
    const ready = readiness(pending);
    if (absoluteNow() - pending.startAbsolute >= 10000) { finish("TIMEOUT"); return; }
    if (ready !== "PENDING") {
      // One intervening paint after the committed DOM condition, not a mount/TTFB proxy.
      frame = requestAnimationFrame(() => {
        if (state?.pending?.id !== pending.id) return;
        const confirmed = readiness(pending);
        if (confirmed === "PENDING") { poll(); return; }
        finish(confirmed);
      });
    } else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

function begin(pending: Pending) {
  if (!state) return;
  if (state.pending) finish("INTERRUPTED");
  state.pending = pending;
  performance.mark(`hx-uat-${pending.id}-click`, { startTime: pending.relative });
  publish();
  poll();
}

export function startUatBrowserTiming() {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("uatTiming") !== "1" || !window.location.pathname.startsWith("/admin")) return;
  if (state) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(timingKey) ?? "null") as TimingState | null;
    if (stored?.version === 1 && Array.isArray(stored.samples) && stored.samples.every((s) => Number.isFinite(s.durationMs) && s.durationMs >= 0)) state = stored;
  } catch { /* A corrupt/disabled measurement store must never break application navigation. */ }
  const connection = (navigator as Navigator & { connection?: { rtt?: number } }).connection;
  state ??= { version: 1, samples: [], pending: null, environment: { userAgent: navigator.userAgent, width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency, networkRttEstimateMs: connection?.rtt ?? null } };
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.closest("form.filter-bar") && button.type === "submit") lastClick = eventAbsolute(event);
    const group = button.classList.contains("nav-group-toggle");
    const open = button.classList.contains("mobile-menu");
    const close = button.classList.contains("mobile-close") || button.classList.contains("sidebar-backdrop");
    if (!group && !open && !close) return;
    const control = group ? button.getAttribute("aria-controls") ?? "" : "app-sidebar";
    if (group && !/^nav-[a-z]+$/.test(control)) return;
    const startAbsolute = eventAbsolute(event);
    begin({ metric: "ADMIN_SHELL_BROWSER", id: crypto.randomUUID(), startAbsolute, origin: performance.timeOrigin, relative: startAbsolute - performance.timeOrigin, action: group ? "navigation-group-toggle" : open ? "navigation-drawer-open" : "navigation-drawer-close", control, expanded: group ? button.getAttribute("aria-expanded") !== "true" : open });
  };
  const submit = (event: SubmitEvent) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    if (new URL(form.action, location.href).pathname === "/auth/logout") { sessionStorage.removeItem(timingKey); return; }
    if (!form.classList.contains("filter-bar") || form.method.toLowerCase() !== "get" || location.pathname !== "/admin") return;
    const id = crypto.randomUUID();
    for (const [name, value] of [["uatTiming", "1"], ["uatTimingNonce", id]]) {
      let input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
      input.value = value;
    }
    const startAbsolute = lastClick || eventAbsolute(event);
    begin({ metric: "DASHBOARD_BROWSER_CONTENT", id, startAbsolute, origin: performance.timeOrigin, relative: startAbsolute - performance.timeOrigin, action: "dashboard-get-filter-submit" });
    lastClick = 0;
    // No preventDefault/router replacement: measure the existing native GET/reload path.
  };
  document.addEventListener("click", click, true);
  document.addEventListener("submit", submit, true);
  if (state.pending) poll();
  publish();
}
