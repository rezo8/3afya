import { useState } from "react";
import type { CatalogExercise, Exercise, ExerciseKind } from "@afya/shared";
import { TaxonomyTags } from "@/components/TaxonomyTags";
import { buildPickerOptions, isNewName, matchesQuery, queryTokens, type ExercisePick } from "@/lib/exercise-pick";

/** Long enough to browse, short enough to scan. Past it, the query does the narrowing. */
const RESULT_LIMIT = 12;

const KIND_OPTIONS: { value: ExerciseKind; label: string }[] = [
  { value: "weighted", label: "Weight × reps" },
  { value: "reps", label: "Reps" },
  { value: "time", label: "Time" },
];

interface ExercisePickerProps {
  library: Exercise[];
  catalog: CatalogExercise[];
  /** Exercises the day already has — listed as present rather than offered again. */
  alreadyInDay: ReadonlySet<string>;
  placeholder: string;
  busy: boolean;
  onPick: (pick: ExercisePick) => void;
}

/** Search the library and the curated catalog as one list, and create only by saying so. */
export function ExercisePicker({ library, catalog, alreadyInDay, placeholder, busy, onPick }: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const [newKind, setNewKind] = useState<ExerciseKind>("weighted");

  const typed = query.trim();
  const tokens = queryTokens(query);
  const options = buildPickerOptions(library, catalog, alreadyInDay);
  const matched = tokens.length === 0 ? options : options.filter((option) => matchesQuery(option.name, tokens));
  const shown = matched.slice(0, RESULT_LIMIT);
  const canCreate = isNewName(typed, options);

  const choose = (pick: ExercisePick) => {
    setQuery("");
    onPick(pick);
  };

  return (
    <div className="expick">
      <input
        className="expick-in"
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.length === 0 && !canCreate ? (
        <p className="swap-note">Nothing matches “{typed}”</p>
      ) : (
        <ul className="expick-list">
          {shown.map((option) => (
            <li key={option.key}>
              <button type="button" disabled={busy || option.pick === null} onClick={() => option.pick && choose(option.pick)}>
                <span className="expick-name">{option.name}</span>
                <span className="expick-tags">
                  <TaxonomyTags muscleGroup={option.primaryMuscleGroup} equipment={option.equipment} />
                  {option.badge && <span className={`expick-badge${option.badge === "new" ? " is-new" : ""}`}>{option.badge}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {matched.length > shown.length && <p className="swap-note">Keep typing to narrow {matched.length} matches</p>}
      {canCreate && (
        <div className="expick-create">
          <div className="lift-select">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`ls${newKind === k.value ? " on" : ""}`}
                onClick={() => setNewKind(k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="expick-create-btn"
            disabled={busy}
            onClick={() => choose({ source: "new", name: typed, kind: newKind })}
          >
            Create “{typed}”
          </button>
        </div>
      )}
    </div>
  );
}
