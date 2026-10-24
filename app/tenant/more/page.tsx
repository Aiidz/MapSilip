import {
  PageHeader,
  Panel,
  PreviewCard,
} from "../../components/ui";

const links = [
  {
    title: "My Details",
    description: "Personal information and details about your stay.",
    href: "/tenant/details",
    icon: "users" as const,
  },
  {
    title: "Profile details",
    description: "A home for contact and account information.",
    href: "/tenant/profile",
    icon: "users" as const,
  },
  {
    title: "Notifications",
    description: "Updates related to your account and stay.",
    href: "/tenant/notifications",
    icon: "bell" as const,
  },
  {
    title: "Visitors",
    description: "Planned visitor information.",
    href: "/tenant/visitors",
    icon: "calendar" as const,
  },
  {
    title: "Notification settings",
    description: "A place for optional app preferences.",
    href: "/tenant/preferences",
    icon: "bell" as const,
  },
  {
    title: "Management workspace",
    description: "Dormitory operations and records.",
    href: "/management",
    icon: "building" as const,
  },
];

export default function TenantMorePage() {
  return (
    <>
      <PageHeader
        title="More"
        description="The useful details that don’t need to take up the whole day."
      />
      <Panel
        title="Your settings"
        description="A starting point for account and app preferences."
        icon="more"
      >
        <div className="preview-card-list">
          {links.map((item) => <PreviewCard key={item.href} {...item} />)}
        </div>
      </Panel>
    </>
  );
}
