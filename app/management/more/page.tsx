import {
  PageHeader,
  Panel,
  PreviewCard,
} from "../../components/ui";

const links = [
  { title: "Analytics", description: "Review current and upcoming contracts.", href: "/management/analytics", icon: "analytics" as const },
  { title: "Settings", description: "Notifications and backups.", href: "/management/settings", icon: "settings" as const },
  { title: "Payment Settings", description: "Manage the dormitory’s GCash QR.", href: "/management/settings/payments", icon: "wallet" as const },
  { title: "Concerns & Suggestions", description: "Review resident feedback and respond.", href: "/management/concerns", icon: "sparkles" as const },
  {
    title: "Maintenance",
    description: "Review and update maintenance requests.",
    href: "/management/maintenance",
    icon: "wrench" as const,
  },
  {
    title: "Visitors",
    description: "Review planned resident visits.",
    href: "/management/visitors",
    icon: "calendar" as const,
  },
  {
    title: "Notifications",
    description: "Read account and operational updates.",
    href: "/management/notifications",
    icon: "bell" as const,
  },
];

export default function ManagementMorePage() {
  return (
    <>
      <PageHeader title="More workspace views" />
      <Panel
        title="Other sections"
        description="More tools for everyday operations."
        icon="more"
      >
        <div className="preview-card-list">
          {links.map((item) => <PreviewCard key={item.href} {...item} />)}
        </div>
      </Panel>
    </>
  );
}
