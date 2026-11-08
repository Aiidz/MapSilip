export function isNavigationItemActive(pathname, href, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function profilePathForArea(area) {
  if (area === "tenant") return "/tenant/profile";
  if (area === "caretaker") return "/caretaker/profile";
  return "/management/profile";
}
