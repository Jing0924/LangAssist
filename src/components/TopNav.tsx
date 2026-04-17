import { MessageSquareText, Mic } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn";

const links = [
  { to: "/voice", label: "即時翻譯", short: "翻譯", Icon: Mic },
  { to: "/speaking", label: "會話練習", short: "會話", Icon: MessageSquareText },
] as const;

export function TopNav() {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <nav className="flex flex-wrap items-center gap-[0.45rem]" aria-label="主要功能">
        {links.map(({ to, label, short, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-full border border-transparent bg-transparent px-4 py-[0.45rem] text-sm font-medium text-secondary no-underline transition-[color,background,border-color] duration-150",
                "hover:border-white/10 hover:bg-white/[0.06] hover:text-foreground",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "max-sm:gap-[0.35rem] max-sm:px-3 max-sm:py-[0.52rem]",
                isActive &&
                  "border-white/[0.14] bg-white/[0.09] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              )
            }
            end
            aria-label={label}
            title={label}
          >
            <Icon className="size-[18px] shrink-0 opacity-[0.92]" aria-hidden />
            <span className="max-sm:sr-only">{label}</span>
            <span className="hidden text-[0.8125rem] font-semibold max-sm:inline">
              {short}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
