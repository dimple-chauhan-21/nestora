import Link from 'next/link';
import { Button } from '@nestora/ui';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <h1 className="text-2xl font-semibold text-foreground">Nestora</h1>
      <Button asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </main>
  );
}
