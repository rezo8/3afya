import { useState } from "react";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { LocalDate } from "@/lib/fuel-date";
import { useMutationError } from "@/lib/query/use-mutation-error";
import { quickAddsFor, useFuelDay } from "./fuel-day";
import { FuelLog } from "./FuelLog";
import { CarbsAndFat, FuelMeters } from "./FuelMeters";
import { LogFoodSheet } from "./LogFoodSheet";
import { QuickAdd } from "./QuickAdd";

/**
 * One day's fuel. Anything logged here lands on `date`; `isToday` only changes what the page
 * calls it. Targets are set on the Week view, where their history is.
 */
export function FuelPanel({ date, isToday }: { date: LocalDate; isToday: boolean }) {
  const { data } = useFuelDay(date);
  const errors = useMutationError();
  const [logging, setLogging] = useState(false);
  if (!data) return null;

  return (
    <section className="eating">
      <div className="eating-head">
        <p className="eyebrow">Totals</p>
      </div>

      {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}

      <FuelMeters day={data} />
      <CarbsAndFat day={data} />

      <QuickAdd foods={quickAddsFor(data)} date={date} errors={errors} />

      <button className="fuel-custom-open" onClick={() => setLogging(true)}>
        ＋ Log food
      </button>
      <LogFoodSheet open={logging} onClose={() => setLogging(false)} date={date} errors={errors} />

      <FuelLog entries={data.entries} date={date} isToday={isToday} errors={errors} />
    </section>
  );
}
