function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function VisitorAvatar({ name, photoUrl }: { name: string | null; photoUrl: string | null }) {
  if (photoUrl) {
    // Plain <img>, not next/image: visitor photos are arbitrary remote URLs, not a known-domain asset set worth configuring next/image for yet.
    return <img src={photoUrl} alt={name ?? 'Visitor'} className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
      {initials(name)}
    </div>
  );
}
