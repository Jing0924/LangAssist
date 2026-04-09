import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

const tap = { scale: 0.92 };
const transition = { type: "spring" as const, stiffness: 520, damping: 32 };

export const MotionPressable = forwardRef<
  HTMLButtonElement,
  HTMLMotionProps<"button">
>(function MotionPressable({ whileTap, transition: t, ...props }, ref) {
  return (
    <motion.button
      ref={ref}
      whileTap={whileTap ?? tap}
      transition={t ?? transition}
      {...props}
    />
  );
});

MotionPressable.displayName = "MotionPressable";
