import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Same pattern as apps/web's Providers — one QueryClient per app instance, not per render. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
