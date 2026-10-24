import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "wallet"
  | "calendar"
  | "wrench"
  | "more"
  | "building"
  | "users"
  | "bell"
  | "arrow"
  | "sparkles"
  | "clock"
  | "shield"
  | "chevron"
  | "search"
  | "moon"
  | "sun"
  | "download"
  | "dashboard"
  | "map"
  | "thermometer"
  | "receipt"
  | "fileSearch"
  | "filter"
  | "logout"
  | "eye"
  | "eyeOff";

export function Icon(
  { name, ...props }: SVGProps<SVGSVGElement> & { name: IconName },
) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 9h18M16 14h2" />
        <path d="M7 5V3h10v2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h3" />
      </>
    ),
    wrench: (
      <>
        <path d="M14.5 6.5a5 5 0 0 0-6.8 6.8L3 18l3 3 4.7-4.7a5 5 0 0 0 6.8-6.8L14 12l-2-2z" />
        <path d="m16 4 4 4" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V5l8-2v18M12 9h8v12M2 21h20" />
        <path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.2 2.3-5 6-5s6 1.8 6 5M16 5.5a3 3 0 0 1 0 5.8M18 15c2 .5 3 2 3 4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    arrow: (
      <>
        <path d="M7 17 17 7M8 7h9v9" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v3h14v-3" /></>,
    dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    map: <><path d="m3 6 5.5-2 7 2L21 4v14l-5.5 2-7-2L3 20V6Z" /><path d="M8.5 4v14m7-12v14" /></>,
    thermometer: <><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" /><path d="M12 11v7" /></>,
    receipt: <><path d="M5 3h14v18l-2.5-1.8L14 21l-2-1.8L9.5 21 7 19.2 5 21V3Z" /><path d="M9 8h6m-6 4h6" /></>,
    fileSearch: <><path d="M7 3h7l5 5v5" /><path d="M7 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" /><path d="M14 3v5h5" /><circle cx="16.5" cy="17" r="3.5" /><path d="m19 19.5 2 2" /></>,
    filter: <><path d="M4 5h16l-6.5 7.5v5l-3 1.5v-6.5L4 5Z" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.4 0 10 6 10 6a16 16 0 0 1-3.1 3.5M6.2 6.3C3.5 8.1 2 12 2 12s3.6 6 10 6c1.1 0 2.1-.2 3-.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export function MapSilipMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 40 40"
      fill="none"
    >
      <path
        d="M20 37S5 23.6 5 14.4a15 15 0 1 1 30 0C35 23.6 20 37 20 37Z"
        fill="var(--brand)"
      />
      <path
        d="m20 25.7-7.2-6.8a4.8 4.8 0 0 1 6.8-6.8l.4.4.4-.4a4.8 4.8 0 0 1 6.8 6.8L20 25.7Z"
        fill="white"
      />
    </svg>
  );
}
