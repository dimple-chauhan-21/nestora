export const pendingVisitsKey = (flatId: string) => ['visits', flatId, 'pending'] as const;
export const visitHistoryKey = (flatId: string) => ['visits', flatId, 'history'] as const;
