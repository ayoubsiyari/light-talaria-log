import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface LogbookSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  zIndex?: number;
  wide?: boolean;
  dim?: boolean;
  trapEscape?: boolean;
}

/**
 * Journal window — landing-site chrome (ink, charcoal, hairline, display type).
 * Sizes to content. No stretched void.
 */
export function LogbookSheet({
  title,
  onClose,
  children,
  zIndex = 100010,
  wide = false,
  dim = true,
  trapEscape = true,
}: LogbookSheetProps) {
  const titleId = useId();
  useEffect(() => {
    if (!trapEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, trapEscape]);

  return createPortal(
    <div
      className={[
        'desk-overlay fixed inset-0 flex items-end sm:items-center justify-center',
        'p-0 sm:p-6',
        dim ? 'desk-dim' : '',
      ].join(' ')}
      style={{ zIndex }}
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'w-full flex flex-col jd-dialog',
          'max-h-[min(92dvh,720px)]',
          'rounded-t-[28px] sm:rounded-[28px]',
          wide ? 'max-w-2xl' : 'max-w-xl',
        ].join(' ')}
      >
        <header className="shrink-0 flex items-center justify-between gap-4 px-6 pt-5 pb-3">
          <h2
            id={titleId}
            className="font-display text-xl font-semibold tracking-tight jd-dialog-title"
          >
            {title}
          </h2>
          <button
            type="button"
            className="jd-btn jd-btn-ghost"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
