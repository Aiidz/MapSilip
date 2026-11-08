import { ManagementPaymentsWorkspace } from '../../components/ManagementPaymentsWorkspace';

export default async function ManagementPaymentsPage({ searchParams }: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  const { search } = await searchParams;
  const initialSearch = Array.isArray(search) ? search[0] ?? '' : search ?? '';
  return <ManagementPaymentsWorkspace initialSearch={initialSearch} />;
}
