import 'package:firebase_core/firebase_core.dart';

import '../data/repository.dart';

/// A sentence the student can act on, from any error.
String friendlyError(Object error) {
  if (error is UserMessage) return error.message;
  if (error is FirebaseException) {
    switch (error.code) {
      case 'invalid-credential':
      case 'wrong-password':
      case 'user-not-found':
      case 'invalid-email':
        return 'Incorrect username or password.';
      case 'user-disabled':
        return 'This account is suspended. Contact the college office.';
      case 'too-many-requests':
        return 'Too many attempts. Wait a few minutes and try again.';
      case 'requires-recent-login':
        return 'For your security, sign in again and retry.';
      case 'network-request-failed':
      case 'unavailable':
        return 'Cannot reach the campus service. Check your internet connection.';
      case 'permission-denied':
        return 'You do not have permission for this.';
      case 'failed-precondition':
        return 'The database needs an index for this. Ask an administrator to deploy the Firestore indexes.';
      case 'unauthorized':
        return 'The photo could not be uploaded: it must be an image under 5 MB.';
    }
    return error.message ?? 'Something went wrong (${error.code}).';
  }
  final text = error.toString();
  if (text.contains('SocketException') || text.contains('ClientException')) {
    return 'Cannot reach the campus service. Check your internet connection.';
  }
  return 'Something went wrong. Please try again.';
}
