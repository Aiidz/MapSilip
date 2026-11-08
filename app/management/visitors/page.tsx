import { OperationalWorkspace } from '../../components/OperationalWorkspace';

export default function ManagementVisitorsPage() {
  return <OperationalWorkspace title="Visitors" description="Review planned resident visits."
    role="owner" resources={['visits']} />;
}
