import Image from 'next/image';
const artwork = ['dorm', 'dashboard', 'notifications', 'install'] as const;
export function OnboardingArtwork({ scene = 0, priority = false }: { scene?: number; priority?: boolean }) {
  return <div className="onboarding-artwork"><Image src={`/onboarding/${artwork[scene] ?? artwork[0]}.webp`} alt="" width={900} height={900} unoptimized loading={priority ? 'eager' : 'lazy'} draggable={false} /></div>;
}
