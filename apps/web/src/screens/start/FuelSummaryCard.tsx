import { Link } from "@tanstack/react-router";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useMutationError } from "@/lib/query/use-mutation-error";
import { FuelMeters } from "@/screens/fuel/FuelMeters";
import { QuickAdd } from "@/screens/fuel/QuickAdd";
import { localDateOf } from "@/lib/fuel-date";
import { quickAddsFor, useFuelDay } from "@/screens/fuel/fuel-day";

const START_QUICK_ADDS = 3;

/** Start's view of today's fuel: where you stand, and the three things you log most. The rest is on /fuel. */
export function FuelSummaryCard() {
  const today = localDateOf(new Date());
  const { data } = useFuelDay(today);
  const errors = useMutationError();
  if (!data) return null;

  return (
    <section className="eating">
      <div className="eating-head">
        <p className="eyebrow">Fuel</p>
        <Link to="/fuel" className="kcap fuel-open">
          Open Fuel ›
        </Link>
      </div>
      {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}
      <FuelMeters day={data} />
      <QuickAdd foods={quickAddsFor(data).slice(0, START_QUICK_ADDS)} date={today} errors={errors} />
    </section>
  );
}
