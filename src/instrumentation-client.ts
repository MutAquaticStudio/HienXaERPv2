import { startUatBrowserTiming } from "@/lib/uat-browser-timing";

// Next executes this before hydration. Default traffic does not activate the collector.
try { startUatBrowserTiming(); } catch { /* Measurement failure must not affect business UI. */ }
