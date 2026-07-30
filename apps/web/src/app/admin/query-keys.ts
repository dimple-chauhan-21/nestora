export const societySettingsKey = (societyId: string) => ['admin', 'society', societyId, 'settings'] as const;
export const residentsKey = (societyId: string, filters: Record<string, string | undefined>) =>
  ['admin', 'society', societyId, 'residents', filters] as const;
export const flatDetailKey = (flatId: string) => ['admin', 'flat', flatId, 'detail'] as const;
export const complaintsKey = (filters: Record<string, string | undefined>) => ['admin', 'complaints', filters] as const;
export const complaintCommentsKey = (complaintId: string) => ['admin', 'complaints', complaintId, 'comments'] as const;
export const assignableStaffKey = (societyId: string) => ['admin', 'society', societyId, 'assignable-staff'] as const;
export const financialSummaryKey = (societyId: string) => ['admin', 'society', societyId, 'financial-summary'] as const;
export const flatBillsKey = (flatId: string) => ['admin', 'flat', flatId, 'bills'] as const;
