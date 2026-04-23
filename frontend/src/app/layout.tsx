'use client';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } }
  }));

  return (
    <html lang="en">
      <head>
        <title>iBirdOS — AI Kitchen Operating System</title>
        <meta name="description" content="Real-time profit intelligence for food businesses" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--surface-2)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px'
              },
              success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--surface-2)' } },
              error:   { iconTheme: { primary: 'var(--red)', secondary: 'var(--surface-2)' } }
            }}
          />
        </QueryClientProvider>
      </body>
    </html>
  );
}


