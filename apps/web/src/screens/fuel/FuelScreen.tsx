import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { earliestFuelDate, fuelDayHeading, localDateOf, shiftLocalDate, type LocalDate } from "@/lib/fuel-date";
import { FuelPanel } from "./FuelPanel";
import { FuelWeek, WeekStrip } from "./FuelWeek";

type View = "day" | "week";

export function FuelScreen() {
  const today = localDateOf(new Date());
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState<LocalDate>(today);
  const canGoBack = date > earliestFuelDate(today);
  const canGoForward = date < today;

  return (
    <>
      <div className="view-head fuel-head">
        <div>
          <p className="eyebrow">Fuel</p>
          <h1>{view === "week" ? "This week" : fuelDayHeading(date, today)}</h1>
        </div>
        {view === "day" && (
          <div className="day-step" role="group" aria-label="Day">
            <button aria-label="Previous day" disabled={!canGoBack} onClick={() => setDate(shiftLocalDate(date, -1))}>
              ‹
            </button>
            <button aria-label="Next day" disabled={!canGoForward} onClick={() => setDate(shiftLocalDate(date, 1))}>
              ›
            </button>
          </div>
        )}
      </div>

      <div className="sheet-tabs fuel-tabs" role="tablist" aria-label="Fuel view">
        <button role="tab" aria-selected={view === "day"} onClick={() => setView("day")}>
          Day
        </button>
        <button role="tab" aria-selected={view === "week"} onClick={() => setView("week")}>
          Week
        </button>
      </div>

      {view === "day" ? (
        <>
          {date === today && <WeekStrip today={today} onOpen={() => setView("week")} />}
          <FuelPanel date={date} isToday={date === today} />
        </>
      ) : (
        <FuelWeek today={today} />
      )}
      <Link to="/fuel/foods" className="fuel-foods-link">
        Your foods ›
      </Link>
    </>
  );
}
