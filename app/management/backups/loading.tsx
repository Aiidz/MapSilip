import { PageHeader, Panel } from '../../components/ui';
import styles from './backups.module.css';

export default function LoadingBackupManagement() {
  return <main className={`management-dashboard ${styles.workspace}`} aria-busy="true">
    <PageHeader title="Backup Management" />
    <div className={styles.topGrid} role="status">
      <Panel title="Google Drive"><p className={styles.hint}>Loading connection…</p></Panel>
      <Panel title="Backup execution"><p className={styles.hint}>Loading worker status…</p></Panel>
    </div>
  </main>;
}
