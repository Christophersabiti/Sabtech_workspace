import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export const metadata: Metadata = {
  title: 'Sabtech Workspace',
  description: 'Commercial SaaS workspace for clients, projects, quotations, invoices, expenses, reports, and multi-company operations.',
  applicationName: 'Sabtech Workspace',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sabtech Workspace',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Sabtech Workspace',
    description: 'Run clients, projects, invoices, expenses, and reports in a branded multi-company SaaS workspace.',
    siteName: 'Sabtech Workspace',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#091545',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
