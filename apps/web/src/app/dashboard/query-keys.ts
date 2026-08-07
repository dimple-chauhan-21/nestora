export const pendingVisitsKey = (flatId: string) => ['visits', flatId, 'pending'] as const;
export const visitHistoryKey = (flatId: string) => ['visits', flatId, 'history'] as const;
export const flatBillsKey = (flatId: string) => ['billing', flatId, 'bills'] as const;
export const flatPaymentsKey = (flatId: string) => ['billing', flatId, 'payments'] as const;
export const myComplaintsKey = (flatId: string) => ['complaints', flatId, 'mine'] as const;
export const complaintCategoriesKey = () => ['complaints', 'categories'] as const;
export const complaintCommentsKey = (complaintId: string) => ['complaints', complaintId, 'comments'] as const;
export const societyNoticesKey = (societyId: string) => ['notices', societyId] as const;
