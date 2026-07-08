import { Outlet } from "@tanstack/react-router";
import { signOut, useSession } from "@/lib/auth/auth-client";
import { queryClient } from "@/lib/query/query-client";
import { router } from "@/router";
import { TabBar } from "./TabBar";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function AppLayout() {
  const { data } = useSession();

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
    await router.navigate({ to: "/sign-in" });
  }

  return (
    <>
      <div className="app" id="main">
        <header className="topbar">
          <div className="brand">
            <span className="ar">عافية</span>
            <span className="lat">3afya</span>
          </div>
          <div className="topbar-right">
            <span className="date">{today.replace(",", " ·")}</span>
            {data ? (
              <button className="signout" onClick={handleSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </header>
        <Outlet />
      </div>
      <TabBar />
    </>
  );
}
