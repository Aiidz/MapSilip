import { redirect } from 'next/navigation';

export default function ManagementTenantsPage() { redirect('/management?accessRequests=1'); }
