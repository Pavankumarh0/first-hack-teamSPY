import raw from '@shared/schema/constants.json';

// Shared vocabulary (firebase/schema/constants.json): the same lists the
// Flutter app and the security rules use.
export const C = raw;

export type Role = 'student' | 'staff' | 'club_manager' | 'admin';
export type ReportStatus = 'submitted' | 'acknowledged' | 'assigned' | 'in_progress' | 'resolved' | 'rejected';
export type PostStatus = 'visible' | 'hidden' | 'removed' | 'deleted';
export type EventStatus = 'draft' | 'published' | 'cancelled';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type DeepLinkType = 'location' | 'building' | 'event' | 'club' | 'notice' | 'route';

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  staff: 'Staff',
  club_manager: 'Club manager',
  admin: 'Administrator',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  electrical: 'Electrical',
  plumbing: 'Plumbing / water',
  cleanliness: 'Cleanliness',
  furniture: 'Furniture',
  it_wifi: 'IT / Wi-Fi',
  hostel: 'Hostel',
  safety: 'Safety',
  other: 'Other',
};

export const POST_CATEGORY_LABELS: Record<string, string> = {
  hostel_food: 'Hostel food',
  cleanliness: 'Cleanliness',
  wifi: 'Wi-Fi',
  transport: 'Transport',
  library: 'Library',
  canteen: 'Canteen',
  academics: 'Academics',
  clubs_events: 'Clubs & events',
  facilities: 'Facilities',
  other: 'Other',
};

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  classroom: 'Classroom',
  lab: 'Lab',
  library: 'Library',
  canteen: 'Canteen',
  hostel: 'Hostel',
  club: 'Club room',
  office: 'Office',
  seminar_hall: 'Hall',
  facility: 'Facility',
  kiosk: 'Kiosk',
  other: 'Other',
};

export const BUILDING_CATEGORY_LABELS: Record<string, string> = {
  academic: 'Academic',
  administrative: 'Administration',
  library: 'Library',
  food: 'Food',
  hostel: 'Hostel',
  sports: 'Sports',
  medical: 'Medical',
  event: 'Events',
  parking: 'Parking',
  other: 'Other',
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '';
  return map[key] ?? key.replace(/_/g, ' ');
}
