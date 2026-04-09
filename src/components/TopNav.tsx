import { MessageSquareText, Mic } from "lucide-react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/voice", label: "即時翻譯", short: "翻譯", Icon: Mic },
  { to: "/speaking", label: "會話練習", short: "會話", Icon: MessageSquareText },
] as const;

export function TopNav() {
  return (
    <div className="site-header__actions">
      <nav className="top-nav" aria-label="主要功能">
        {links.map(({ to, label, short, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              ["top-nav__link", isActive ? "top-nav__link--active" : ""]
                .filter(Boolean)
                .join(" ")
            }
            end
            aria-label={label}
            title={label}
          >
            <Icon className="top-nav__link-icon" aria-hidden size={18} />
            <span className="top-nav__link-label top-nav__link-label--full">
              {label}
            </span>
            <span className="top-nav__link-label top-nav__link-label--short">
              {short}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
