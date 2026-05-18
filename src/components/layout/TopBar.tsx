'use client';

import Image from 'next/image';
import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export function TopBar() {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3
                       bg-slate-900 border-b border-slate-700 shadow-sm">
      {/* Hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-white
                   hover:bg-slate-800 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo + Name */}
      <div className="flex items-center gap-2.5">
        <Image src="/logo.svg" alt="SAB" width={28} height={28} />
        <span className="text-sm font-bold text-white">Sabtech Online</span>
      </div>
    </header>
  );
}
