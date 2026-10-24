import { EmptyState, PageHeader, Panel } from "../../components/ui";
import { VisitorFormPreview } from "../../components/VisitorFormPreview";

export default function TenantVisitorsPage() {
  return (
    <>
      <PageHeader
        title="Visitors"
        description="A simple place for planned visit details."
      />
      <div className="feature-layout">
        <Panel
          title="Planned visits"
          description="Your upcoming and past visit details."
          icon="calendar"
        >
          <EmptyState
            title="No planned visits to display"
            description="Your planned visits will appear here."
            icon="calendar"
          />
        </Panel>
        <VisitorFormPreview />
      </div>
    </>
  );
}
