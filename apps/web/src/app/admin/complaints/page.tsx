import { ComplaintsQueueClient } from './complaints-queue-client';

export default function AdminComplaintsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Complaints</h1>
        <p className="text-sm text-muted-foreground">Filter the queue, assign staff, and comment on a complaint.</p>
      </div>
      <ComplaintsQueueClient />
    </div>
  );
}
