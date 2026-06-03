'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const offsets: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 24 },
  down: { x: 0, y: -24 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
  none: { x: 0, y: 0 },
};

interface FadeInProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  /** Animate once on scroll-into-view (default) or immediately on mount. */
  onView?: boolean;
}

/**
 * Scroll-reveal wrapper. Accepts children so a Server Component's output can be slotted in without
 * making the subtree client-side.
 *
 * When the OS asks for reduced motion this renders content at its final state with no transform —
 * the CSS media query in globals.css zeroes durations, but a transform-based reveal would still
 * jump, so the offset is dropped here too.
 */
export function FadeIn({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.5,
  onView = true,
  ...props
}: FadeInProps) {
  const reduceMotion = useReducedMotion();
  const offset = reduceMotion ? offsets.none : offsets[direction];

  const animation = {
    initial: { opacity: 0, ...offset },
    animate: { opacity: 1, x: 0, y: 0 },
  };

  return (
    <motion.div
      initial={animation.initial}
      {...(onView
        ? { whileInView: animation.animate, viewport: { once: true, margin: '-80px' } }
        : { animate: animation.animate })}
      transition={{
        duration: reduceMotion ? 0 : duration,
        delay: reduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
