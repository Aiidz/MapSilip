'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { profilePathForArea } from '../lib/navigation.mjs';
import { ProfilePhoto } from './ProfilePhoto';

type Area = 'tenant' | 'management' | 'caretaker';

const roleName: Record<Area, string> = {
  tenant: 'Tenant',
  management: 'Administrator',
  caretaker: 'Caretaker',
};

export function SidebarProfileCard({ area }: { area: Area }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState('');
  const [desktop, setDesktop] = useState(false);
  const requestVersion = useRef(0);
  const href = profilePathForArea(area);
  const name = displayName || roleName[area];
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1000px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const controller = new AbortController();
    let active = true;
    async function loadProfile() {
      const version = ++requestVersion.current;
      try {
        const response = await fetch('/api/profile', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const profile = await response.json();
        if (active && version === requestVersion.current) {
          setDisplayName(typeof profile.display_name === 'string' ? profile.display_name.trim() : '');
        }
      } catch { /* The role label remains available if profile data is unavailable. */ }
    }
    void loadProfile();
    window.addEventListener('mapsilip-profile-updated', loadProfile);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('mapsilip-profile-updated', loadProfile);
    };
  }, [desktop]);

  return <Link className="sidebar-profile-card" href={href} aria-label={`Open profile for ${name}`}
    aria-current={pathname === href ? 'page' : undefined}>
    {desktop ? <ProfilePhoto className="sidebar-profile-card__avatar" fallback={initials} />
      : <span className="sidebar-profile-card__avatar" aria-hidden="true">{initials}</span>}
    <span className="sidebar-profile-card__greeting">Welcome Back!</span>
    <strong className="sidebar-profile-card__name">{name}</strong>
  </Link>;
}
