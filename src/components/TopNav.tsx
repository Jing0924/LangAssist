import { NavLink } from "react-router-dom";

const links = [
  { to: "/voice", label: "即時語音" },
  { to: "/speaking", label: "會話練習" },
] as const;

export function TopNav() {
  return (
    <div className="site-header__actions">
      <nav className="top-nav" aria-label="主要功能">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              ["top-nav__link", isActive ? "top-nav__link--active" : ""]
                .filter(Boolean)
                .join(" ")
            }
            end
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
