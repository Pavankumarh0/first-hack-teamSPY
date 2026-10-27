import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../core/format.dart';
import '../data/models.dart';
import '../ui/widgets/common.dart';
import 'content_screens.dart';
import 'member_gate.dart';

/// The signed-in student's own RFID check-ins. Read-only: records are created
/// by the server when a registered card is tapped on a reader during a
/// session, and cards are registered by the college office, not in the app.
class MyAttendanceScreen extends StatelessWidget {
  const MyAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('My attendance')),
    body: MemberGate(
      why: 'Attendance is linked to your account.',
      path: '/attendance',
      builder: (context, me) {
        final repo = AppScope.of(context).repo;
        return PagedList<AttendanceRecord>(
          load: (cursor) => repo.myAttendance(me.id, cursor: cursor),
          header: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.badge_outlined),
                title: AsyncView<int>(
                  load: () => repo.attendanceSince(
                    me.id,
                    DateTime.now().subtract(const Duration(days: 30)),
                  ),
                  loading: const Text('Last 30 days: ...'),
                  builder: (_, n, _) => Text(
                    'Last 30 days: $n check-in${n == 1 ? '' : 's'}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                subtitle: const Text(
                  'Recorded when your registered ID card is tapped on a reader during a class session. '
                  'Something missing? Contact the college office.',
                ),
              ),
            ),
          ),
          itemBuilder: (r) => Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Card(
              child: ListTile(
                leading: const Icon(
                  Icons.check_circle_outline,
                  color: Colors.green,
                ),
                title: Text(
                  r.sessionTitle,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  [
                    formatDateTime(r.checkInAt),
                    if (r.course != null) r.course!,
                    if (r.readerName != null) r.readerName!,
                  ].join(' · '),
                ),
              ),
            ),
          ),
          empty: const EmptyState(
            title: 'No check-ins yet',
            body: 'When your class uses RFID attendance, tapping your registered ID card on the reader records it here.',
            icon: Icons.badge_outlined,
          ),
        );
      },
    ),
  );
}
