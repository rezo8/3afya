import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { errorMessage, isRetryableError } from "@/lib/api/errors";

/** A failed write. `retry` is absent when running the same call again cannot help. */
export type MutationFailure = { message: string; retry?: () => void };

/** One failure banner, shared by every mutation that reports into it. */
export type MutationErrorSlot = {
  failure: MutationFailure | null;
  clear: () => void;
  report: (error: unknown, retry: () => void) => void;
};

/**
 * Holds the most recent failed write for one banner. A screen owns one slot; each of its
 * mutations reports into it through `useTrackedMutation`, so the last failure is the one
 * on screen and any success clears it.
 */
export function useMutationError(): MutationErrorSlot {
  const [failure, setFailure] = useState<MutationFailure | null>(null);

  const clear = useCallback(() => setFailure(null), []);

  const report = useCallback((error: unknown, retry: () => void) => {
    setFailure({
      message: errorMessage(error),
      retry: isRetryableError(error)
        ? () => {
            setFailure(null);
            retry();
          }
        : undefined,
    });
  }, []);

  return { failure, clear, report };
}

/**
 * A mutation that reports its own failure into `slot`, offering the failed call as the retry.
 *
 * A wrapper rather than an `onError` each caller writes, because a mutation cannot name
 * itself inside its own declaration — the retry has to reach `mutate`, and referencing the
 * binding being declared makes its type circular. The variables come from `onError`, which
 * is the only place they are still in hand: most call sites fire from inside a `map` over
 * server data, or from an input whose value is gone by the time the request fails.
 */
export function useTrackedMutation<TData, TVariables, TOnMutateResult = unknown>(
  slot: MutationErrorSlot,
  options: UseMutationOptions<TData, Error, TVariables, TOnMutateResult>,
): UseMutationResult<TData, Error, TVariables, TOnMutateResult> {
  const latest = useRef<UseMutationResult<TData, Error, TVariables, TOnMutateResult> | null>(null);

  const mutation = useMutation<TData, Error, TVariables, TOnMutateResult>({
    ...options,
    onSuccess: (...args) => {
      slot.clear();
      return options.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error, variables] = args;
      slot.report(error, () => latest.current?.mutate(variables));
      return options.onError?.(...args);
    },
  });

  // The retry closure needs this render's `mutate`; an error can only arrive after a
  // call the user made, which is always after this effect has run.
  useEffect(() => {
    latest.current = mutation;
  });

  return mutation;
}
