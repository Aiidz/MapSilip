import { Icon } from "../components/Icon";
import { PageHeader } from "../components/ui";

const summaryItems = [
  { label: "Total Rent Income", kind: "financial" },
  { label: "Occupied Units", kind: "standard" },
  { label: "Vacant Units", kind: "standard" },
  { label: "Under Maintenance", kind: "standard" },
] as const;

function DashboardChart({
  title,
  icon,
}: {
  title: string;
  icon: "wrench" | "wallet";
}) {
  return (
    <section className="dashboard-panel dashboard-chart" aria-label={title}>
      <h2>{title}</h2>
      <div className="dashboard-chart__empty">
        <span className="dashboard-chart__icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
        <p>Chart data is not available.</p>
      </div>
    </section>
  );
}

export default function ManagementOverviewPage() {
  return (
    <div className="management-dashboard">
      <PageHeader
        title="Dashboard"
        description="Plan, prioritize, and accomplish your property tasks with ease."
        action={(
          <button
            className="dashboard-export"
            type="button"
            disabled
          >
            <Icon name="download" />
            Export Data
          </button>
        )}
      />

      <section className="dashboard-summary" aria-label="Workspace summary">
        {summaryItems.map((item) => (
          <article
            className={`dashboard-summary__item${item.kind === "financial" ? " dashboard-summary__item--financial" : ""}`}
            key={item.label}
          >
            <h2>{item.label}</h2>
            <span className="dashboard-summary__value" aria-label="Unavailable">—</span>
            <p>No data available</p>
            <span className="dashboard-summary__mark" aria-hidden="true">
              <Icon name="arrow" />
            </span>
          </article>
        ))}
      </section>

      <div className="dashboard-charts">
        <DashboardChart title="Weekly Maintenance Activity" icon="wrench" />
        <DashboardChart title="Payment Overview" icon="wallet" />
      </div>

      <section className="dashboard-panel dashboard-actions" aria-labelledby="dashboard-actions-title">
        <div className="dashboard-actions__header">
          <h2 id="dashboard-actions-title">Action Required</h2>
          <button type="button" disabled>
            View All <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="dashboard-actions__empty">Action items will appear here when available.</p>
      </section>
    </div>
  );
}
