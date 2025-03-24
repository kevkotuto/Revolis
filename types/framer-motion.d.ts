declare module 'framer-motion' {
  import { ComponentType, ReactNode } from 'react';

  export interface MotionProps {
    initial?: any;
    animate?: any;
    exit?: any;
    variants?: any;
    whileHover?: any;
    whileTap?: any;
    transition?: any;
    layout?: boolean;
    className?: string;
    style?: any;
    children?: ReactNode;
  }

  export interface MotionComponent extends ComponentType<MotionProps> {
    displayName?: string;
  }

  export const motion: {
    div: MotionComponent;
    span: MotionComponent;
    p: MotionComponent;
    h1: MotionComponent;
    h2: MotionComponent;
    h3: MotionComponent;
    h4: MotionComponent;
    h5: MotionComponent;
    h6: MotionComponent;
    ul: MotionComponent;
    ol: MotionComponent;
    li: MotionComponent;
    a: MotionComponent;
    button: MotionComponent;
    form: MotionComponent;
    input: MotionComponent;
    textarea: MotionComponent;
    select: MotionComponent;
    option: MotionComponent;
    table: MotionComponent;
    thead: MotionComponent;
    tbody: MotionComponent;
    tr: MotionComponent;
    th: MotionComponent;
    td: MotionComponent;
    img: MotionComponent;
    svg: MotionComponent;
    path: MotionComponent;
    circle: MotionComponent;
    rect: MotionComponent;
    [key: string]: MotionComponent;
  };

  export const AnimatePresence: ComponentType<{
    children?: ReactNode;
    mode?: 'sync' | 'wait' | 'popLayout';
    initial?: boolean;
    onExitComplete?: () => void;
  }>;
} 