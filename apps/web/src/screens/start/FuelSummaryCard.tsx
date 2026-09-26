import { Link } from "@tanstack/react-router";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useMutationError } from "@/lib/query/use-mutation-error";
import { FuelMeters, QuickAddChips } from "@/screens/fuel/FuelMeters";
import { localDateOf } from "@/lib/fuel-date";
import { quickAddsFor, useFuelDay, useLogFuel } from "@/screens/fuel/fuel-day";

const START_QUICK_ADDS = 3;

/** Start's view of today's fuel: where you stand, and the three things you log most. The rest is on /fuel. */
export function FuelSummaryCard() {
  const { data } = useFuelDay(localDateOf(new Date()));
  const errors = useMutationError();
  const add = useLogFuel(errors);
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
      <QuickAddChips
        foods={quickAddsFor(data).slice(0, START_QUICK_ADDS)}
        onAdd={(food) => add.mutate(food)}
        disabled={add.isPending}
      />
    </section>
  );
}
