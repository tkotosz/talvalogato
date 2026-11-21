import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeAction {
  direction: SwipeDirection;
  label: string;
}

export interface SwipeCardHandle {
  /** Animates the card off in a direction and reports the action; resolves to false when nothing happened. */
  swipe(direction: SwipeDirection | null): Promise<boolean>;
}

interface SwipeCardProps {
  actions: SwipeAction[];
  onAction(direction: SwipeDirection): void;
  distance?: number;
  velocity?: number;
  children: ReactNode;
}

const vectors: Record<SwipeDirection, [number, number]> = {
  left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1],
};

function directionOf({ x, y }: { x: number; y: number }): SwipeDirection {
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard({
  actions, onAction, distance = 82, velocity = 600, children,
}, ref) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-450, 0, 450], [-14, 0, 14]);
  const opacity = useMotionValue(1);
  const lock = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const [intent, setIntent] = useState<SwipeDirection | null>(null);
  const reducedMotion = useReducedMotion();

  async function settle(direction: SwipeDirection | null) {
    const action = actions.find(item => item.direction === direction);
    if (lock.current) return false;
    if (!direction || !action) {
      setIntent(null);
      animate(x, 0, { duration: 0.18 });
      animate(y, 0, { duration: 0.18 });
      return false;
    }

    lock.current = true;
    setIntent(direction);
    const [horizontal, vertical] = vectors[direction];
    const extent = Math.max(500, (card.current?.clientWidth ?? 440) + 140);
    const duration = reducedMotion ? 0.015 : 0.23;
    await Promise.all([
      animate(x, horizontal * extent, { duration, ease: 'easeIn' }),
      animate(y, vertical * extent, { duration, ease: 'easeIn' }),
      animate(opacity, 0, { duration, ease: 'easeIn' }),
    ]);
    if (card.current) onAction(direction);
    return true;
  }

  useImperativeHandle(ref, () => ({ swipe: settle }));
  const currentAction = actions.find(action => action.direction === intent);

  return <motion.div
    ref={card}
    className="swipe-card"
    style={{ x, y, rotate: reducedMotion ? 0 : rotate, opacity }}
    drag
    dragMomentum={false}
    onDrag={(_, { offset }) => {
      const direction = directionOf(offset);
      setIntent(Math.hypot(offset.x, offset.y) > distance * 0.6 ? direction : null);
    }}
    onDragEnd={(_, info) => {
      if (Math.hypot(info.offset.x, info.offset.y) >= distance) {
        settle(directionOf(info.offset));
      } else if (Math.hypot(info.offset.x, info.offset.y) >= 20 && Math.hypot(info.velocity.x, info.velocity.y) >= velocity) {
        settle(directionOf(info.velocity));
      } else {
        settle(null);
      }
    }}
    whileTap={reducedMotion ? undefined : { cursor: 'grabbing' }}
  >
    {children}
    {currentAction && <span aria-hidden="true" className={`swipe-intent intent-${intent}`}>{currentAction.label}</span>}
  </motion.div>;
});
