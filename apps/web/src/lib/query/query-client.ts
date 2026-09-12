import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportFailure, reportReachable } from "@/lib/api/api-status";

export const queryClient = new QueryClient({
  // Every request outcome in the app passes through here, which is what lets an outage be
  // noticed without a call site knowing anything about it.
  queryCache: new QueryCache({
    onSuccess: () => reportReachable(),
    onError: (error) => reportFailure(error),
  }),
  mutationCache: new MutationCache({
    onSuccess: () => reportReachable(),
    onError: (error) => reportFailure(error),
  }),
  defaultOptions: {
    queries: {
      // Tracker data changes as you log, so keep it briefly fresh rather than
      // forever-stale, but don't thrash on window focus.
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
