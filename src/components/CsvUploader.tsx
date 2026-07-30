import { useRef } from 'react';
import { Button } from '@heroui/react';

interface CsvUploaderProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function CsvUploader({ onFile, disabled }: CsvUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="h-8 min-h-8 px-2.5 text-[13px]"
        isDisabled={disabled}
        onPress={() => inputRef.current?.click()}
      >
        Upload CSV
      </Button>
    </>
  );
}
