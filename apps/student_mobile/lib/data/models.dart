import 'package:cloud_firestore/cloud_firestore.dart';

// Firestore documents (schema: docs/ARCHITECTURE.md), shared with the website.

DateTime? _date(Object? v) => v is Timestamp ? v.toDate() : (v is DateTime ? v : null);
String? _str(Object? v) => v is String ? v : null;
int _int(Object? v, [int fallback = 0]) => v is num ? v.toInt() : fallback;

typedef Json = Map<String, dynamic>;

class Building {
  Building(this.id, Json d)
      : name = d['name'] as String? ?? id,
        code = d['code'] as String? ?? '',
        category = d['category'] as String? ?? 'other',
        description = _str(d['description']),
        x = (d['x'] as num?)?.toDouble() ?? 0,
        y = (d['y'] as num?)?.toDouble() ?? 0,
        w = (d['w'] as num?)?.toDouble() ?? 10,
        h = (d['h'] as num?)?.toDouble() ?? 10,
        floors = d['floors'] is num ? (d['floors'] as num).toInt() : null,
        openingHours = _str(d['openingHours']),
        entranceNodeId = _str(d['entranceNodeId']),
        accessible = d['accessible'] == true,
        isSample = d['isSample'] == true;
  final String id, name, code, category;
  final String? description, openingHours, entranceNodeId;
  final double x, y, w, h;
  final int? floors;
  final bool accessible, isSample;
}

class Place {
  Place(this.id, Json d)
      : name = d['name'] as String? ?? id,
        type = d['type'] as String? ?? 'other',
        buildingId = _str(d['buildingId']),
        buildingName = _str(d['buildingName']),
        floor = d['floor'] is num ? (d['floor'] as num).toInt() : null,
        room = _str(d['room']),
        description = _str(d['description']),
        navNodeId = _str(d['navNodeId']),
        openingHours = _str(d['openingHours']),
        keywords = [for (final k in (d['keywords'] as List? ?? const [])) k.toString()],
        isSample = d['isSample'] == true;
  final String id, name, type;
  final String? buildingId, buildingName, room, description, navNodeId, openingHours;
  final int? floor;
  final List<String> keywords;
  final bool isSample;

  String get where => [buildingName, if (floor != null) (floor == 0 ? 'Ground floor' : 'Floor $floor'), room].whereType<String>().join(' · ');
}

class Announcement {
  Announcement(this.id, Json d)
      : title = d['title'] as String? ?? '',
        body = d['body'] as String? ?? '',
        category = d['category'] as String? ?? 'announcement',
        status = d['status'] as String? ?? 'published',
        pinned = d['pinned'] == true,
        publishedAt = _date(d['publishedAt']),
        isSample = d['isSample'] == true;
  final String id, title, body, category, status;
  final bool pinned, isSample;
  final DateTime? publishedAt;
}

class Club {
  Club(this.id, Json d)
      : name = d['name'] as String? ?? id,
        category = _str(d['category']),
        description = _str(d['description']),
        contact = _str(d['contact']),
        homeLocationId = _str(d['homeLocationId']),
        isSample = d['isSample'] == true;
  final String id, name;
  final String? category, description, contact, homeLocationId;
  final bool isSample;
}

