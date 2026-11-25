'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FilterDropdown } from '../../components/FilterDropdown';
import { Icon } from '../../components/Icon';

export function AuditFilters({ search, category, role, categories }: {
  search: string;
  category: string;
  role: string;
  categories: { value: string; label: string }[];
}) {
  const router = useRouter();

  const searchInput = useRef<HTMLInputElement>(null);

  function apply(nextCategory: string, nextRole: string) {
    const params = new URLSearchParams();
    const query = searchInput.current?.value.trim();
    if (query) params.set('search', query);
    if (nextCategory) params.set('category', nextCategory);
    if (nextRole) params.set('role', nextRole);
    router.replace(params.size ? `/management/audit?${params}` : '/management/audit', { scroll: false });
  }

  return <form className="audit-trail-search" action="/management/audit" onSubmit={event => {
    event.preventDefault();
    apply(category, role);
  }}>
    <div className="audit-trail-search-field">
      <Icon name="search" />
      <input ref={searchInput} type="search" name="search" aria-label="Search actions" defaultValue={search} maxLength={80}
        placeholder="Search actions" enterKeyHint="search" />
    </div>
    <FilterDropdown label="Category" icon="filter" value={category}
      options={[{ value: '', label: 'All categories' }, ...categories]} onChange={value => apply(value, role)} />
    <FilterDropdown label="User type" icon="users" value={role}
      options={[
        { value: '', label: 'All users' },
        { value: 'owner', label: 'Admin' },
        { value: 'caretaker', label: 'Caretaker' },
        { value: 'tenant', label: 'Tenant' },
      ]} onChange={value => apply(category, value)} />
    <button type="submit" hidden>Search</button>
  </form>;
}
