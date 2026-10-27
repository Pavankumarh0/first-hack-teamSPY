import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

import '../core/navigation.dart';
import 'models.dart';

/// Every Firestore read and write the app makes. Queries are shaped to match
/// firebase/firestore.rules (for example, public lists filter on published).
class CampusRepository {
  CampusRepository(this.db, this.storage);

  /// For widget tests of screens that never touch the database.
  @visibleForTesting
  CampusRepository.unavailable();

  late final FirebaseFirestore db;
  late final FirebaseStorage storage;

  Future<List<T>> _list<T>(Query<Json> q, T Function(String, Json) make) async =>
      [for (final d in (await q.get()).docs) make(d.id, d.data())];

  Future<PageOf<T>> _page<T>(Query<Json> q, int size, DocumentSnapshot<Json>? cursor, T Function(String, Json) make) async {
    var query = q;
    if (cursor != null) query = query.startAfterDocument(cursor);
    final snap = await query.limit(size).get();
    return PageOf([for (final d in snap.docs) make(d.id, d.data())], snap.docs.length == size ? snap.docs.last : null);
  }

  /// A document, or null if it does not exist or is not visible to us.
  Future<T?> _one<T>(String path, T Function(String, Json) make) async {
    try {
      final s = await db.doc(path).get();
      return s.exists ? make(s.id, s.data()!) : null;
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') return null;
      rethrow;
    }
  }

  // --- Directory and map -------------------------------------------------
  Future<CampusMapData?> campusMap() async {
    final s = await db.doc('campusMap/main').get();
    return s.exists ? CampusMapData.fromJson(s.data()!) : null;
  }

  Future<List<Building>> buildings() =>
      _list(db.collection('buildings').where('published', isEqualTo: true).orderBy('name'), Building.new);
  Future<List<Place>> places() =>
      _list(db.collection('locations').where('published', isEqualTo: true).orderBy('name'), Place.new);
  Future<List<Place>> placesIn(String buildingId) => _list(
      db.collection('locations').where('buildingId', isEqualTo: buildingId).where('published', isEqualTo: true).orderBy('name'),
      Place.new);
  Future<Building?> building(String id) => _one('buildings/$id', Building.new);
  Future<Place?> place(String id) => _one('locations/$id', Place.new);

  // --- Official content ------------------------------------------------------
  Future<PageOf<Announcement>> announcements({int size = 10, DocumentSnapshot<Json>? cursor}) => _page(
      db.collection('announcements').where('status', isEqualTo: 'published').orderBy('pinned', descending: true).orderBy('publishedAt', descending: true),
      size, cursor, Announcement.new);
  Future<Announcement?> announcement(String id) => _one('announcements/$id', Announcement.new);

  Future<PageOf<CampusEvent>> upcomingEvents({int size = 10, DocumentSnapshot<Json>? cursor}) => _page(
      db.collection('events').where('status', isEqualTo: 'published').where('startAt', isGreaterThanOrEqualTo: Timestamp.now()).orderBy('startAt'),
      size, cursor, CampusEvent.new);
  Future<List<CampusEvent>> clubEvents(String clubId) => _list(
      db.collection('events').where('clubId', isEqualTo: clubId).where('status', whereIn: ['published', 'cancelled']).orderBy('startAt'),
      CampusEvent.new);
  Future<CampusEvent?> event(String id) => _one('events/$id', CampusEvent.new);
  Future<List<Club>> clubs() => _list(db.collection('clubs').where('published', isEqualTo: true).orderBy('name'), Club.new);
  Future<Club?> club(String id) => _one('clubs/$id', Club.new);

  // --- Community ---------------------------------------------------------------
  Future<PageOf<Post>> posts({String? category, int size = 15, DocumentSnapshot<Json>? cursor}) {
    Query<Json> q = db.collection('posts').where('status', isEqualTo: 'visible');
    if (category != null) q = q.where('category', isEqualTo: category);
    return _page(q.orderBy('lastActivityAt', descending: true), size, cursor, Post.new);
  }