class CampusEvent {
  CampusEvent(this.id, Json d)
      : clubId = d['clubId'] as String? ?? '',
        clubName = d['clubName'] as String? ?? '',
        title = d['title'] as String? ?? '',
        description = d['description'] as String? ?? '',
        startAt = _date(d['startAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        endAt = _date(d['endAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        venueName = d['venueName'] as String? ?? '',
        venueLocationId = _str(d['venueLocationId']),
        status = d['status'] as String? ?? 'published',
        isSample = d['isSample'] == true;
  final String id, clubId, clubName, title, description, venueName, status;
  final String? venueLocationId;
  final DateTime startAt, endAt;
  final bool isSample;
}

class Report {
  Report(this.id, Json d)
      : reporterId = d['reporterId'] as String? ?? '',
        reporterUsername = d['reporterUsername'] as String? ?? '',
        category = d['category'] as String? ?? 'other',
        title = d['title'] as String? ?? '',
        description = d['description'] as String? ?? '',
        buildingName = _str(d['buildingName']),
        locationName = _str(d['locationName']),
        locationDetail = _str(d['locationDetail']),
        imagePath = _str(d['imagePath']),
        status = d['status'] as String? ?? 'submitted',
        assigneeName = _str(d['assigneeName']),
        createdAt = _date(d['createdAt']),
        updatedAt = _date(d['updatedAt']);
  final String id, reporterId, reporterUsername, category, title, description, status;
  final String? buildingName, locationName, locationDetail, imagePath, assigneeName;
  final DateTime? createdAt, updatedAt;

  String get where => [buildingName, locationName, locationDetail].whereType<String>().join(', ');
}

class ReportUpdate {
  ReportUpdate(this.id, Json d)
      : type = d['type'] as String? ?? 'comment',
        fromStatus = _str(d['fromStatus']),
        toStatus = _str(d['toStatus']),
        message = d['message'] as String? ?? '',
        byName = d['byName'] as String? ?? '',
        at = _date(d['at']);
  final String id, type, message, byName;
  final String? fromStatus, toStatus;
  final DateTime? at;
}

class Post {
  Post(this.id, Json d)
      : authorId = d['authorId'] as String? ?? '',
        authorUsername = d['authorUsername'] as String? ?? '',
        authorDisplayName = d['authorDisplayName'] as String? ?? '',
        title = d['title'] as String? ?? '',
        body = d['body'] as String? ?? '',
        category = d['category'] as String? ?? 'other',
        locationId = _str(d['locationId']),
        locationName = _str(d['locationName']),
        status = d['status'] as String? ?? 'visible',
        helpfulCount = _int(d['helpfulCount']),
        commentCount = _int(d['commentCount']),
        createdAt = _date(d['createdAt']),
        isSample = d['isSample'] == true;
  final String id, authorId, authorUsername, authorDisplayName, title, body, category, status;
  final String? locationId, locationName;
  final int helpfulCount, commentCount;
  final DateTime? createdAt;
  final bool isSample;
}

class Comment {
  Comment(this.id, Json d)
      : authorId = d['authorId'] as String? ?? '',
        authorUsername = d['authorUsername'] as String? ?? '',
        authorDisplayName = d['authorDisplayName'] as String? ?? '',
        body = d['body'] as String? ?? '',
        createdAt = _date(d['createdAt']);
  final String id, authorId, authorUsername, authorDisplayName, body;
  final DateTime? createdAt;
}

class AppNotification {
  AppNotification(this.id, Json d)
      : type = d['type'] as String? ?? '',
        audience = d['audience'] as String? ?? 'user',
        title = d['title'] as String? ?? '',
        body = _str(d['body']),
        link = _str(d['link']),
        read = d['read'] == true,
        createdAt = _date(d['createdAt']);
  final String id, type, audience, title;
  final String? body, link;
  final bool read;
  final DateTime? createdAt;
}

class UserProfile {
  UserProfile(this.id, Json d)
      : username = d['username'] as String? ?? '',
        displayName = d['displayName'] as String? ?? '',
        role = d['role'] as String? ?? 'student',
        status = d['status'] as String? ?? 'active',
        department = d['department'] as String? ?? '',
        year = d['year'] is num ? (d['year'] as num).toInt() : null,
        bio = d['bio'] as String? ?? '',
        notificationsSeenAt = _date(d['notificationsSeenAt']);
  final String id, username, displayName, role, status, department, bio;
  final int? year;
  final DateTime? notificationsSeenAt;
}

/// One page of a paginated list.
class PageOf<T> {
  const PageOf(this.items, this.cursor);
  final List<T> items;
  final DocumentSnapshot<Json>? cursor;
}

/// A check-in written by the backend after it verified an RFID card tap
/// (docs/RFID_BACKEND.md). Students can read their own; nobody can edit one.
class AttendanceRecord {
  AttendanceRecord(this.id, Json d)
      : sessionTitle = d['sessionTitle'] as String? ?? 'Session',
        course = _str(d['course']),
        readerName = _str(d['readerName']),
        checkInAt = _date(d['checkInAt']);
  final String id, sessionTitle;
  final String? course, readerName;
  final DateTime? checkInAt;
}
