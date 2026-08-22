import type { ReactNode } from 'react';
import { DeskFrame } from '@/components/desk/DeskFrame';

interface AppPageFrameProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
  compact?: boolean;
}

/**
 * App chrome — cream desk shared with Journal.
 */
export function AppPageFrame({
  title,
  description,
  actions,
  nav,
  children,
}: AppPageFrameProps) {
  return (
    <DeskFrame
      brand={title}
      nav={nav}
      actions={actions}
      subtitle={
        description ? <p className="jd-sub">{description}</p> : null
      }
    >
      {children}
    </DeskFrame>
  );
}
