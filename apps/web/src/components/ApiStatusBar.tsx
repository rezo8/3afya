import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  getApiReachable,
  getProbeRequests,
  reportReachable,
  reportUnreachable,
  subscribeToApiStatus,
} from "@/lib/api/api-status";

/** Fast enough that coming back feels immediate; only ever runs while the API is down. */
const PROBE_INTERVAL_MS = 3000;

/**
 * Says when the server can't be reached, and keeps checking until it can.
 *
 * Mounted at the root so it covers the sign-in screen too, which is where you land when the
 * API is down. Nothing else in the app decides this: a failed request only asks for a probe,
 * and the probe's answer is what shows or clears the bar.
 */
export function ApiStatusBar() {
  const reachable = useSyncExternalStore(subscribeToApiStatus, getApiReachable);
  const probeRequests = useSyncExternalStore(subscribeToApiStatus, getProbeRequests);
  const qc = useQueryClient();

  // Nothing has failed and the API is believed up: there is nothing to check.
  const shouldProbe = !reachable || probeRequests > 0;

  useEffect(() => {
    if (!shouldProbe) return;
    let stopped = false;

    const probe = async () => {
      try {
        // A body check, not just a status: anything that isn't the API answering — a dev
        // proxy error, an SPA fallback serving index.html — must not read as healthy.
        const health = await api.get<{ ok?: boolean }>("/health");
        if (stopped) return;
        if (health?.ok === true) {
          const wasDown = !getApiReachable();
          reportReachable();
          // Every screen is holding a failed query; refill them instead of asking for a reload.
          if (wasDown) void qc.invalidateQueries();
          return;
        }
        reportUnreachable();
      } catch {
        if (!stopped) reportUnreachable();
      }
    };

    void probe();
    // Keep asking only while it is actually down.
    const timer = reachable ? null : setInterval(() => void probe(), PROBE_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [shouldProbe, reachable, probeRequests, qc]);

  if (reachable) return null;

  return (
    <div className="api-down" role="status">
      <span className="ad-dot" aria-hidden="true" />
      <span className="ad-text">
        <b>Can’t reach the server.</b> Nothing you’ve logged is lost — reconnecting…
      </span>
    </div>
  );
}
