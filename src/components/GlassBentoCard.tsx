import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cn } from "../lib/cn";

type GlassBentoCardProps = {
  children: ReactNode;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "children" | "className">;

export function GlassBentoCard({
  children,
  className = "",
  ...motionProps
}: GlassBentoCardProps) {
  const hoverLift = useMediaQuery("(hover: hover) and (pointer: fine)");

  return (
    <motion.div
      className={cn(
        "rounded-[20px] border border-white/10 bg-[var(--glass-bg)] shadow-[0_8px_32px_oklch(0.1_0.05_280/0.35),inset_0_1px_0_var(--glass-highlight)] backdrop-blur-xl max-sm:backdrop-blur-[22px]",
        className,
      )}
      whileHover={
        hoverLift
          ? {
              y: -4,
              transition: { type: "spring", stiffness: 420, damping: 28 },
            }
          : undefined
      }
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}
