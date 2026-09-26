import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddFuelEntryBody, FrequentFuel, FuelDay, FuelEntry } from "@afya/shared";
import { api } from "@/lib/api/client";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";

/** The one query both the Fuel page and Start's card read, so a log on either shows on both. */
export const FUEL_TODAY_KEY = ["fuel", "today"] as const;

export const useFuelToday = () => useQuery({ queryKey: FUEL_TODAY_KEY, queryFn: () => api.get<FuelDay>("/api/fuel/today") });

export function useLogFuel(errors: MutationErrorSlot) {
  const qc = useQueryClient();
  return useTrackedMutation(errors, {
    mutationFn: (body: AddFuelEntryBody) => api.post<FuelEntry>("/api/fuel", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FUEL_TODAY_KEY }),
  });
}

/** Offered until the user has logged anything of their own, so the first visit isn't empty. */
const COLD_START_CHIPS: AddFuelEntryBody[] = [
  { label: "Chicken breast", proteinG: 30, calories: 200 },
  { label: "Protein shake", proteinG: 24, calories: 150 },
  { label: "Greek yogurt", proteinG: 12, calories: 90 },
  { label: "Rice bowl", proteinG: 8, calories: 320 },
];

export const quickAddsFor = (day: FuelDay): FrequentFuel[] => (day.frequent.length > 0 ? day.frequent : COLD_START_CHIPS);
