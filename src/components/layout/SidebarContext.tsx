'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const LS_KEY = 'sab_sidebar_collapsed';

type SidebarContextType = {
  collapsed:     boolean;
  setCollapsed:  (v: boolean) => void;
  toggle:        () => void;
  mobileOpen:    boolean;
  setMobileOpen: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType>({
  collapsed:     false,
  setCollapsed:  () => {},
  toggle:        () => {},
  mobileOpen:    false,
  setMobileOpen: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Default collapsed=false; will be overridden from localStorage on mount
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen]    = useState(false);
  const [hydrated, setHydrated]        = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored !== null) setCollapsedState(stored === 'true');
    } catch { /* localStorage not available */ }
    setHydrated(true);
  }, []);

  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    try { localStorage.setItem(LS_KEY, String(v)); } catch { /* ignore */ }
  }

  function toggle() { setCollapsed(!collapsed); }

  // Prevent flash of wrong sidebar width before hydration
  if (!hydrated) {
    return (
      <SidebarContext.Provider value={{ collapsed: false, setCollapsed, toggle, mobileOpen, setMobileOpen }}>
        {children}
      </SidebarContext.Provider>
    );
  }

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
