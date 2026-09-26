/**
 * Name search shared by every picker: the exercise picker and the food search. One rule,
 * so an exercise and a food never answer the same query differently.
 */

/** The query split into the tokens every match has to contain. */
export const queryTokens = (query: string): string[] => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Every token must appear somewhere in the name, in any order, so "press inc" finds
 * "Incline Dumbbell Press" — substring and token, never exact. It is deliberately not
 * fuzzy: an abbreviation the name does not contain ("db") does not match, for the same
 * reason the catalog never guesses at a name it doesn't know.
 */
export const matchesQuery = (name: string, tokens: string[]): boolean => {
  const lower = name.toLowerCase();
  return tokens.every((token) => lower.includes(token));
};
