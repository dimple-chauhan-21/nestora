'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Badge,
  Alert,
  AlertDescription,
  Spinner,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { flatBillsKey, flatPaymentsKey } from '../query-keys';

type BillResponseDto = components['schemas']['BillResponseDto'];
type PaymentSessionResponseDto = components['schemas']['PaymentSessionResponseDto'];

const STATUS_VARIANT: Record<BillResponseDto['status'], 'success' | 'warning' | 'destructive' | 'default'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'default',
  overdue: 'destructive',
};

async function fetchBills(flatId: string): Promise<BillResponseDto[]> {
  const res = await fetch(`/api/flats/${flatId}/bills`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load bills');
  }
  return body as BillResponseDto[];
}

async function payBill(billId: string): Promise<PaymentSessionResponseDto> {
  const res = await fetch(`/api/bills/${billId}/pay`, { method: 'POST' });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to start payment');
  }
  return body as PaymentSessionResponseDto;
}

/**
 * Shown after a successful "Pay now" click. Deliberately not a clickable
 * link to `checkoutUrl` — that domain is `.invalid` (reserved, guaranteed
 * non-resolving) because there's no real Razorpay account behind this yet
 * (see KNOWN_GAPS.md). The session itself is real (a `pending` payment row
 * now exists), but nothing completes it automatically. Honest about that
 * here rather than implying a working checkout.
 */
function PaymentSessionNotice({ session, onDismiss }: { session: PaymentSessionResponseDto; onDismiss: () => void }) {
  return (
    <Alert>
      <AlertDescription className="space-y-2">
        <p className="font-medium text-foreground">Payment session started</p>
        <p>
          A payment of this amount is now pending (reference <code className="text-xs">{session.gatewayRef}</code>).
          Online payment collection isn&apos;t fully live yet — there&apos;s no real payment gateway connected, so
          this session won&apos;t confirm on its own. Your society&apos;s Accountant can record this payment
          manually once received, or contact them directly.
        </p>
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function PayButton({ bill, flatId }: { bill: BillResponseDto; flatId: string }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<PaymentSessionResponseDto | null>(null);

  const mutation = useMutation({
    mutationFn: () => payBill(bill.id),
    onSuccess: (data) => {
      setSession(data);
      void queryClient.invalidateQueries({ queryKey: flatPaymentsKey(flatId) });
    },
  });

  if (bill.status === 'paid') {
    return <span className="text-sm text-muted-foreground">Paid</span>;
  }

  return (
    <div className="space-y-2">
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
        Pay now
      </Button>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to start payment'}
          </AlertDescription>
        </Alert>
      )}
      {session && <PaymentSessionNotice session={session} onDismiss={() => setSession(null)} />}
    </div>
  );
}

export function BillsClient({ flatId }: { flatId: string }) {
  const query = useQuery({ queryKey: flatBillsKey(flatId), queryFn: () => fetchBills(flatId) });

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load bills'}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (query.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No bills generated for your flat yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Paid</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due date</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {query.data.map((bill) => (
          <TableRow key={bill.id}>
            <TableCell>{bill.billingPeriod}</TableCell>
            <TableCell>
              {bill.currency} {bill.amountDue}
            </TableCell>
            <TableCell>
              {bill.currency} {bill.amountPaid}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatIst(bill.dueDate)}</TableCell>
            <TableCell>
              <PayButton bill={bill} flatId={flatId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
