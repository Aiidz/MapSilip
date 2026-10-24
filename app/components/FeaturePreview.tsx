import type { IconName } from "./Icon";
import { EmptyState, PageHeader, Panel } from "./ui";

export function FeaturePreview({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  sectionTitle = "Your overview",
}: {
  title: string;
  description: string;
  icon: IconName;
  emptyTitle: string;
  emptyDescription: string;
  sectionTitle?: string;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
      />
      <Panel title={sectionTitle} icon={icon}>
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={icon}
        />
      </Panel>
    </>
  );
}
