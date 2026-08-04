declare module '@/v8b/TalariaV8b.jsx' {
  import type { ComponentType } from 'react';

  export interface TalariaV8bProps {
    onLaunchSession?: (session: import('@/components/v8b/v8bSessionBridge').V8bSessionLike | null) => void;
    shellOnly?: boolean;
    initialSessView?: string | null;
    onSessViewChange?: (view: string) => void;
    initialProfileOpen?: boolean;
  }

  const TalariaV8b: ComponentType<TalariaV8bProps>;
  export default TalariaV8b;
}
