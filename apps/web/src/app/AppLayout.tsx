import { Link, Outlet } from "@tanstack/react-router";
import { signOut, useSession } from "@/lib/auth/auth-client";
import { queryClient } from "@/lib/query/query-client";
import { router } from "@/router";
import { RestBar, RestTimerProvider, useRestTimer } from "@/screens/session/RestTimer";
import { TabBar } from "./TabBar";

export function AppLayout() {
  return (
    <RestTimerProvider>
      <AppShell />
    </RestTimerProvider>
  );
}

function AppShell() {
  const { data } = useSession();
  const rest = useRestTimer();
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
    await router.navigate({ to: "/sign-in" });
  }

  return (
    <>
      <div className="app" id="main">
        <header className="topbar">
          <Link to="/program" className="brand">
            <span className="ar">عافية</span>
            <span className="lat">3afya</span>
          </Link>
          <div className="topbar-right">
            <span className="date">{today.replace(",", " ·")}</span>
            <Link to="/settings" className="topbar-link">
              Settings
            </Link>
            {data ? (
              <button className="topbar-link leave" onClick={handleSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </header>
        <Outlet />
      </div>
      <TabBar />
      {rest.state && (
        <RestBar total={rest.state.total} endsAt={rest.state.endsAt} onAdjust={rest.adjust} onSkip={rest.skip} onDone={rest.onDone} />
      )}
    </>
  );
}
