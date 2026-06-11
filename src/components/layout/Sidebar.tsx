'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Tag,
  FileText,
  CreditCard,
  BarChart2,
  Settings,
  UserCog,
  Building2,
  Wallet,
  Receipt,
  Palette,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  ClipboardList,
  ReceiptText,
  ShieldCheck,
  ChevronsUpDown,
  Plus,
  Check,
  CalendarDays,
} from 'lucide-react';
import { useState, useEffect, useMemo, ElementType } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { usePlatformImpersonation } from '@/hooks/usePlatformImpersonation';
import { useSidebar } from './SidebarContext';
import { NavItem } from './NavItem';

const mainNav = [
  { label: 'Dashboard',   href: '/',            icon: LayoutDashboard },
  { label: 'Calendar',    href: '/calendar',    icon: CalendarDays },
  { label: 'Clients',     href: '/clients',      icon: Users },
  { label: 'Projects',    href: '/projects',     icon: FolderOpen },
  { label: 'Quotations',  href: '/quotations',   icon: ClipboardList },
  { label: 'Services',    href: '/services',     icon: Tag },
  { label: 'Invoices',    href: '/invoices',     icon: FileText },
  { label: 'Payments',    href: '/payments',     icon: CreditCard },
  { label: 'Expenses',    href: '/expenses',     icon: ReceiptText },
  { label: 'Reports',     href: '/reports',      icon: BarChart2 },
];

const settingsNav = [
  { label: 'Company Profile', href: '/admin/settings/company', icon: Building2 },
  { label: 'Payment Methods', href: '/admin/settings/payment-methods', icon: Wallet },
  { label: 'Invoice Settings', href: '/admin/settings/invoice', icon: Receipt },
  { label: 'Branding', href: '/admin/settings/branding', icon: Palette },
  { label: 'Calendar', href: '/settings/calendar', icon: CalendarDays },
];

const adminNav = [
  { label: 'Users', href: '/admin/users', icon: UserCog },
];

const platformNav = [
  { label: 'Platform Admin', href: '/admin/platform', icon: ShieldCheck },
  { label: 'Packages', href: '/admin/platform/packages', icon: CreditCard },
];

type UserInfo = {
  name: string | null;
  email: string;
  role: string;
  appRole: string;
};

type CompanyBranding = {
  company_name: string | null;
  logo_url: string | null;
};

function useCurrentUserInfo() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const [info, setInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || !active) return;

      const { data } = await supabase
        .from('app_users')
        .select('full_name, email, role')
        .eq('auth_user_id', session.user.id)
        .single();

      const { data: membership } = data && activeCompanyId
        ? await supabase
            .from('company_users')
            .select('role_id')
            .eq('auth_user_id', session.user.id)
            .eq('company_id', activeCompanyId)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null };

      if (!active) return;

      if (data) {
        setInfo({
          name: data.full_name,
          email: data.email,
          role: membership?.role_id ?? data.role,
          appRole: data.role,
        });
      } else {
        setInfo({
          name: session.user.user_metadata?.full_name ?? null,
          email: session.user.email ?? '',
          role: 'staff',
          appRole: 'staff',
        });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [activeCompanyId, supabase]);

  return info;
}

function useCompanyBranding() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const { impersonation } = usePlatformImpersonation();
  const [branding, setBranding] = useState<CompanyBranding>({
    company_name: 'Sabtech Online',
    logo_url: null,
  });

  useEffect(() => {
    let active = true;

    async function loadBranding() {
      if (pathname.startsWith('/admin/platform') && !impersonation) {
        setBranding({
          company_name: 'Sabtech Online',
          logo_url: null,
        });
        return;
      }

      if (impersonation) {
        setBranding({
          company_name: impersonation.companyName,
          logo_url: null,
        });
        return;
      }

      if (!activeCompanyId) {
        setBranding({
          company_name: activeCompany?.name ?? 'Sabtech Online',
          logo_url: null,
        });
        return;
      }

      const { data, error } = await supabase
        .from('company_settings')
        .select('company_name, logo_url')
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      if (!active) return;

      if (!error && data) {
        setBranding({
          company_name: data.company_name || activeCompany?.name || 'Sabtech Online',
          logo_url: data.logo_url || null,
        });
      } else {
        setBranding({
          company_name: activeCompany?.name || 'Sabtech Online',
          logo_url: null,
        });
      }
    }

    loadBranding();
    return () => {
      active = false;
    };
  }, [activeCompany?.name, activeCompanyId, impersonation, pathname, supabase]);

  return branding;
}

