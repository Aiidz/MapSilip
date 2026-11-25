import { Icon } from './Icon';

export function FilterDropdown({ label, icon, value, options, onChange }: {
  label: string;
  icon: 'calendar' | 'filter' | 'users';
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const selected = options.find(option => option.value === value);

  return <details className="payment-dropdown">
    <summary aria-label={`${label}: ${selected?.label ?? ''}`}>
      <Icon name={icon} /><span>{selected?.label}</span><Icon name="chevron" />
    </summary>
    <div className="payment-dropdown__menu">
      {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value}
        onClick={event => {
          const dropdown = event.currentTarget.closest('details');
          dropdown?.removeAttribute('open');
          dropdown?.querySelector('summary')?.focus();
          onChange(option.value);
        }}>
        <Icon name={icon} /><span>{option.label}</span>
        {value === option.value && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>
  </details>;
}
