'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@nestora/ui';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/residents', label: 'Residents' },
  { href: '/admin/complaints', label: 'Complaints' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/notices', label: 'Notices' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
