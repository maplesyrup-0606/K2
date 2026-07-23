export const HOLD_COLORS = [
  { hex: '#EF4444', name: 'Red' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EAB308', name: 'Yellow' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#1C1917', name: 'Black' },
  { hex: '#F5F5F4', name: 'White' },
  { hex: '#6B7280', name: 'Gray' },
]

// Single source of truth for grade value bounds — must stay in sync with
// GRADE_RANGES in backend/app.py, which independently validates the same bounds.
export const GRADE_RANGES = {
  v: { min: 0, max: 12 },
  comp: { min: 1, max: 4 },
}

export const OUTCOMES = [
  ['sent', 'Sent'],
  ['projecting', 'Project-ing'],
  ['gave_up', 'Gave up'],
]

export const ATTEMPTS = ['1', '2', '3-4', '5-9', '10+']
