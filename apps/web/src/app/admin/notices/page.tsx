import { NoticeForm } from './notice-form';

export default function AdminNoticesPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Post a Notice</h1>
        <p className="text-sm text-muted-foreground">
          Publish to residents now — a resident-facing read view is a separate piece of work, not part of this
          screen.
        </p>
      </div>
      <NoticeForm />
    </div>
  );
}
