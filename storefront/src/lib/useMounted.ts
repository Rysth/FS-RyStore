import { useEffect, useState } from "react";

/** Returns true only after the component has mounted in the browser. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
