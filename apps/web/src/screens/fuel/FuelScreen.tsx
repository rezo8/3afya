import { useState } from "react";
import { earliestFuelDate, fuelDayHeading, localDateOf, shiftLocalDate, type LocalDate } from "@/lib/fuel-date";
import { FuelPanel } from "./FuelPanel";

export function FuelScreen() {
  const today = localDateOf(new Date());
  const [date, setDate] = useState<LocalDate>(today);
  const canGoBack = date > earliestFuelDate(today);
  const canGoForward = date < today;

  return (
    <>
      <div className="view-head fuel-head">
        <div>
          <p className="eyebrow">Fuel</p>
          <h1>{fuelDayHeading(date, today)}</h1>
        </div>
        <div className="day-step" role="group" aria-label="Day">
          <button aria-label="Previous day" disabled={!canGoBack} onClick={() => setDate(shiftLocalDate(date, -1))}>
            ‹
          </button>
          <button aria-label="Next day" disabled={!canGoForward} onClick={() => setDate(shiftLocalDate(date, 1))}>
            ›
          </button>
        </div>
      </div>
      <FuelPanel date={date} isToday={date === today} />
    </>
  );
}
