import type { Equipment, MuscleGroup } from "@afya/shared";

const muscleLabel = (group: MuscleGroup) => group.replace("_", " ");

/** An exercise's taxonomy, as far as it is known — an untagged exercise renders nothing. */
export function TaxonomyTags({ muscleGroup, equipment }: { muscleGroup: MuscleGroup | null; equipment: Equipment | null }) {
  return (
    <>
      {muscleGroup && <span className="ex-tag">{muscleLabel(muscleGroup)}</span>}
      {equipment && <span className="ex-tag">{equipment}</span>}
    </>
  );
}
