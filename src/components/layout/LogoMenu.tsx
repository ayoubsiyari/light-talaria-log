import { useState } from 'react';
import { Popover } from '@heroui/react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';

interface LogoMenuProps {
  onExitSession?: () => void;
  onOpenChartSettings?: () => void;
}

/**
 * Obsidian logo drop — Settings / Profile / Help / Dashboard stubs + exit.
 */
export function LogoMenu({ onExitSession, onOpenChartSettings }: LogoMenuProps) {
  const [open, setOpen] = useState(false);

  const row = (
    label: string,
    icon: string,
    onClick?: () => void,
    stub?: boolean,
  ) => (
    <button
      key={label}
      type="button"
      data-menu-row=""
      disabled={!onClick && stub}
      className="w-full flex items-center gap-2 px-2.5 min-h-11 sm:min-h-9 text-left text-[13px] disabled:opacity-50"
      onClick={() => {
        onClick?.();
        setOpen(false);
      }}
    >
      <ChromeIcon n={icon} s={15} />
      <span className="flex-1">{label}</span>
      {stub && !onClick ? (
        <span className="text-[9px] text-[color:var(--text-faint)]">Soon</span>
      ) : null}
    </button>
  );

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Talaria menu"
        data-tb-zone="logo"
        className="shrink-0 h-9 min-h-11 w-9 min-w-11 sm:min-h-9 sm:min-w-9 mr-0.5 px-0 inline-flex items-center justify-center rounded-[var(--radius-control,6px)]"
      >
        <BrandLogo size={28} variant="raster" className="w-7 h-7" />
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 z-[100]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-sdrop="1"
          className="w-[14rem] overflow-hidden bg-[color:var(--surface)] border border-[color:var(--line)] rounded-[var(--radius-panel,8px)] shadow-none py-1"
        >
          {row('Settings', 'settings', () => {
            onOpenChartSettings?.();
            window.dispatchEvent(new CustomEvent('talaria:open-chart-settings'));
          })}
          {row('Profile', 'user', undefined, true)}
          {row('Help', 'help', undefined, true)}
          <div className="px-2.5 py-1.5 text-[10px] text-[color:var(--text-faint)] border-t border-[color:var(--line)]">
            Build · chart chrome
          </div>
          <div className="px-2 pb-2 pt-1">
            <button
              type="button"
              data-brand-btn="primary"
              className="w-full min-h-11 sm:min-h-9 rounded-md text-[12px] font-bold inline-flex items-center justify-center gap-1.5"
              disabled={!onExitSession}
              onClick={() => {
                onExitSession?.();
                setOpen(false);
              }}
            >
              <ChromeIcon n="layout" s={14} cl="var(--cta-fg)" />
              Dashboard
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
