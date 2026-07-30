import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@nestora/ui';

const SECTIONS = [
  { href: '/admin/settings', title: 'Society Settings', description: 'Billing cycle, late fees, fiscal year, feature flags.' },
  { href: '/admin/residents', title: 'Residents', description: 'Search residents by flat, view vehicles and pets.' },
  { href: '/admin/complaints', title: 'Complaints', description: 'Filter the complaint queue, assign staff, comment.' },
  { href: '/admin/billing', title: 'Billing', description: 'Collection summary, per-flat bill history, offline payments.' },
  { href: '/admin/notices', title: 'Notices', description: 'Post a notice to residents.' },
];

export default function AdminOverviewPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SECTIONS.map((section) => (
        <Link key={section.href} href={section.href}>
          <Card className="h-full transition-colors hover:bg-accent/30">
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
