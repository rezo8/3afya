import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Program, TodayResponse } from "@afya/shared";
import { api } from "@/lib/api/client";
import { FuelPanel } from "@/screens/start/FuelPanel";

export function StartScreen() {
  const programsQ = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/api/programs") });
  const todayQ = useQuery({ queryKey: ["today"], queryFn: () => api.get<TodayResponse>("/api/sessions/today") });

  const program = programsQ.data?.[0] ?? null;
  const nextDayId = todayQ.data?.day?.id ?? null;

  if (programsQ.isLoading) return <p className="center-note">Loading…</p>;

  if (!program || program.days.length === 0) {
    return (
      <>
        <div className="view-head">
          <p className="eyebrow">Start</p>
          <h1>Ready to train</h1>
        </div>
        <section className="empty-state">
          <h2>No program yet</h2>
          <p>Build your days in the Program tab, then pick one here to start a session.</p>
          <Link className="btn" to="/program">
            Build a program
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="view-head">
        <p className="eyebrow">Start</p>
        <h1>{program.name}</h1>
      </div>

      <div>
        <p className="eyebrow section-eyebrow">Pick a day</p>
        <div className="start-days">
          {program.days.map((d, i) => (
            <Link key={d.id} to="/session/$dayId" params={{ dayId: d.id }} className={`start-day${d.id === nextDayId ? " is-next" : ""}`}>
              <div className="sd-top">
                <span className="sd-badge">{String.fromCharCode(65 + i)}</span>
                {d.id === nextDayId && <span className="sd-next">next up</span>}
              </div>
              <span className="sd-name">{d.name}</span>
              <span className="sd-meta">
                {d.exercises.length} {d.exercises.length === 1 ? "exercise" : "exercises"}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <FuelPanel />
    </>
  );
}
