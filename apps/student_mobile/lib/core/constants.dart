/// Shared vocabulary. Mirrors firebase/schema/constants.json; the unit test
/// test/constants_test.dart fails if the two drift apart.
class C {
  static const roles = ['student', 'staff', 'club_manager', 'admin'];
  static const usernamePattern = r'^[a-z][a-z0-9._]{2,23}$';
  static const usernameMin = 3;
  static const usernameMax = 24;
  static const reservedUsernames = [
    'admin', 'administrator', 'root', 'support', 'staff', 'campusmithra', 'mithra', 'kiosk', 'system',
    'moderator', 'help', 'official', 'null', 'undefined',
  ];
  static const identityDomain = 'users.campus-mithra.invalid';
  static const passwordMinLength = 8;

  static const reportCategories = ['electrical', 'plumbing', 'cleanliness', 'furniture', 'it_wifi', 'hostel', 'safety', 'other'];
  static const reportStatuses = ['submitted', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'rejected'];
  static const postCategories = ['hostel_food', 'cleanliness', 'wifi', 'transport', 'library', 'canteen', 'academics', 'clubs_events', 'facilities', 'other'];
  static const studentInterests = ['coding', 'gaming', 'music', 'photography', 'sports', 'entrepreneurship', 'design', 'robotics', 'volunteering', 'other'];
  static const locationTypes = ['classroom', 'lab', 'library', 'canteen', 'hostel', 'club', 'office', 'seminar_hall', 'facility', 'kiosk', 'other'];
  static const deepLinkTypes = ['location', 'building', 'event', 'club', 'notice', 'route'];
  static const rateLimitPostSeconds = 30;
  static const rateLimitCommentSeconds = 10;

  static const reportStatusLabels = {
    'submitted': 'Submitted', 'acknowledged': 'Acknowledged', 'assigned': 'Assigned',
    'in_progress': 'In progress', 'resolved': 'Resolved', 'rejected': 'Rejected',
  };
  static const reportFlow = ['submitted', 'acknowledged', 'assigned', 'in_progress', 'resolved'];
  static const reportCategoryLabels = {
    'electrical': 'Electrical', 'plumbing': 'Plumbing / water', 'cleanliness': 'Cleanliness', 'furniture': 'Furniture',
    'it_wifi': 'IT / Wi-Fi', 'hostel': 'Hostel', 'safety': 'Safety', 'other': 'Other',
  };
  static const postCategoryLabels = {
    'hostel_food': 'Hostel food', 'cleanliness': 'Cleanliness', 'wifi': 'Wi-Fi', 'transport': 'Transport',
    'library': 'Library', 'canteen': 'Canteen', 'academics': 'Academics', 'clubs_events': 'Clubs & events',
    'facilities': 'Facilities', 'other': 'Other',
  };
  static const locationTypeLabels = {
    'classroom': 'Classroom', 'lab': 'Lab', 'library': 'Library', 'canteen': 'Canteen', 'hostel': 'Hostel',
    'club': 'Club room', 'office': 'Office', 'seminar_hall': 'Hall', 'facility': 'Facility', 'kiosk': 'Kiosk', 'other': 'Other',
  };

  static String label(Map<String, String> labels, String? key) =>
      key == null ? '' : (labels[key] ?? key.replaceAll('_', ' '));
}
