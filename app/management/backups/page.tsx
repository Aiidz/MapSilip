import { redirect } from 'next/navigation';

export default async function BackupManagementPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const { drive } = await searchParams;
  const query = new URLSearchParams({ section: 'backups' });
  if (typeof drive === 'string') query.set('drive', drive);
  redirect('/management/settings?' + query);
}
