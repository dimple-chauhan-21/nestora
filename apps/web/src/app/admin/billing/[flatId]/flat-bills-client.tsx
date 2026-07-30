'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Select,
  Badge,
  Card,
  CardContent,
  Alert,
  AlertDescription,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@nestora/ui';
import { formatIst } from '@nestora/utils';
import type { components } from '@nestora/types';
import { flatBillsKey } from '../../query-keys';

type BillResponseDto = components['schemas']['BillResponseDto'];
type PaymentMethod = components['schemas']['RecordOfflinePaymentDto']['method'];

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

async function recordPayment(billId: string, amount: number, method: PaymentMethod) {
  const res = await fetch(`/api/bills/${billId}/record-offline-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, method }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Failed to record payment');
  }
  return body;
}

function OfflinePaymentForm({ bill, flatId }: { bill: BillResponseDto; flatId: string }) {
  const queryClient = useQueryClient();
  const outstanding = (Number(bill.amountDue) - Number(bill.amountPaid)).toFixed(2);
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => recordPayment(bill.id, Number(amount), method),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: flatBillsKey(flatId) });
    },
  });

  if (bill.status === 'paid') return null;

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Record payment
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="w-28 space-y-1">
        <label className="text-xs text-muted-foreground">Amount</label>
        <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="w-36 space-y-1">
        <label className="text-xs text-muted-foreground">Method</label>
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="bank_transfer">Bank transfer</option>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {mutation.isError && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to record payment'}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}

export function FlatBillsClient({ flatId }: { flatId: string }) {
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
          No bills generated for this flat yet.
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
              <OfflinePaymentForm bill={bill} flatId={flatId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
