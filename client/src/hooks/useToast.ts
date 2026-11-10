import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(duration = 2600) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback(
    (msg?: string) => {
      if (!msg) return;
      setToast(msg);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, notify };
}
