import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddFuelEntryBody, FuelDay, FuelEntry, QuickAddFood } from "@afya/shared";
import { api } from "@/lib/api/client";
import type { LocalDate } from "@/lib/fuel-date";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";

/**
 * Every fuel query sits under this prefix: each day, and the history Trends scores. A write
 * invalidates the whole prefix, because an entry logged or moved can change any of them —
 * the day it left, the day it landed on, and the week.
 */
export const FUEL_KEY = ["fuel"] as const;

export const fuelDayKey = (date: LocalDate) => [...FUEL_KEY, "day", date] as const;

/** One day's fuel. The Fuel page and Start's card read the same key for today, so a log on either shows on both. */
export const useFuelDay = (date: LocalDate) =>
  useQuery({ queryKey: fuelDayKey(date), queryFn: () => api.get<FuelDay>(`/api/fuel/day/${date}`) });

export function useLogFuel(errors: MutationErrorSlot) {
  const qc = useQueryClient();
  return useTrackedMutation(errors, {
    mutationFn: (body: AddFuelEntryBody) => api.post<FuelEntry>("/api/fuel", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: FUEL_KEY }),
  });
}

/** Offered until the user has logged anything of their own, so the first visit isn't empty. */
const COLD_START_CHIPS: QuickAddFood[] = [
  { source: "frequent", label: "Chicken breast", proteinG: 30, calories: 200, carbsG: null, fatG: null },
  { source: "frequent", label: "Protein shake", proteinG: 24, calories: 150, carbsG: null, fatG: null },
  { source: "frequent", label: "Greek yogurt", proteinG: 12, calories: 90, carbsG: null, fatG: null },
  { source: "frequent", label: "Rice bowl", proteinG: 8, calories: 320, carbsG: null, fatG: null },
];

export const quickAddsFor = (day: FuelDay): QuickAddFood[] => (day.quickAdds.length > 0 ? day.quickAdds : COLD_START_CHIPS);

/** What logging one serving of a chip sends. A saved food is linked so it can be counted. */
export const quickAddBody = (food: QuickAddFood, portion: number): AddFuelEntryBody => ({
  label: food.label,
  proteinG: food.proteinG,
  calories: food.calories,
  carbsG: food.carbsG,
  fatG: food.fatG,
  portion,
  itemId: food.source === "item" ? food.itemId : null,
});
