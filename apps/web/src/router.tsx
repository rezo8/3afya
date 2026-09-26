import { Outlet, createRootRoute, createRoute, createRouter, redirect, useRouter } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/auth-client";
import { checkSession } from "@/lib/auth/session-check";
import { requestProbe } from "@/lib/api/api-status";
import { ApiStatusBar } from "@/components/ApiStatusBar";
import { errorMessage } from "@/lib/api/errors";
import { AppLayout } from "@/app/AppLayout";
import { SignInScreen } from "@/screens/auth/SignInScreen";
import { SignUpScreen } from "@/screens/auth/SignUpScreen";
import { StartScreen } from "@/screens/start/StartScreen";
import { FreeformSessionScreen, SessionScreen } from "@/screens/session/SessionScreen";
import { ProgramScreen } from "@/screens/program/ProgramScreen";
import { FuelScreen } from "@/screens/fuel/FuelScreen";
import { FoodsScreen } from "@/screens/fuel/FoodsScreen";
import { TrendsScreen } from "@/screens/trends/TrendsScreen";
import { HistoryScreen } from "@/screens/history/HistoryScreen";
import { SessionDetailScreen } from "@/screens/history/SessionDetailScreen";
import { BodyScreen } from "@/screens/body/BodyScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";

const rootRoute = createRootRoute({ component: RootComponent });

function RootComponent() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ApiStatusBar />
      <Outlet />
    </>
  );
}

/** Bounce signed-in users away from the auth pages. */
async function requireGuest() {
  const check = await checkSession(() => authClient.getSession());
  if (check.answered) {
    if (check.signedIn) throw redirect({ to: "/" });
    return;
  }
  // Ran before any screen query, so this is the earliest an outage can be noticed.
  requestProbe();
}

/** Gate the app behind a session. An unanswered check leaves you where you are. */
async function requireUser() {
  const check = await checkSession(() => authClient.getSession());
  if (check.answered) {
    if (!check.signedIn) throw redirect({ to: "/sign-in" });
    return;
  }
  // Ran before any screen query, so this is the earliest an outage can be noticed.
  requestProbe();
}

/**
 * Anything thrown out of a route gets a screen rather than a blank page. Reset retries the
 * failed navigation, which is the whole recovery when the cause was a dropped connection.
 *
 * Registered as the router's default rather than on the root route: a root `errorComponent`
 * replaces `RootComponent` itself, which would unmount `ApiStatusBar` and stop the probe at
 * exactly the moment a dropped connection needs it. As the default it renders inside the
 * root's `<Outlet />`, so the bar survives and still reports recovery.
 */
function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <section className="empty-state">
      <h2>Something went wrong</h2>
      <p>{errorMessage(error)}</p>
      <button
        className="btn"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Try again
      </button>
    </section>
  );
}

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  beforeLoad: requireGuest,
  component: SignInScreen,
});
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  beforeLoad: requireGuest,
  component: SignUpScreen,
});

// Pathless layout route: the authenticated shell (top bar + tab bar).
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: requireUser,
  component: AppLayout,
});
const startRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: StartScreen });
// Declared before the $dayId route so the static segment wins the match.
const freeformSessionRoute = createRoute({ getParentRoute: () => appRoute, path: "/session/freeform", component: FreeformSessionScreen });
const sessionRoute = createRoute({ getParentRoute: () => appRoute, path: "/session/$dayId", component: SessionScreen });
const programRoute = createRoute({ getParentRoute: () => appRoute, path: "/program", component: ProgramScreen });
const fuelRoute = createRoute({ getParentRoute: () => appRoute, path: "/fuel", component: FuelScreen });
const foodsRoute = createRoute({ getParentRoute: () => appRoute, path: "/fuel/foods", component: FoodsScreen });
const trendsRoute = createRoute({ getParentRoute: () => appRoute, path: "/trends", component: TrendsScreen });
const historyRoute = createRoute({ getParentRoute: () => appRoute, path: "/history", component: HistoryScreen });
const sessionDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/history/$sessionId", component: SessionDetailScreen });
const bodyRoute = createRoute({ getParentRoute: () => appRoute, path: "/body", component: BodyScreen });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsScreen });

const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,
  appRoute.addChildren([startRoute, freeformSessionRoute, sessionRoute, programRoute, fuelRoute, foodsRoute, trendsRoute, historyRoute, sessionDetailRoute, bodyRoute, settingsRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: RouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