  Future<Post?> post(String id) => _one('posts/$id', Post.new);
  Future<List<Comment>> comments(String postId) => _list(
      db.collection('posts/$postId/comments').where('status', isEqualTo: 'visible').orderBy('createdAt'), Comment.new);

  Future<bool> markedHelpful(String postId, String uid) async => (await db.doc('posts/$postId/reactions/$uid').get()).exists;

  /// The post and the author's rate-limit stamp go in one batch, as the rules require.
  Future<String> createPost(UserProfile me, {required String title, required String body, required String category, Place? place}) async {
    final ref = db.collection('posts').doc();
    final now = FieldValue.serverTimestamp();
    final b = db.batch()
      ..set(ref, {
        'authorId': me.id, 'authorUsername': me.username, 'authorDisplayName': me.displayName,
        'title': title.trim(), 'body': body.trim(), 'category': category,
        'locationId': place?.id, 'locationName': place?.name,
        'status': 'visible', 'public': false, 'helpfulCount': 0, 'commentCount': 0, 'lastCommentId': null,
        'createdAt': now, 'updatedAt': now, 'lastActivityAt': now,
      })
      ..update(db.doc('users/${me.id}'), {'lastPostAt': now});
    await _commitLimited(b, 'Please wait 30 seconds between posts, and check the title (5+ characters).');
    return ref.id;
  }

  Future<void> addComment(String postId, UserProfile me, String body) async {
    final ref = db.collection('posts/$postId/comments').doc();
    final now = FieldValue.serverTimestamp();
    final b = db.batch()
      ..set(ref, {
        'authorId': me.id, 'authorUsername': me.username, 'authorDisplayName': me.displayName,
        'body': body.trim(), 'status': 'visible', 'createdAt': now, 'updatedAt': now,
      })
      ..update(db.doc('posts/$postId'), {'commentCount': FieldValue.increment(1), 'lastCommentId': ref.id, 'lastActivityAt': now})
      ..update(db.doc('users/${me.id}'), {'lastCommentAt': now});
    await _commitLimited(b, 'Please wait a few seconds between replies.');
  }

  Future<void> _commitLimited(WriteBatch b, String message) async {
    try {
      await b.commit();
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') throw UserMessage(message);
      rethrow;
    }
  }

  Future<void> setHelpful(String postId, String uid, bool helpful) async {
    final r = db.doc('posts/$postId/reactions/$uid');
    final b = db.batch();
    if (helpful) {
      b.set(r, {'createdAt': FieldValue.serverTimestamp()});
    } else {
      b.delete(r);
    }
    b.update(db.doc('posts/$postId'), {'helpfulCount': FieldValue.increment(helpful ? 1 : -1)});
    await b.commit();
  }

  Future<void> flag(String uid, String targetType, String targetPath, String reason) async {
    final targetId = targetPath.split('/').last;
    try {
      await db.doc('flags/${targetType}_${targetId}_$uid').set({
        'reporterId': uid, 'targetType': targetType, 'targetPath': targetPath,
        'reason': reason.trim(), 'status': 'open', 'createdAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') throw const UserMessage('You have already reported this.');
      rethrow;
    }
  }

  Future<void> deleteOwnPost(String postId) =>
      db.doc('posts/$postId').update({'status': 'deleted', 'updatedAt': FieldValue.serverTimestamp()});

  // --- Maintenance reports ---------------------------------------------------
  static const photoTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'heic': 'image/heic', 'heif': 'image/heif'};
  static const photoMaxBytes = 5 * 1024 * 1024;

