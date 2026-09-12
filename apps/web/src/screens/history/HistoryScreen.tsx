import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { SessionDetail } from "@afya/shared";
import { api } from "@/lib/api/client";
import { daysAgo } from "@/lib/dates";
import { fmtDist, fmtDur } from "@/lib/format";

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const allSets = (s: SessionDetail) => s.exercises.flatMap((e) => e.sets);
const volume = (s: SessionDetail) => allSets(s).reduce((sum, x) => sum + x.weight * x.reps, 0);
/** A session started but never logged into: it stays visible, but it isn't training. */
const wasTrained = (s: SessionDetail) => allSets(s).length > 0;

function summarize(s: SessionDetail): string {
  const sets = allSets(s);
  const exCount = s.exercises.length;
  const lead = `${exCount} ${exCount === 1 ? "exercise" : "exercises"} · ${sets.length} ${sets.length === 1 ? "set" : "sets"}`;
  const vol = volume(s);
  if (vol > 0) return `${lead} · ${Math.round(vol).toLocaleString()} lb`;
  const totalReps = sets.reduce((n, x) => n + x.reps, 0);
  if (totalReps > 0) return `${lead} · ${totalReps} reps`;
  const totalTime = sets.reduce((n, x) => n + x.durationSec, 0);
  if (totalTime > 0) return `${lead} · ${fmtDur(totalTime)}`;
  // Distances only add up within one unit, so the summary reports the unit it can total.
  const distanceUnit = sets.find((x) => x.distanceUnit)?.distanceUnit;
  if (distanceUnit) {
    const total = sets.filter((x) => x.distanceUnit === distanceUnit).reduce((n, x) => n + x.distance, 0);
    return `${lead} · ${fmtDist(total, distanceUnit)}`;
  }
  return lead;
}

export function HistoryScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<SessionDetail[]>("/api/sessions?limit=90"),
  });

  if (isLoading) return <p className="center-note">Loading history…</p>;
  const sessions = data ?? [];
  const trained = sessions.filter(wasTrained);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // streak: consecutive days with a session, ending today or yesterday
  const dateSet = new Set(trained.map((s) => localDate(new Date(s.performedAt))));
  let streak = 0;
  const cursor = new Date();
  if (!dateSet.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(localDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const lastTrainedAt = trained.reduce<Date | null>((newest, s) => {
    const at = new Date(s.performedAt);
    return newest === null || at > newest ? at : newest;
  }, null);

  // A broken streak reads as "0d — never trained" directly above a calendar full
  // of dots, so the lead stat answers what the streak no longer can. Presentation
  // only: `streak` above is untouched.
  const leadStat =
    streak === 0 && lastTrainedAt
      ? { value: daysAgo(lastTrainedAt), unit: "d ago", label: "Last trained" }
      : { value: streak, unit: "d", label: "Current streak" };

  const monthSessions = trained.filter((s) => {
    const d = new Date(s.performedAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const monthVolume = monthSessions.reduce((sum, s) => sum + volume(s), 0);
  const trainedDays = new Set(monthSessions.map((s) => new Date(s.performedAt).getDate()));

  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  return (
    <>
      <div className="view-head">
        <p className="eyebrow">History</p>
        <h1>{monthLabel}</h1>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="v">
            {leadStat.value}
            <span className="u">{leadStat.unit}</span>
          </div>
          <span className="k">{leadStat.label}</span>
        </div>
        <div className="stat">
          <div className="v">{monthSessions.length}</div>
          <span className="k">Sessions · month</span>
        </div>
        <div className="stat">
          <div className="v">
            {Math.round(monthVolume / 1000)}
            <span className="u">k</span>
          </div>
          <span className="k">Volume · lb</span>
        </div>
      </div>

      <div className="card">
        <div className="cal-grid">
          {WD.map((w, i) => (
            <div key={i} className="cal-wd">
              {w}
            </div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`e${i}`} className="cal-day empty" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const cls = ["cal-day"];
            if (d === today) cls.push("today");
            else if (trainedDays.has(d)) cls.push("done");
            return (
              <div key={d} className={cls.join(" ")}>
                {d}
                <span className="cd-dot" />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow section-eyebrow">Recent sessions</p>
        {sessions.length === 0 ? (
          <p className="center-note">No sessions logged yet — head to Start and log your first.</p>
        ) : (
          <ul className="sess-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link to="/history/$sessionId" params={{ sessionId: s.id }} className="sess">
                  <span className="sdate">
                    {new Date(s.performedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="sbody">
                    <span className="sname">{s.dayName ?? "Freeform"}</span>
                    {wasTrained(s) ? (
                      <span className="ssum">{summarize(s)}</span>
                    ) : (
                      <span className="ssum untrained">started · nothing logged</span>
                    )}
                  </span>
                  <span className="schev" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
