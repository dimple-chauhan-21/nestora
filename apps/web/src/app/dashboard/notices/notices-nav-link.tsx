'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { components } from '@nestora/types';
import { societyNoticesKey } from '../query-keys';

type NoticeResponseDto = components['schemas']['NoticeResponseDto'];

async function fetchNotices(societyId: string): Promise<NoticeResponseDto[]> {
  const res = await fetch(`/api/societies/${societyId}/notices`);
  if (!res.ok) throw new Error('Failed to load notices');
  return res.json();
}

/** Same pill-badge pattern as the dashboard's "Pending Approvals" count (pending-visits-section.tsx) — reused here, not reinvented, so an unread count reads the same way everywhere on this dashboard. */
export function NoticesNavLink({ societyId }: { societyId: string }) {
  const query = useQuery({ queryKey: societyNoticesKey(societyId), queryFn: () => fetchNotices(societyId) });
  const unreadCount = query.isSuccess ? query.data.filter((n) => !n.isRead).length : 0;

  return (
    <Link href="/dashboard/notices" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      Notices
      {query.isSuccess && unreadCount > 0 && (
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
