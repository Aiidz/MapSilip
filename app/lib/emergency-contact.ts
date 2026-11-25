export const emergencyContactLimit = 160;

export function parseEmergencyContact(value: string) {
  // Existing contacts were entered as free text. Keep ambiguous entries intact.
  const field = /(?:"((?:[^"]|"")*)"|([^,"]*))/;
  const fields = value.match(new RegExp(`^${field.source},\\s*${field.source},\\s*${field.source}$`));
  if (!fields) return { name: value, relationship: '', phone: '' };
  const readField = (index: number) => fields[index]?.replaceAll('""', '"') ?? fields[index + 1].trim();
  return { name: readField(1), relationship: readField(3), phone: readField(5) };
}

export function formatEmergencyContact(contact: ReturnType<typeof parseEmergencyContact>) {
  const fields = [contact.name, contact.relationship, contact.phone].map(field => field.trim());
  if (fields.every(field => !field)) return '';
  return fields.map(field => /[",]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field).join(', ');
}
