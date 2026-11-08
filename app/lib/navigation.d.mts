export function isNavigationItemActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean;

export function profilePathForArea(
  area: 'tenant' | 'management' | 'caretaker',
): string;
