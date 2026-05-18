'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { SidebarNavContent } from './Sidebar';

export function MobileDrawer() {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setMobileOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // Focus trap — focus first focusable element when opened
  useEffect(() => {
    if (mobileOpen && drawerRef.current) {
      const first = drawerRef.current.querySelector<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  }, [mobileOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-200
          ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`lg:hidden fixed top-0 left-0 z-50 h-full w-72 flex flex-col
                    shadow-2xl transition-transform duration-200 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="absolute top-3.5 right-3 z-10 p-1.5 rounded-lg
                     text-slate-400 hover:text-white hover:bg-slate-800
                     transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Nav content — always expanded (no collapsed mode in drawer) */}
        <SidebarNavContent collapsed={false} onNavClick={() => setMobileOpen(false)} />
      </div>
    </>
  );
}
