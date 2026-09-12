import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Program, SessionDetail, TodayResponse } from "@afya/shared";
import { api } from "@/lib/api/client";
import { isExerciseDone } from "@/lib/session";
import { FuelPanel } from "@/screens/start/FuelPanel";

/** The way into a session that belongs to no program day — always available, program or not. */
function FreeformEntry() {
  return (
    <Link to="/session/freeform" className="freeform-entry">
      <span className="fe-name">＋ Log something else</span>
      <span className="fe-meta">a ride, a run, a class, anything off-program</span>
    </Link>
  );
}

type DayMark = { kind: "resume"; done: number; total: number } | { kind: "done" } | { kind: "next" } | { kind: "none" };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function daysAgoLabel(iso: string): string {
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(new Date(iso)).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function StartScreen() {
  const programsQ = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/api/programs") });
  const todayQ = useQuery({ queryKey: ["today"], queryFn: () => api.get<TodayResponse>("/api/sessions/today") });
  const lastQ = useQuery({ queryKey: ["last-session"], queryFn: () => api.get<SessionDetail[]>("/api/sessions?limit=1") });

  const program = programsQ.data?.[0] ?? null;
  const currentDayId = todayQ.data?.day?.id ?? null;
  const sessionToday = todayQ.data?.session ?? null;
  const plannedToday = (todayQ.data?.exercises ?? []).filter((e) => e.fromProgram);
  const doneToday = plannedToday.filter(isExerciseDone).length;

  const currentMark: DayMark = !sessionToday
    ? { kind: "next" }
    : doneToday < plannedToday.length
      ? { kind: "resume", done: doneToday, total: plannedToday.length }
      : { kind: "done" };

  // The client owns advancing "next up" past a finished day: the server's
  // rotation keeps returning today's day until tomorrow. If rotation ever moves
  // server-side, drop this rather than letting both advance.
  const days = program?.days ?? [];
  const currentIndex = days.findIndex((d) => d.id === currentDayId);
  const followingDayId = currentIndex === -1 ? null : (days[(currentIndex + 1) % days.length]?.id ?? null);

  const markFor = (dayId: string): DayMark => {
    if (dayId === currentDayId) return currentMark;
    if (currentMark.kind === "done" && dayId === followingDayId) return { kind: "next" };
    return { kind: "none" };
  };

  const lastSession = lastQ.data?.[0] ?? null;

  if (programsQ.isLoading) return <p className="center-note">Loading…</p>;

  if (!program) {
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
        <FreeformEntry />
      </>
    );
  }

  // Having a program but no days is a different gap from having no program at all.
  if (program.days.length === 0) {
    return (
      <>
        <div className="view-head">
          <p className="eyebrow">Start</p>
          <h1>{program.name}</h1>
        </div>
        <section className="empty-state">
          <h2>Add days to your program</h2>
          <p>This program has no days yet — a day is what you pick here to start a session.</p>
          <Link className="btn" to="/program">
            Add days
          </Link>
        </section>
        <FreeformEntry />
      </>
    );
  }

  return (
    <>
      <div className="view-head">
        <p className="eyebrow">Start</p>
        <h1>{program.name}</h1>
        {!sessionToday && lastSession && (
          <p className="last-trained">
            Last trained · {lastSession.dayName ?? "Freeform"} · {daysAgoLabel(lastSession.performedAt)}
          </p>
        )}
      </div>

      <div>
        <p className="eyebrow section-eyebrow">Pick a day</p>
        <div className="start-days">
          {program.days.map((d, i) => {
            const mark = markFor(d.id);
            return (
              <Link
                key={d.id}
                to="/session/$dayId"
                params={{ dayId: d.id }}
                className={`start-day${mark.kind === "resume" ? " is-resume" : mark.kind === "next" ? " is-next" : mark.kind === "done" ? " is-done" : ""}`}
              >
                <div className="sd-top">
                  <span className="sd-badge">{String.fromCharCode(65 + i)}</span>
                  {mark.kind === "resume" && (
                    <span className="sd-resume">
                      resume · {mark.done}/{mark.total} lifts
                    </span>
                  )}
                  {mark.kind === "done" && <span className="sd-done">done ✓</span>}
                  {mark.kind === "next" && <span className="sd-next">next up</span>}
                </div>
                <span className="sd-name">{d.name}</span>
                <span className="sd-meta">
                  {d.exercises.length} {d.exercises.length === 1 ? "exercise" : "exercises"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <FreeformEntry />

      <FuelPanel />
    </>
  );
}
