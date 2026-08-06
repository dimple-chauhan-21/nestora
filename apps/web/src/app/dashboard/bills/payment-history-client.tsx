'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Badge, Alert, AlertDescription, Card, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { flatPaymentsKey } from '../query-keys';

type PaymentResponseDto = components['schemas']['PaymentResponseDto'];

const STATUS_VARIANT: Record<PaymentResponseDto['status'], 'success' | 'warning' | 'destructive' | 'default'> = {
  success: 'success',
  pending: 'warning',
  failed: 'destructive',
  refunded: 'default',
};

const METHOD_LABEL: Record<PaymentResponseDto['method'], string> = {
  online: 'Online',
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank transfer',
};

async function fetchPayments(flatId: string): Promise<PaymentResponseDto[]> {
  const res = await fetch(`/api/flats/${flatId}/payments`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to load payment history');
  }
  return body as PaymentResponseDto[];
}

export function PaymentHistoryClient({ flatId }: { flatId: string }) {
  const query = useQuery({ queryKey: flatPaymentsKey(flatId), queryFn: () => fetchPayments(flatId) });

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{query.error instanceof Error ? query.error.message : 'Failed to load payment history'}</span>
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
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No payments recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Amount</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Paid at</TableHead>
          <TableHead>Receipt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {query.data.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell>
              {payment.currency} {payment.amount}
            </TableCell>
            <TableCell>{METHOD_LABEL[payment.method]}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[payment.status]}>{payment.status}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {payment.paidAt ? formatIst(payment.paidAt) : '—'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {payment.receiptNumber ?? <span className="italic">Not issued yet</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
