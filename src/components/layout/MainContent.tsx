'use client';

import { ReactNode } from 'react';
import { useSidebar } from './SidebarContext';

export function MainContent({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={`min-h-screen transition-all duration-200 ease-in-out
                  p-4 md:p-6 xl:p-8
                  ${collapsed ? 'md:ml-24' : 'md:ml-80'}`}
    >
      {children}
    </main>
  );
}
