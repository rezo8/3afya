import type { PrKind } from "@afya/shared";

export const PR_LABEL: Record<PrKind, string> = {
  est1rm: "Best 1RM",
  weight: "Heaviest",
  volume: "Best volume",
  reps: "Most reps",
  duration: "Longest hold",
  distance: "Furthest",
};
