import 'package:intl/intl.dart';

final _date = DateFormat('d MMM yyyy');
final _dateTime = DateFormat('EEE d MMM, h:mm a');
final _time = DateFormat('h:mm a');

String formatDate(DateTime? d) => d == null ? '' : _date.format(d);
String formatDateTime(DateTime? d) => d == null ? '' : _dateTime.format(d);

String formatRange(DateTime start, DateTime end) {
  final sameDay = start.year == end.year && start.month == end.month && start.day == end.day;
  return sameDay ? '${_dateTime.format(start)} - ${_time.format(end)}' : '${_dateTime.format(start)} - ${_dateTime.format(end)}';
}

String timeAgo(DateTime? d, {DateTime? now}) {
  if (d == null) return '';
  final s = (now ?? DateTime.now()).difference(d).inSeconds;
  if (s < 45) return 'just now';
  final m = (s / 60).round();
  if (m < 60) return '$m min ago';
  final h = (m / 60).round();
  if (h < 24) return '$h h ago';
  final days = (h / 24).round();
  if (days < 7) return '$days d ago';
  return formatDate(d);
}
