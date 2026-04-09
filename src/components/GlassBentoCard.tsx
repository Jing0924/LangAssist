import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type GlassBentoCardProps = {
  children: ReactNode;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "children" | "className">;

export function GlassBentoCard({
  children,
  className = "",
  ...motionProps
}: GlassBentoCardProps) {
  return (
    <motion.div
      className={`glass-panel ${className}`.trim()}
      whileHover={{
        y: -4,
        transition: { type: "spring", stiffness: 420, damping: 28 },
      }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}
