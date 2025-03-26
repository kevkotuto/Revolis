"use client";

import React from 'react';
import { ThemeProvider } from '@/components/ui/theme-provider'
import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { SocketProvider } from '@/components/ui/socket-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <SocketProvider>
          <Toaster />
          {children}
        </SocketProvider>
      </ThemeProvider>
    </SessionProvider>
  );
} 