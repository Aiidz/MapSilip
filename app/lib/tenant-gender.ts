export function genderLabel(gender: unknown) {
  return gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Not recorded';
}

export function matchesRoomPolicy(policy: unknown, gender: unknown) {
  return policy === 'any' || ((gender === 'male' || gender === 'female') && policy === gender);
}