  /// Uploads the optional photo (private: reporter and staff only), then files the report.
  Future<String> createReport(
    UserProfile me, {
    required String category,
    required String title,
    required String description,
    Building? building,
    Place? place,
    String? detail,
    Uint8List? photo,
    String? photoExtension,
  }) async {
    final ref = db.collection('reports').doc();
    String? imagePath;
    if (photo != null) {
      final ext = (photoExtension ?? 'jpg').toLowerCase();
      final type = photoTypes[ext];
      if (type == null) throw const UserMessage('The photo must be a JPEG, PNG, WebP or HEIC image.');
      if (photo.lengthInBytes > photoMaxBytes) throw const UserMessage('The photo must be under 5 MB.');
      imagePath = 'reports/${me.id}/${ref.id}/photo.${ext == 'jpeg' ? 'jpg' : ext}';
      await storage.ref(imagePath).putData(photo, SettableMetadata(contentType: type));
    }
    final now = FieldValue.serverTimestamp();
    await ref.set({
      'reporterId': me.id, 'reporterUsername': me.username, 'category': category,
      'title': title.trim(), 'description': description.trim(),
      'buildingId': building?.id, 'buildingName': building?.name,
      'locationId': place?.id, 'locationName': place?.name,
      'locationDetail': (detail?.trim().isEmpty ?? true) ? null : detail!.trim(),
      'imagePath': imagePath, 'status': 'submitted', 'assigneeId': null, 'assigneeName': null,
      'lastUpdateId': null, 'lastUpdateMessage': null, 'createdAt': now, 'updatedAt': now,
    });
    return ref.id;
  }

  Future<PageOf<Report>> myReports(String uid, {int size = 20, DocumentSnapshot<Json>? cursor}) =>
      _page(db.collection('reports').where('reporterId', isEqualTo: uid).orderBy('createdAt', descending: true), size, cursor, Report.new);
  Future<Report?> report(String id) => _one('reports/$id', Report.new);
  Future<List<ReportUpdate>> reportUpdates(String id) => _list(db.collection('reports/$id/updates').orderBy('at'), ReportUpdate.new);
  Future<String> photoUrl(String path) => storage.ref(path).getDownloadURL();

  Future<void> addReporterComment(String reportId, UserProfile me, String message) =>
      db.collection('reports/$reportId/updates').doc().set({
        'type': 'comment', 'message': message.trim(), 'byId': me.id, 'byName': me.username, 'at': FieldValue.serverTimestamp(),
      });

  // --- Notifications ---------------------------------------------------------
  Future<List<AppNotification>> notifications(String uid) async {
    final mine = await _list(
        db.collection('notifications').where('userId', isEqualTo: uid).orderBy('createdAt', descending: true).limit(30), AppNotification.new);
    final all = await _list(
        db.collection('notifications').where('audience', isEqualTo: 'all').orderBy('createdAt', descending: true).limit(20), AppNotification.new);
    return [...mine, ...all]..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
  }

  /// Unread = unread personal notifications + broadcasts newer than the last visit.
  Stream<int> unreadCount(String uid, DateTime? seenAt) {
    final personal = db.collection('notifications').where('userId', isEqualTo: uid).where('read', isEqualTo: false).limit(50).snapshots();
    return personal.asyncMap((p) async {
      final broadcasts = await db.collection('notifications').where('audience', isEqualTo: 'all').orderBy('createdAt', descending: true).limit(20).get();
      final newer = broadcasts.docs.where((d) => (d.data()['createdAt'] as Timestamp?)?.toDate().isAfter(seenAt ?? DateTime(0)) ?? false);
      return p.docs.length + newer.length;
    });
  }

  Future<void> markRead(String id) => db.doc('notifications/$id').update({'read': true});
  Future<void> markBroadcastsSeen(String uid) => db.doc('users/$uid').update({'notificationsSeenAt': FieldValue.serverTimestamp()});

  // --- Profile -------------------------------------------------------------------
  Future<void> updateProfile(String uid, {required String displayName, required String department, required String bio, int? year}) =>
      db.doc('users/$uid').update({
        'displayName': displayName.trim(), 'department': department.trim(), 'bio': bio.trim(),
        'year': ?year,
        'updatedAt': FieldValue.serverTimestamp(),
      });
}

/// An error whose message is meant for the student as it is.
class UserMessage implements Exception {
  const UserMessage(this.message);
  final String message;
  @override
  String toString() => message;
}
