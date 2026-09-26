import { BarChart } from "@/components/charts/BarChart";
import type { LocalDate } from "@/lib/fuel-date";
import { summarizeWeek, type WeekSummary } from "@/lib/fuel-week";
import { useMutationError } from "@/lib/query/use-mutation-error";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useFuelWeek } from "./fuel-day";
import { FuelExpenditure } from "./FuelExpenditure";
import { FuelTargets } from "./FuelTargets";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
const weekdayLetter = (date: LocalDate) => WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "";
const kcal = (n: number) => Math.round(n).toLocaleString("en-US");
/** Within one week a weekday names a day unambiguously, and reads cleaner in a list than a date. */
const weekdayName = (date: LocalDate) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const listOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** The last seven days scored as a week: an average against the targets those days had. */
export function FuelWeek({ today }: { today: LocalDate }) {
  const { data } = useFuelWeek();
  const errors = useMutationError();
  if (!data) return null;
  const summary = summarizeWeek(data.days, today);
  const unlogged = data.days.filter((d) => d.entryCount === 0 && d.date !== today);

  return (
    <section className="eating fuel-week">
      <div className="fuel-week-head">
        <div>
          <p className="eyebrow">Average · calories</p>
          <p className="fuel-week-big">
            {summary.average ? kcal(summary.average.calories) : "—"}
            <span> kcal/day</span>
          </p>
          <p className="mnote">{versus(summary, "calories")}</p>
        </div>
        <div className="fuel-week-side">
          <p className="eyebrow">Protein</p>
          <p className="fuel-week-mid">{summary.average ? `${Math.round(summary.average.proteinG)} g` : "—"}</p>
          <p className="mnote">{versus(summary, "proteinG")}</p>
        </div>
      </div>

      <BarChart
        data={data.days.map((d) => (d.entryCount > 0 ? Math.round(d.calories) : null))}
        goal={data.target.calories}
        labels={data.days.map((d) => weekdayLetter(d.date))}
      />

      <p className="fuel-week-note">
        {summary.daysLogged === 0 ? (
          <b>Nothing logged in the last {summary.daysInWindow} days.</b>
        ) : (
          <>
            <b>
              {summary.daysLogged} of {summary.daysInWindow} days logged.
            </b>{" "}
            {unlogged.length > 0 &&
              `${listOf(unlogged.map((d) => weekdayName(d.date)))} ${unlogged.length === 1 ? "has" : "have"} no entries, so ${unlogged.length === 1 ? "it is" : "they are"} left out rather than counted as a fast. `}
            Today counts once it is over.
          </>
        )}
      </p>

      {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}
      <FuelExpenditure target={data.target} errors={errors} />
      <FuelTargets target={data.target} errors={errors} />
    </section>
  );
}

/** "370 under 2,850" against the average of the targets those days had. */
function versus(summary: WeekSummary, macro: "calories" | "proteinG"): string {
  if (!summary.average || !summary.targetAverage) return "no complete day logged yet";
  const unit = macro === "calories" ? "" : " g";
  const diff = Math.round(summary.average[macro] - summary.targetAverage[macro]);
  const target = macro === "calories" ? kcal(summary.targetAverage.calories) : `${Math.round(summary.targetAverage.proteinG)} g`;
  if (diff === 0) return `on target · ${target}`;
  return `${kcal(Math.abs(diff))}${unit} ${diff < 0 ? "under" : "over"} · target ${target}`;
}

/** One line under the day's heading: how the week is going, and the way to the week view. */
export function WeekStrip({ today, onOpen }: { today: LocalDate; onOpen: () => void }) {
  const { data } = useFuelWeek();
  if (!data) return null;
  const summary = summarizeWeek(data.days, today);
  return (
    <button className="week-strip" onClick={onOpen}>
      <span className="week-strip-count">
        This week · {summary.daysLogged} of {summary.daysInWindow} days logged
      </span>
      <span className="week-strip-avg">
        {summary.average
          ? `${kcal(summary.average.calories)} kcal/day · ${Math.round(summary.average.proteinG)} g protein/day`
          : "No complete day yet"}
        <span className="week-strip-go"> Week ›</span>
      </span>
    </button>
  );
}
