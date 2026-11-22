import { redirect } from 'next/navigation';

export default function PaymentSettingsPage() {
  redirect('/management/settings?section=payments');
}
