import Image from 'next/image';
const artwork = ['dorm-editorial.webp', 'dashboard-editorial.webp', 'notifications-editorial.webp', 'install-editorial.webp', 'profile-editorial.webp'] as const;
export function OnboardingArtwork({ scene = 0, priority = false }: { scene?: number; priority?: boolean }) {
  return <div className="onboarding-artwork"><Image src={`/onboarding/${artwork[scene] ?? artwork[0]}`} alt="" width={640} height={560} unoptimized loading={priority ? 'eager' : 'lazy'} draggable={false} /></div>;
}
