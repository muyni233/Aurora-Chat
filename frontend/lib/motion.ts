import type { Transition, Variants, Easing } from "framer-motion";

export const spring = {
  soft: { type: "spring", stiffness: 260, damping: 24 } as Transition,
  snap: { type: "spring", stiffness: 420, damping: 28 } as Transition,
  float: { type: "spring", stiffness: 180, damping: 22 } as Transition,
  cushion: { type: "spring", stiffness: 140, damping: 18 } as Transition,
  bounce: { type: "spring", stiffness: 360, damping: 18 } as Transition,
} as const;

export const glide: Easing = [0.22, 0.61, 0.36, 1];
export const easeOut: Easing = [0, 0, 0, 1];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3, ease: glide } },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring.soft },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: spring.soft },
};

export const liquify: Variants = {
  hidden: { opacity: 0, filter: "blur(8px)", scale: 0.985 },
  show: {
    opacity: 1,
    filter: "blur(0px)",
    scale: 1,
    transition: { duration: 0.55, ease: glide },
  },
};

/** 交错容器 — 配合 `motion.div initial="hidden" animate="show" variants={stagger(0.06)}` 使用。 */
export function stagger(delay = 0.06, initialDelay = 0): Variants {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: delay,
        delayChildren: initialDelay,
      },
    },
  };
}

export const messageLand: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
};

export const bubbleHover: Variants = {
  rest: { y: 0, scale: 1, transition: spring.float },
  hover: { y: -2, scale: 1.01, transition: spring.float },
  tap: { scale: 0.985, transition: spring.snap },
};
