import {
  PageHeader,
  Panel,
  PreviewCard,
} from "../../components/ui";

const links = [
  {
    title: "Maintenance",
    description: "A responsive request queue layout.",
    href: "/management/maintenance",
    icon: "wrench" as const,
  },
  {
    title: "Visitors",
    description: "A list of planned visits, without assumed approval rules.",
    href: "/management/visitors",
    icon: "calendar" as const,
  },
  {
    title: "Notifications",
    description: "A place for durable in-app updates.",
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
