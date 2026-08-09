import type { EndCapStyle } from '@/drawings/drawingStyle';
import { EndpointPreview } from './dashPreview';
import { SettDropOption, SettDropdownShell } from './SettDropdownShell';

const CAPS: EndCapStyle[] = ['none', 'normal', 'arrow'];

interface SettEndpointDropdownProps {
  side: 'left' | 'right';
  value: EndCapStyle;
  onChange: (v: EndCapStyle) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

/** None / normal(dot) / arrow endpoint dropdown (V9 ep1/ep2 + none). */
export function SettEndpointDropdown({
  side,
  value,
  onChange,
  open,
  onOpenChange,
  disabled,
}: SettEndpointDropdownProps) {
  return (
    <SettDropdownShell
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      ariaLabel={side === 'left' ? 'Left end' : 'Right end'}
      btnWidth={48}
      rightAlign={side === 'right'}
      preview={<EndpointPreview side={side} style={value} active={open} />}
    >
      {CAPS.map((cap) => (
        <SettDropOption
          key={cap}
          selected={value === cap}
          onSelect={() => {
            onChange(cap);
            onOpenChange(false);
          }}
        >
          <EndpointPreview side={side} style={cap} active={value === cap} />
        </SettDropOption>
      ))}
    </SettDropdownShell>
  );
}
