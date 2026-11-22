import { emergencyContactLimit, type parseEmergencyContact } from '../lib/emergency-contact';

type Contact = ReturnType<typeof parseEmergencyContact>;

export function EmergencyContactFields({ contact, onChange, readOnly, disabled, required, tooLong, id }: {
  contact: Contact;
  onChange: (contact: Contact) => void;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  tooLong?: boolean;
  id?: string;
}) {
  return <fieldset id={id} className="emergency-contact-fields" disabled={disabled}>
    <legend>Emergency contact</legend>
    <div className="emergency-contact-grid">
      <label className="emergency-contact-name">Full name
        <input value={contact.name} maxLength={emergencyContactLimit} readOnly={readOnly} required={required}
          onChange={event => onChange({ ...contact, name: event.target.value })} />
      </label>
      <label>Relationship
        <input value={contact.relationship} maxLength={emergencyContactLimit} readOnly={readOnly} required={required}
          onChange={event => onChange({ ...contact, relationship: event.target.value })} />
      </label>
      <label>Phone number
        <input type="tel" value={contact.phone} maxLength={emergencyContactLimit} readOnly={readOnly} required={required}
          onChange={event => onChange({ ...contact, phone: event.target.value })} />
      </label>
    </div>
    {tooLong && !readOnly && <p role="alert">Shorten the contact details to save.</p>}
  </fieldset>;
}
