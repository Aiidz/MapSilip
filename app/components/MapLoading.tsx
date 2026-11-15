import { Icon } from './Icon';

export function MapLoading({ label = 'Loading dormitory view…' }: { label?: string }) {
  return <div className="map-loading map-loading--house" role="status" aria-label={label} aria-busy="true">
    <span aria-hidden="true"><Icon name="home" /></span>
  </div>;
}
