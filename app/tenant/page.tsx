import Link from "next/link";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/ui";

const shortcuts = [
  { title: "My Details", text: "Personal and stay information", href: "/tenant/details", icon: "users" as const },
  { title: "Payments", text: "Billing information and history", href: "/tenant/payments", icon: "wallet" as const },
  { title: "Maintenance", text: "Requests and updates", href: "/tenant/maintenance", icon: "wrench" as const },
  { title: "Concerns & Suggestions", text: "Share feedback with the team", href: "/tenant/concerns", icon: "sparkles" as const },
];

export default function TenantHomePage() {
  return <div className="tenant-home">
    <PageHeader title="Home" description="Welcome back. Here’s a quick look at your stay." />
    <section className="tenant-home-summary">
      <div className="tenant-home-summary__intro"><span className="tenant-summary-icon"><Icon name="building" /></span><div><p className="tenant-section-label">Your stay</p><h2>Room and rent details</h2><p>Your room and billing information will appear here.</p></div></div>
      <div className="tenant-home-summary__facts"><div><span>Room</span><strong>—</strong></div><div><span>Rent</span><strong>—</strong></div></div>
    </section>
    <section className="tenant-home-shortcuts" aria-labelledby="tenant-shortcuts-title">
      <div className="tenant-section-heading"><div><h2 id="tenant-shortcuts-title">Quick Access</h2><p>Common details and services.</p></div></div>
      <div className="tenant-shortcut-grid">{shortcuts.map((item) => <Link className="tenant-shortcut" href={item.href} key={item.href}><span className="tenant-summary-icon"><Icon name={item.icon} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><Icon name="chevron" className="tenant-shortcut__chevron" /></Link>)}</div>
    </section>
    <section className="tenant-recent">
      <div className="tenant-section-heading"><div><h2>Recent Notifications</h2><p>Your latest account updates.</p></div><Link href="/tenant/notifications">View all <Icon name="arrow" /></Link></div>
      <div className="tenant-empty-inline"><span className="tenant-summary-icon"><Icon name="bell" /></span><div><strong>No notifications to display</strong><p>New account updates will appear here.</p></div></div>
    </section>
  </div>;
}
