import type { TodayExercise } from "@afya/shared";

export const isExerciseDone = (e: TodayExercise) => e.fromProgram && e.loggedSets.length >= e.targetSets;
