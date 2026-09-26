import { ENERGY_PER_LB, type Expenditure } from "@afya/shared";
/** Complete days the estimate looks back over. Today is left out: it is still being eaten. */
export const EXPENDITURE_WINDOW_DAYS = 28;

const MIN_LOGGED_DAYS = 14;
const MIN_WEIGH_INS = 8;
const MIN_WEIGH_SPAN_DAYS = 14;
/** Outside this, the inputs are wrong rather than the body unusual — usually unlogged meals. */
const PLAUSIBLE_KCAL = { min: 1200, max: 6000 };

export interface ExpenditureInput {
  /** Calories per calendar day, for days that had at least one entry. */
  intake: { date: string; calories: number }[];
  /** One weight per calendar day that had a weigh-in. */
  weighIns: { date: string; weight: number }[];
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * The weight trend as a least-squares slope, in lb per day. A slope rather than a smoothed
 * average: an exponential average lags the very change it is meant to measure at the end of
 * the window, while a line through 8+ weigh-ins averages out day-to-day water noise without
 * that lag.
 */
function slopePerDay(weighIns: ExpenditureInput["weighIns"]): number {
  const points = weighIns.map((w) => ({ x: dayNumber(w.date), y: w.weight }));
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const num = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const den = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

/**
 * What the user burns per day, from energy balance: average intake, less the energy that
 * went into (or came out of) body mass. Log ~2,200 kcal for four weeks while the trend holds
 * flat, and expenditure is ~2,200. It never changes a target; it is shown, and the user chooses.
 */
export function estimateExpenditure({ intake, weighIns }: ExpenditureInput): Expenditure {
  const loggedDays = intake.length;
  const base = { loggedDays, weighIns: weighIns.length, windowDays: EXPENDITURE_WINDOW_DAYS };
  const days = weighIns.map((w) => dayNumber(w.date));
  const span = days.length > 0 ? Math.max(...days) - Math.min(...days) : 0;

  const reasons: string[] = [];
  if (loggedDays < MIN_LOGGED_DAYS) {
    reasons.push(`Log food on at least ${MIN_LOGGED_DAYS} of the last ${EXPENDITURE_WINDOW_DAYS} days (${loggedDays} so far).`);
  }
  if (weighIns.length < MIN_WEIGH_INS) {
    reasons.push(`Weigh in at least ${MIN_WEIGH_INS} times in the last ${EXPENDITURE_WINDOW_DAYS} days (${weighIns.length} so far).`);
  } else if (span < MIN_WEIGH_SPAN_DAYS) {
    reasons.push("Weigh-ins need to span at least two weeks to show a trend.");
  }
  if (reasons.length > 0) return { state: "insufficient", reasons, ...base };

  const intakePerDay = intake.reduce((sum, d) => sum + d.calories, 0) / loggedDays;
  const slope = slopePerDay(weighIns);
  const kcalPerDay = intakePerDay - slope * ENERGY_PER_LB;

  if (kcalPerDay < PLAUSIBLE_KCAL.min || kcalPerDay > PLAUSIBLE_KCAL.max) {
    return {
      state: "insufficient",
      reasons: [
        `The numbers work out to ${Math.round(kcalPerDay).toLocaleString("en-US")} kcal a day, which no body burns — usually a sign of meals that weren't logged.`,
      ],
      ...base,
    };
  }

  const confidence =
    loggedDays >= 24 && weighIns.length >= 16 ? "good" : loggedDays >= 18 && weighIns.length >= 10 ? "moderate" : "low";
  return {
    state: "estimate",
    kcalPerDay: Math.round(kcalPerDay / 10) * 10,
    confidence,
    intakePerDay: Math.round(intakePerDay),
    trendLbPerWeek: Math.round(slope * 7 * 100) / 100,
    ...base,
  };
}
