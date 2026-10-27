import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../core/username.dart';
import 'models.dart';
import 'repository.dart';

enum SessionStatus { loading, signedOut, signedIn }

/// The signed-in student, as the UI sees it.
abstract class Session extends ChangeNotifier {
  SessionStatus get status;
  String? get uid;
  String? get role;

  /// False for suspended accounts and accounts not created by the backend.
  bool get active;
  UserProfile? get profile;

  Future<void> signIn(String username, String password);
  Future<void> register({
    required String username,
    required String password,
    required String displayName,
    String? department,
    int? year,
    String? inviteCode,
  });
  Future<void> signOut();
  Future<void> changePassword(String current, String next);
}

class FirebaseSession extends Session {
  FirebaseSession(this.auth, this.db, {required this.siteUrl, http.Client? client}) : _http = client ?? http.Client() {
    _authSub = auth.idTokenChanges().listen(_onUser);
  }

  final FirebaseAuth auth;
  final FirebaseFirestore db;
  final String siteUrl;
  final http.Client _http;
  StreamSubscription<User?>? _authSub;
  StreamSubscription<DocumentSnapshot<Json>>? _profileSub;

  SessionStatus _status = SessionStatus.loading;
  String? _uid;
  String? _role;
  bool _active = false;
  UserProfile? _profile;

  @override
  SessionStatus get status => _status;
  @override
  String? get uid => _uid;
  @override
  String? get role => _role;
  @override
  bool get active => _active;
  @override
  UserProfile? get profile => _profile;

  Future<void> _onUser(User? user) async {
    await _profileSub?.cancel();
    _profileSub = null;
    if (user == null) {
      _status = SessionStatus.signedOut;
      _uid = _role = null;
      _active = false;
      _profile = null;
      notifyListeners();
      return;
    }
    final token = await user.getIdTokenResult();
    _uid = user.uid;
    _role = token.claims?['role'] as String?;
    _active = token.claims?['active'] == true;
    _profileSub = db.doc('users/${user.uid}').snapshots().listen(
      (s) {
        _profile = s.exists ? UserProfile(s.id, s.data()!) : null;
        notifyListeners();
      },
      onError: (_) {
        _profile = null;
        notifyListeners();
      },
    );
    _status = SessionStatus.signedIn;
    notifyListeners();
  }

  @override
  Future<void> signIn(String username, String password) async {
    // The username becomes the internal identifier; no email is ever asked for.
    await auth.signInWithEmailAndPassword(email: identityFor(username), password: password);
  }

  @override
  Future<void> register({
    required String username,
    required String password,
    required String displayName,
    String? department,
    int? year,
    String? inviteCode,
  }) async {
    final name = normalizeUsername(username);
    final res = await _http.post(
      Uri.parse('$siteUrl/api/auth/register'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'username': name,
        'password': password,
        'displayName': displayName.trim(),
        if (department != null && department.trim().isNotEmpty) 'department': department.trim(),
        'year': year,
        if (inviteCode != null && inviteCode.trim().isNotEmpty) 'inviteCode': inviteCode.trim(),
      }),
    );
    if (res.statusCode != 201) {
      String message = 'Registration failed (${res.statusCode}).';
      try {
        message = (jsonDecode(res.body) as Map)['error'] as String? ?? message;
      } catch (_) {}
      throw UserMessage(message);
    }
    await signIn(name, password);
  }

  @override
  Future<void> signOut() => auth.signOut();

  @override
  Future<void> changePassword(String current, String next) async {
    final user = auth.currentUser;
    if (user?.email == null) throw const UserMessage('Sign in first.');
    final problem = passwordProblem(next);
    if (problem != null) throw UserMessage(problem);
    await user!.reauthenticateWithCredential(EmailAuthProvider.credential(email: user.email!, password: current));
    await user.updatePassword(next);
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _profileSub?.cancel();
    super.dispose();
  }
}
