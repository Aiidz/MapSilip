"use client";

import { useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { PageHeader } from "./ui";

type View = "map" | "tenants";

const summaries = [
  { title: "Total Slots", detail: "Total tenant capacity", highlight: true },
  { title: "Occupied Slots", detail: "Slots assigned to tenants" },
  { title: "Available Slots", detail: "Slots open for assignment" },
  { title: "Tenants to Assign", detail: "Awaiting room assignment" },
];

export function RoomManagementWorkspace() {
  const [view, setView] = useState<View>("map");
  const [floor, setFloor] = useState("1st Floor");

  function handleViewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    setView(nextTab.id === "room-map-tab" ? "map" : "tenants");
  }

  return (
    <div className="room-management">
      <PageHeader
        title="Room Management"
        description="Manage room occupancy, tenant assignments, and room information."
        action={(
          <button className="dashboard-export room-management__export" type="button" disabled>
            <Icon name="download" />
            Export Report
          </button>
        )}
      />

      <section className="room-summary" aria-label="Room occupancy summary">
        {summaries.map(({ title, detail, highlight }) => (
          <article
            className={`room-summary__card${highlight ? " room-summary__card--highlight" : ""}`}
            key={title}
          >
            <span className="room-summary__title">{title}</span>
            <strong aria-label="Unavailable">—</strong>
            <small>{detail}</small>
            <span className="room-summary__mark" aria-hidden="true"><Icon name="arrow" /></span>
          </article>
        ))}
      </section>

      <div className="room-tabs" role="tablist" aria-label="Room management views" onKeyDown={handleViewKeyDown}>
        <button
          className={view === "map" ? "is-active" : ""}
          type="button"
          role="tab"
          id="room-map-tab"
          aria-selected={view === "map"}
          aria-controls="room-map-panel"
          onClick={() => setView("map")}
        >
          <Icon name="map" />
          2D Map
        </button>
        <button
          className={view === "tenants" ? "is-active" : ""}
          type="button"
          role="tab"
          id="room-tenants-tab"
          aria-selected={view === "tenants"}
          aria-controls="room-tenants-panel"
          onClick={() => setView("tenants")}
        >
          <Icon name="users" />
          Tenant List
        </button>
      </div>

      <section className="room-workspace" id="room-map-panel" role="tabpanel" aria-labelledby="room-map-tab" hidden={view !== "map"}>
          <div className="room-map-panel">
            <div className="room-panel-heading">
              <div className="room-floor-tabs" aria-label="Floor selection">
                {["1st Floor", "2nd Floor"].map((name) => (
                  <button
                    className={floor === name ? "is-active" : ""}
                    type="button"
                    aria-pressed={floor === name}
                    key={name}
                    onClick={() => setFloor(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="room-map-canvas">
              <div className="room-map-empty">
                <Icon name="map" />
                <span>2D Interactive Map</span>
                <p>Room layout for {floor} is not available.</p>
              </div>
            </div>
          </div>

          <section className="room-details-panel" aria-labelledby="room-details-title">
            <h2 id="room-details-title">Room Details</h2>
            <div className="room-details-empty">
              <span className="room-details-empty__icon"><Icon name="fileSearch" /></span>
              <strong>No Room Selected</strong>
              <p>Select a room on the floor plan to view its occupancy, capacity, and assigned tenants.</p>
            </div>
          </section>
      </section>
      <section className="tenant-list-workspace" id="room-tenants-panel" role="tabpanel" aria-labelledby="room-tenants-tab" hidden={view !== "tenants"}>
          <aside className="tenant-list-panel" aria-label="Tenant list filters">
            <label className="tenant-list-filter">
              <Icon name="users" />
              <select aria-label="Tenant filter" disabled defaultValue="all">
                <option value="all">All Tenants</option>
              </select>
            </label>
            <label className="tenant-list-search">
              <Icon name="search" />
              <input aria-label="Search tenants" placeholder="Search tenant..." disabled />
            </label>
            <p className="tenant-list-empty">No tenant records to display.</p>
          </aside>
          <section className="tenant-details-panel" aria-labelledby="tenant-details-title">
            <h2 id="tenant-details-title">Tenant Details</h2>
            <div className="room-details-empty">
              <span className="room-details-empty__icon"><Icon name="fileSearch" /></span>
              <strong>No Tenant Selected</strong>
              <p>Select a tenant from the list to view their room record.</p>
            </div>
          </section>
      </section>
    </div>
  );
}
