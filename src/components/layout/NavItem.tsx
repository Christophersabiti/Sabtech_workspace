'use client';

import Link from 'next/link';
import { ElementType } from 'react';

type NavItemProps = {
  href:       string;
  label:      string;
  icon:       ElementType;
  isActive:   boolean;
  collapsed:  boolean;
  accent?:    'blue' | 'purple';
  onClick?:   () => void;
};

export function NavItem({
  href, label, icon: Icon, isActive, collapsed, accent = 'blue', onClick,
}: NavItemProps) {
  const activeClass = accent === 'purple'
    ? 'bg-slate-800 text-white border-l-2 border-purple-500'
    : 'bg-slate-800 text-white border-l-2 border-blue-500';

  return (
    <div className="relative group/navitem">
      <Link
        href={href}
        onClick={onClick}
        className={`flex items-center gap-3 py-2.5 text-sm transition-colors
          ${collapsed ? 'justify-center px-0' : 'px-5'}
          ${isActive
            ? activeClass
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>

      {/* Tooltip — only in collapsed mode on desktop */}
      {collapsed && (
        <div
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2
                     -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-700
                     px-2.5 py-1.5 text-xs font-medium text-white shadow-lg
                     opacity-0 group-hover/navitem:opacity-100 transition-opacity duration-150"
        >
          {label}
          {/* Arrow */}
          <span className="absolute right-full top-1/2 -translate-y-1/2
                           border-4 border-transparent border-r-slate-700" />
        </div>
      )}
    </div>
  );
}
