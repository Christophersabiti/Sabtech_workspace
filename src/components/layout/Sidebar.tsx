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
} from 'lucide-react';
import { useState, useEffect, ElementType } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSidebar } from './SidebarContext';
import { NavItem } from './NavItem';

const mainNav = [
  { label: 'Dashboard',   href: '/',            icon: LayoutDashboard },
  { label: 'Clients',     href: '/clients',      icon: Users },
  { label: 'Projects',    href: '/projects',     icon: FolderOpen },
  { label: 'Quotations',  href: '/quotations',   icon: ClipboardList },
  { label: 'Services',    href: '/services',     icon: Tag },
  { label: 'Invoices',    href: '/invoices',     icon: FileText },
  { label: 'Payments',    href: '/payments',     icon: CreditCard },
  { label: 'Reports',     href: '/reports',      icon: BarChart2 },
];

const settingsNav = [
  { label: 'Company Profile', href: '/admin/settings/company', icon: Building2 },
  { label: 'Payment Methods', href: '/admin/settings/payment-methods', icon: Wallet },
  { label: 'Invoice Settings', href: '/admin/settings/invoice', icon: Receipt },
  { label: 'Branding', href: '/admin/settings/branding', icon: Palette },
];

const adminNav = [
  { label: 'Users', href: '/admin/users', icon: UserCog },
];

type UserInfo = {
  name: string | null;
  email: string;
  role: string;
};

type CompanyBranding = {
  company_name: string | null;
  logo_url: string | null;
};

function useCurrentUserInfo() {
  const supabase = createClient();
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

      if (!active) return;

      if (data) {
        setInfo({
          name: data.full_name,
          email: data.email,
          role: data.role,
        });
      } else {
        setInfo({
          name: session.user.user_metadata?.full_name ?? null,
          email: session.user.email ?? '',
          role: 'staff',
        });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  return info;
}

function useCompanyBranding() {
  const supabase = createClient();
  const [branding, setBranding] = useState<CompanyBranding>({
    company_name: 'Sabtech Online',
    logo_url: null,
  });

  useEffect(() => {
    let active = true;

    async function loadBranding() {
      const { data, error } = await supabase
        .from('company_settings')
        .select('company_name, logo_url')
        .eq('id', 1)
        .single();

      if (!active) return;

      if (!error && data) {
        setBranding({
          company_name: data.company_name || 'Sabtech Online',
          logo_url: data.logo_url || null,
        });
      }
    }

    loadBranding();
    return () => {
      active = false;
    };
  }, [supabase]);

  return branding;
}

function SidebarBrand({
  collapsed,
  companyName,
  logoUrl,
}: {
  collapsed: boolean;
  companyName: string;
  logoUrl: string | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!logoUrl && !logoFailed;

  return (
    <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
        {showLogo ? (
          <Image
            src={logoUrl as string}
            alt={`${companyName} logo`}
            width={56}
            height={56}
            className="h-12 w-12 object-contain"
            unoptimized
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-fuchsia-500 text-fuchsia-500 font-bold text-lg">
            SAB
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="min-w-0">
          <h1 className="truncate text-white text-2xl font-bold leading-tight">
            {companyName}
          </h1>
          <p className="truncate text-slate-400 text-sm">Invoicing System</p>
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

  useEffect(() => {
    if (isInSettings) setOpen(true);
  }, [isInSettings]);

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
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex h-full flex-col bg-[#071433]">
      <SidebarBrand
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
        {(user?.role === 'super_admin' || user?.role === 'admin') && (
          <>
            {!collapsed && (
              <div className="px-5 pt-6 pb-2 text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
                Admin
              </div>
            )}

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
