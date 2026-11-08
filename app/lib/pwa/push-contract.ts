export const pushCategories = ['payments', 'maintenance', 'accounts', 'visitors', 'concerns'] as const;
export type PushCategory = typeof pushCategories[number];
export type PushPreferences = { enabled: boolean; categories: Record<PushCategory, boolean> };
export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPreferenceState = { available: boolean; initialized: boolean; preferences: PushPreferences };
export const defaultPushPreferences: PushPreferences = {
  enabled: false, categories: { payments: true, maintenance: true, accounts: true, visitors: true, concerns: false },
};
export const categoryLabels: Record<PushCategory, string> = {
  payments: 'Payments', maintenance: 'Maintenance', accounts: 'Account and room updates', visitors: 'Visitors', concerns: 'Concerns',
};
