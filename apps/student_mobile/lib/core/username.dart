import 'constants.dart';

// Firebase Authentication has no username provider. A username maps to the
// internal sign-in identifier "<username>@users.campus-mithra.invalid" (a
// reserved domain that never receives mail). Students only ever see and type
// their username; Firebase Auth stores and checks the password. The website
// (src/lib/username.ts) and the backend use the same mapping.

final _pattern = RegExp(C.usernamePattern);

String normalizeUsername(String raw) => raw.trim().toLowerCase();

/// A message for the student, or null when acceptable.
String? usernameProblem(String username) {
  if (username.length < C.usernameMin || username.length > C.usernameMax) {
    return 'Usernames are ${C.usernameMin}-${C.usernameMax} characters long.';
  }
  if (!_pattern.hasMatch(username)) return 'Use lowercase letters, digits, dots and underscores, starting with a letter.';
  if (RegExp(r'[._]{2}').hasMatch(username) || RegExp(r'[._]$').hasMatch(username)) {
    return 'Dots and underscores cannot be doubled or end the username.';
  }
  if (C.reservedUsernames.contains(username)) return 'That username is reserved.';
  return null;
}

String? passwordProblem(String password) {
  if (password.length < C.passwordMinLength) return 'Use at least ${C.passwordMinLength} characters.';
  if (password.length > 128) return 'That password is too long.';
  if (!RegExp('[A-Za-z]').hasMatch(password) || !RegExp('[0-9]').hasMatch(password)) {
    return 'Use letters and at least one digit.';
  }
  return null;
}

String identityFor(String username) => '${normalizeUsername(username)}@${C.identityDomain}';