function WorkspaceSwitcher({
  collapsed,
  companyName,
  logoUrl,
}: {
  collapsed: boolean;
  companyName: string;
  logoUrl: string | null;
}) {
  const { activeCompanyId, memberships, setActiveCompanyId } = useActiveCompany();
  const [isOpen, setIsOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const router = useRouter();

  const fallbackLogoUrl = logoUrl || '/logo.svg';
  const showLogo = !logoFailed;
  const currentInitial = companyName.charAt(0).toUpperCase();

  // close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClose() {
      setIsOpen(false);
    }
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [isOpen]);

  const handleWorkspaceChange = (companyId: string) => {
    setActiveCompanyId(companyId);
    router.refresh();
  };

  return (
    <div className="relative border-b border-slate-800">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between gap-3 px-4 py-5 hover:bg-slate-900/40 text-left transition-colors group outline-none cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 ring-1 ring-white/10 group-hover:ring-white/20 transition-all">
            {showLogo ? (
              <Image
                src={fallbackLogoUrl}
                alt={`${companyName} logo`}
                width={48}
                height={48}
                className="h-10 w-10 object-contain"
                unoptimized
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 text-white font-extrabold text-base">
                {currentInitial}
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-white text-base font-bold leading-tight flex items-center gap-1 group-hover:text-purple-300 transition-colors">
                {companyName}
              </h1>
              <p className="truncate text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Sabtech Workspace</p>
            </div>
          )}
        </div>

        {!collapsed && (
          <ChevronsUpDown className="h-4 w-4 text-slate-500 group-hover:text-slate-300 shrink-0 transition-colors" />
        )}
      </button>

      {/* Glassmorphic Dropdown Popover */}
      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="absolute left-4 top-20 w-72 bg-slate-950/95 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl z-50 p-2 space-y-1.5 focus:outline-none animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="px-3 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
            Workspaces
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            {memberships.map((m) => {
              const name = m.company?.name || 'Sabtech Online';
              const initial = name.charAt(0).toUpperCase();
              const isActive = m.company_id === activeCompanyId;
              
              // Generate deterministic gradient based on name character codes
              const colorKeys = [
                'from-pink-500 to-rose-500',
                'from-purple-500 to-indigo-500',
                'from-blue-500 to-cyan-500',
                'from-emerald-500 to-teal-500',
                'from-amber-500 to-orange-500'
              ];
              const nameSum = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
              const colorClass = colorKeys[nameSum % colorKeys.length];

              return (
                <button
                  key={m.company_id}
                  type="button"
                  onClick={() => handleWorkspaceChange(m.company_id)}
                  className={`w-full flex items-center justify-between gap-3 p-2 rounded-xl transition-all text-left outline-none cursor-pointer ${
                    isActive 
                      ? 'bg-purple-600/10 text-white border border-purple-500/25' 
                      : 'hover:bg-slate-900/60 text-slate-300 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colorClass} text-white font-black text-sm`}>
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold leading-tight">{name}</p>
                      <p className="truncate text-[10px] text-slate-500 font-medium">/{m.company?.slug || 'workspace'}</p>
                    </div>
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 text-purple-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-800/80 pt-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push('/onboarding/company');
              }}
              className="w-full flex items-center gap-3 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900/60 text-left text-xs font-semibold outline-none transition-all cursor-pointer"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950 text-slate-400">
                <Plus className="h-4 w-4" />
              </div>
              <span>Create Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  collapsed,
  pathname,
}: {
  collapsed: boolean;
  pathname: string;
}) {
  const isInSettings = pathname.startsWith('/admin/settings');
  const [open, setOpen] = useState(isInSettings);
  const visibleOpen = open || isInSettings;

  if (collapsed) {
    return (
      <Link
        href="/admin/settings/company"
        className={`flex items-center justify-center px-4 py-3 ${
          isInSettings ? 'text-white' : 'text-slate-400 hover:text-white'
        }`}
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
          isInSettings
            ? 'bg-slate-800 text-white border-l-2 border-purple-500'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <Settings className="h-5 w-5" />
        <span className="flex-1 text-left">Settings</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${visibleOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {visibleOpen && (
        <div className="mt-1 space-y-1">
          {settingsNav.map(({ label, href, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`ml-12 flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
                  isActive
                    ? 'text-white bg-slate-800'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function UserFooter({
  collapsed,
  user,
  onLogout,
}: {
  collapsed: boolean;
  user: UserInfo | null;
  onLogout: () => void;
}) {
  if (!user) return <div className="p-4 text-slate-500 text-sm">Loading…</div>;

  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <div className="border-t border-slate-800 p-3">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center rounded-xl bg-slate-800 p-3 text-slate-300 hover:text-white"
          title={`${user.name ?? user.email} • ${user.role.replace('_', ' ')}`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold">
            {initial}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {user.name ?? user.email}
          </p>
          <p className="truncate text-xs text-slate-400">
            {user.role.replace('_', ' ')}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="text-slate-400 hover:text-white"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function SidebarNavContent({
  collapsed = false,
  onNavClick,
}: {
  collapsed?: boolean;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUserInfo();
  const branding = useCompanyBranding();
  const showTenantAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const showPlatformAdmin = user?.appRole === 'super_admin';

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex h-full flex-col bg-[#071433]">
      <WorkspaceSwitcher
        collapsed={collapsed}
        companyName={branding.company_name || 'Sabtech Online'}
        logoUrl={branding.logo_url}
      />

      <div className="flex-1 overflow-y-auto py-4">
        {mainNav.map(({ label, href, icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

          return (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon as ElementType}
              isActive={isActive}
              collapsed={collapsed}
              onClick={onNavClick}
            />
          );
        })}

        {/* Admin section — only for super_admin and admin */}
        {(showTenantAdmin || showPlatformAdmin) && (
          <>
            {!collapsed && (
              <div className="px-5 pt-6 pb-2 text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
                Admin
              </div>
            )}

            {showTenantAdmin && (
              <>
                <SettingsSection collapsed={collapsed} pathname={pathname} />

                {adminNav.map(({ label, href, icon }) => {
                  const isActive = pathname.startsWith(href);

                  return (
                    <NavItem
                      key={href}
                      href={href}
                      label={label}
                      icon={icon as ElementType}
                      isActive={isActive}
                      collapsed={collapsed}
                      onClick={onNavClick}
                    />
                  );
                })}
              </>
            )}

            {showPlatformAdmin && platformNav.map(({ label, href, icon }) => {
              const isActive = href === '/admin/platform' ? pathname === href : pathname.startsWith(href);

              return (
                <NavItem
                  key={href}
                  href={href}
                  label={label}
                  icon={icon as ElementType}
                  isActive={isActive}
                  collapsed={collapsed}
                  onClick={onNavClick}
                />
              );
            })}
          </>
        )}
      </div>

      <UserFooter collapsed={collapsed} user={user} onLogout={handleLogout} />
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className={`hidden md:flex fixed top-0 left-0 h-screen flex-col border-r border-slate-800 bg-[#071433] transition-all duration-300 z-30 ${
        collapsed ? 'w-24' : 'w-80'
      }`}
    >
      <button
        onClick={toggle}
        className="absolute -right-4 top-40 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-700 text-white shadow-lg"
      >
        {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
      </button>

      <SidebarNavContent collapsed={collapsed} />
    </aside>
  );
}
