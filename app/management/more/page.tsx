import {
  PageHeader,
  Panel,
  PreviewCard,
} from "../../components/ui";

const links = [
  { title: "Concerns & Suggestions", description: "Review resident feedback and respond.", href: "/management/concerns", icon: "sparkles" as const },
  { title: "Analytics", description: "Review maintenance metrics and trends.", href: "/management/analytics", icon: "dashboard" as const },
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
      <PageHeader
        title="More workspace views"
        description="The everyday tools, kept easy to find."
      />
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
