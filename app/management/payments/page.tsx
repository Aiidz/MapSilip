import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/ui";

const summaries = [
  { title: "Verified This Month", description: "No data available", highlight: true },
  { title: "Collection Rate", description: "No data available" },
  { title: "For Verification", description: "No data available" },
  { title: "Overdue Accounts", description: "No data available" },
];

export default function ManagementPaymentsPage() {
  return (
    <div className="management-payments">
      <PageHeader
        title="Payment Records"
        description="Review and verify tenant payment submissions."
        action={(
          <button className="dashboard-export payment-export" type="button" disabled>
            <Icon name="download" />
            Export Report
          </button>
        )}
      />

      <section className="payment-summary" aria-label="Payment summary">
        {summaries.map(({ title, description, highlight }) => (
          <article
            className={`payment-summary__card${highlight ? " payment-summary__card--highlight" : ""}`}
            key={title}
          >
            <span>{title}</span>
            <strong aria-label="Unavailable">—</strong>
            <small>{description}</small>
            <span className="payment-summary__mark" aria-hidden="true"><Icon name="arrow" /></span>
          </article>
        ))}
      </section>

      <div className="payment-board">
        <div className="payment-list-column">
          <div className="payment-filters" aria-label="Payment record filters">
            <label className="payment-filter payment-filter--search">
              <Icon name="search" />
              <input aria-label="Search payments" placeholder="Search room, tenant..." disabled />
            </label>
            <label className="payment-filter">
              <Icon name="calendar" />
              <select aria-label="Billing period" disabled defaultValue="">
                <option value="">All Billing Periods</option>
              </select>
            </label>
            <label className="payment-filter">
              <Icon name="filter" />
              <select aria-label="Payment status" disabled defaultValue="all">
                <option value="all">All Statuses</option>
              </select>
            </label>
          </div>

          <section className="payment-table-panel" aria-label="Payment submissions">
            <div className="payment-table-scroll">
              <table className="payment-table">
                <thead>
                  <tr>
                    <th scope="col">Tenant / Room</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4}>
                      <div className="payment-empty">
                        <span className="payment-empty__icon"><Icon name="fileSearch" /></span>
                        <strong>No payment submissions to display</strong>
                        <p>Payment records will appear here when available.</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="payment-details-panel" aria-labelledby="payment-details-title">
          <h2 id="payment-details-title">Payment Details</h2>
          <div className="payment-details-empty">
            <span className="payment-details-empty__icon"><Icon name="fileSearch" /></span>
            <strong>No Payment Selected</strong>
            <p>Select a payment record to view details and review payment proof.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
