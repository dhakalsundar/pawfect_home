'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

interface StaggerProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  /** Seconds between each child's entrance. */
  gap?: number;
  delay?: number;
}

/**
 * Parent for a list of <StaggerItem> children — pet cards, category tiles, testimonials.
 * The children animate in sequence rather than all at once, which reads as intentional
 * rather than as a page that popped.
 */
export function Stagger({ children, gap = 0.08, delay = 0, ...props }: StaggerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduceMotion ? 0 : gap,
            delayChildren: reduceMotion ? 0 : delay,
          },
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
