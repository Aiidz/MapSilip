"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { EmptyState, PageHeader, Panel } from "./ui";

type WorkspaceKind = "payments" | "maintenance" | "concerns";

const config = {
  payments: {
    title: "Payments",
    description: "Review payment information and submission history.",
    action: "Submit Payment Proof",
    section: "Payment History",
    empty: "No payment records to display",
    emptyDescription: "Your payment records will appear here when available.",
    filters: ["All", "Under Review", "Verified", "Rejected"],
  },
  maintenance: {
    title: "Maintenance",
    description: "View and share maintenance concerns for your room.",
    action: "Submit a Request",
    section: "My Maintenance Requests",
    empty: "No maintenance requests to display",
    emptyDescription: "Your maintenance requests and updates will appear here.",
    filters: ["All", "Pending", "In Progress", "Resolved"],
  },
  concerns: {
    title: "Concerns & Suggestions",
    description: "Share a concern or suggestion with the dormitory team.",
    action: "Share a Concern",
    section: "My Submissions",
    empty: "No submissions to display",
    emptyDescription: "Your concerns and suggestions will appear here.",
    filters: ["All", "Pending", "In Progress", "Resolved"],
  },
} satisfies Record<WorkspaceKind, {
  title: string;
  description: string;
  action: string;
  section: string;
  empty: string;
  emptyDescription: string;
  filters: string[];
}>;

function LocalForm({ kind, onClose }: { kind: WorkspaceKind; onClose: () => void }) {
  const isPayment = kind === "payments";
  const isMaintenance = kind === "maintenance";
  return (
    <section className="tenant-form-panel" aria-labelledby="tenant-form-title">
      <div className="tenant-form-heading">
        <div>
          <h2 id="tenant-form-title">{isPayment ? "Payment Proof" : isMaintenance ? "Maintenance Request" : "New Concern or Suggestion"}</h2>
          <p>Complete the details below.</p>
        </div>
        <button className="tenant-text-button" type="button" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={(event) => event.preventDefault()}>
        {isPayment ? (
          <>
            <label>Payment period<input placeholder="Not available" disabled /></label>
            <div className="tenant-form-row">
              <label>Amount<input inputMode="decimal" placeholder="Enter amount" /></label>
              <label>Payment date<input type="date" /></label>
            </div>
            <label>Payment method<select defaultValue=""><option value="" disabled>Select a method</option><option>GCash</option><option>Bank transfer</option></select></label>
            <label>Reference number<input placeholder="Enter reference number" /></label>
            <label>Receipt or proof<input type="file" accept="image/*,.pdf" /></label>
          </>
        ) : (
          <>
            <label>{isMaintenance ? "Category" : "Type"}<select defaultValue="" disabled><option value="">Not available</option></select></label>
            {isMaintenance && <label>Room location<input placeholder="Not available" disabled /></label>}
            <label>Description<textarea rows={5} placeholder="Describe your concern" /></label>
            {isMaintenance && <label>Photo or document<input type="file" accept="image/*,.pdf" /></label>}
          </>
        )}
        <button className="button button--primary tenant-disabled-action" type="submit" disabled>Submit</button>
      </form>
    </section>
  );
}

export function TenantWorkspace({ kind }: { kind: WorkspaceKind }) {
  const item = config[kind];
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("All");
  return (
    <div className={`tenant-workspace tenant-workspace--${kind}`}>
      <PageHeader
        title={item.title}
        description={item.description}
      />
      {showForm && <LocalForm kind={kind} onClose={() => setShowForm(false)} />}
      {kind === "payments" && (
        <section className="tenant-payment-overview" aria-labelledby="next-payment-title">
          <div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="wallet" /></span><div><p className="tenant-section-label">Next rent payment</p><h2 id="next-payment-title">—</h2><p>Billing details are not available.</p></div></div>
          <button className="tenant-hero-action" type="button" onClick={() => setShowForm((value) => !value)} aria-expanded={showForm}>{item.action}</button>
        </section>
      )}
      {kind === "maintenance" && (
        <section className="tenant-room-summary">
          <div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="wrench" /></span><div><p className="tenant-section-label">Your room</p><h2>Room information is not available.</h2><p>Share a maintenance request when needed.</p></div></div>
          <button className="tenant-hero-action" type="button" onClick={() => setShowForm((value) => !value)} aria-expanded={showForm}>{item.action}</button>
        </section>
      )}
      {kind === "concerns" && (
        <section className="tenant-share-panel">
          <div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="sparkles" /></span><div><h2>Have something to share?</h2><p>Your feedback helps improve dormitory living.</p></div></div>
          <button className="tenant-hero-action" type="button" onClick={() => setShowForm((value) => !value)} aria-expanded={showForm}>{item.action}</button>
        </section>
      )}
      <div className="tenant-record-layout">
        <Panel title={item.section} description={kind === "payments" ? "Your payment submissions and their status." : "Updates about your submissions."} icon={kind === "payments" ? "wallet" : kind === "maintenance" ? "wrench" : "sparkles"}>
          <div className="tenant-filter-row" role="group" aria-label={`${item.section} filters`}>
            {item.filters.map((value) => <button key={value} type="button" className={`tenant-filter${filter === value ? " is-active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
          </div>
          <EmptyState title={item.empty} description={item.emptyDescription} icon={kind === "payments" ? "receipt" : kind === "maintenance" ? "wrench" : "sparkles"} />
        </Panel>
        <Panel title={kind === "payments" ? "Payment Details" : "Submission Details"} description="Select a record to view its details." icon="fileSearch" className="tenant-detail-panel">
          <EmptyState title="No item selected" description="Details will appear here when a record is available." icon="fileSearch" />
        </Panel>
      </div>
      {kind === "payments" && <p className="tenant-privacy-note">Payment submissions and receipts are private to your account.</p>}
    </div>
  );
}

export function TenantNotifications() {
  const categories = ["All", "Payments", "Maintenance", "Contract", "Concern"];
  const [selected, setSelected] = useState("All");
  return <div className="tenant-workspace"><PageHeader title="Notifications" description="Updates related to your account and stay." />
    <Panel title="Recent Notifications" description="Your latest account updates." icon="bell">
      <div className="tenant-notification-tools">
        <label className="tenant-search"><Icon name="search" /><span className="sr-only">Search notifications</span><input type="search" placeholder="Search notifications" /></label>
        <div className="tenant-filter-row" role="group" aria-label="Notification categories">{categories.map((category) => <button className={`tenant-filter${selected === category ? " is-active" : ""}`} aria-pressed={selected === category} type="button" key={category} onClick={() => setSelected(category)}>{category}</button>)}</div>
      </div>
      <EmptyState title="No notifications to display" description="New account updates will appear here." icon="bell" />
    </Panel>
  </div>;
}
