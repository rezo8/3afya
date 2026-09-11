import { Outlet, createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/auth-client";
import { AppLayout } from "@/app/AppLayout";
import { SignInScreen } from "@/screens/auth/SignInScreen";
import { SignUpScreen } from "@/screens/auth/SignUpScreen";
import { StartScreen } from "@/screens/start/StartScreen";
import { SessionScreen } from "@/screens/session/SessionScreen";
import { ProgramScreen } from "@/screens/program/ProgramScreen";
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
      <Outlet />
    </>
  );
}

/** Bounce signed-in users away from the auth pages. */
async function requireGuest() {
  const { data } = await authClient.getSession();
  if (data) throw redirect({ to: "/" });
}

/** Gate the app behind a session (server-truthful, so no post-load flicker). */
async function requireUser() {
  const { data } = await authClient.getSession();
  if (!data) throw redirect({ to: "/sign-in" });
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
const sessionRoute = createRoute({ getParentRoute: () => appRoute, path: "/session/$dayId", component: SessionScreen });
const programRoute = createRoute({ getParentRoute: () => appRoute, path: "/program", component: ProgramScreen });
const trendsRoute = createRoute({ getParentRoute: () => appRoute, path: "/trends", component: TrendsScreen });
const historyRoute = createRoute({ getParentRoute: () => appRoute, path: "/history", component: HistoryScreen });
const sessionDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/history/$sessionId", component: SessionDetailScreen });
const bodyRoute = createRoute({ getParentRoute: () => appRoute, path: "/body", component: BodyScreen });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsScreen });

const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,
  appRoute.addChildren([startRoute, sessionRoute, programRoute, trendsRoute, historyRoute, sessionDetailRoute, bodyRoute, settingsRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
