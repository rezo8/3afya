import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/", label: "Today", exact: true },
  { to: "/program", label: "Program", exact: false },
  { to: "/trends", label: "Trends", exact: false },
  { to: "/history", label: "History", exact: false },
] as const;

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeOptions={{ exact: t.exact }}
          inactiveProps={{ className: "tab" }}
          activeProps={{ className: "tab active" }}
        >
          <span className="dot" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
