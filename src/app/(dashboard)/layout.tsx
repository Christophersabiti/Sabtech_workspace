export const dynamic = 'force-dynamic';

import { SidebarProvider } from '@/components/layout/SidebarContext';
import { Sidebar }         from '@/components/layout/Sidebar';
import { TopBar }          from '@/components/layout/TopBar';
import { MobileDrawer }    from '@/components/layout/MobileDrawer';
import { MainContent }     from '@/components/layout/MainContent';
import { WorkspaceGate }    from '@/components/workspaces/WorkspaceGate';
import { TrialStatusBanner } from '@/components/billing/TrialStatusBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50">
        {/* Desktop sidebar — hidden on mobile, visible on lg+ */}
        <Sidebar />

        {/* Mobile top bar — visible only below lg */}
        <TopBar />

        {/* Mobile overlay drawer */}
        <MobileDrawer />

        {/* Main content — margin shifts with sidebar state */}
        <MainContent>
          <WorkspaceGate>
            <TrialStatusBanner />
            {children}
          </WorkspaceGate>
        </MainContent>
      </div>
    </SidebarProvider>
  );
}
