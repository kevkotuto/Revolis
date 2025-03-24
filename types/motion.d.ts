declare module 'motion/react' {
  import { ComponentType, HTMLAttributes } from 'react';

  export interface MotionProps {
    initial?: any;
    animate?: any;
    transition?: any;
    variants?: any;
  }
  
  export const motion: {
    div: ComponentType<MotionProps & HTMLAttributes<HTMLDivElement>>;
  };
} 