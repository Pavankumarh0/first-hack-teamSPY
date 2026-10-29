import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../app_scope.dart';
import 'member_gate.dart';

class CampusIqScreen extends StatelessWidget {
  const CampusIqScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Campus IQ')),
    body: MemberGate(
      why: 'Sign in to answer campus questions and keep your score.',
      path: '/quiz',
      builder: (context, me) => const _QuizBody(),
    ),
  );
}

class _QuizBody extends StatefulWidget {
  const _QuizBody();
  @override
  State<_QuizBody> createState() => _QuizBodyState();
}

class _QuizBodyState extends State<_QuizBody> {
  Map<String, dynamic>? _q, _result;
  List<dynamic> _leaders = [];
  int? _choice;
  bool _busy = false;
  String? _error;
  Future<Map<String, dynamic>> _call(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final scope = AppScope.of(context);
    final token = await FirebaseAuth.instance.currentUser!.getIdToken();
    final res = body == null
        ? await http.get(
            Uri.parse('${scope.config.siteUrl}$path'),
            headers: {'Authorization': 'Bearer $token'},
          )
        : await http.post(
            Uri.parse('${scope.config.siteUrl}$path'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode(body),
          );
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode < 200 || res.statusCode >= 300)
      throw StateError(data['error']?.toString() ?? 'Request failed');
    return data;
  }

  Future<void> _load() async {
    try {
      final q = await _call('/api/quiz/daily');
      final l = await _call('/api/quiz/leaderboard');
      if (!mounted) return;
      setState(() {
        _q = q['question'] as Map<String, dynamic>?;
        _leaders = (l['leaders'] as List<dynamic>?) ?? [];
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _submit() async {
    if (_q == null || _choice == null) return;
    setState(() => _busy = true);
    try {
      final r = await _call(
        '/api/quiz/answer',
        body: {
          'questionId': _q!['id'],
          'version': _q!['version'],
          'optionIndex': _choice,
        },
      );
      if (mounted) setState(() => _result = r);
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Learn verified campus facts, one question at a time.',
          style: TextStyle(fontSize: 16),
        ),
        if (_error != null)
          Text(_error!, style: const TextStyle(color: Colors.red)),
        if (_q == null && _error == null)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (_q == null && _error == null)
          const Text('No published question yet.'),
        if (_q != null) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _q!['prompt']?.toString() ?? '',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  ...(List<String>.from(
                    _q!['options'] as List,
                  )).asMap().entries.map(
                    (e) => RadioListTile<int>(
                      value: e.key,
                      groupValue: _choice,
                      title: Text(e.value),
                      onChanged: _result == null
                          ? (v) => setState(() => _choice = v)
                          : null,
                    ),
                  ),
                  if (_result == null)
                    FilledButton(
                      onPressed: _busy || _choice == null ? null : _submit,
                      child: Text(_busy ? 'Submitting…' : 'Submit answer'),
                    ),
                  if (_result != null)
                    Text(
                      '${_result!['correct'] == true ? 'Correct!' : 'Not quite.'} ${_result!['explanation'] ?? ''}\n+${_result!['points'] ?? 0} points',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 20),
        Text(
          'All-time leaderboard',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        ..._leaders.asMap().entries.map(
          (e) => ListTile(
            leading: Text('${e.key + 1}'),
            title: Text(e.value['alias']?.toString() ?? 'Campus student'),
            trailing: Text('${e.value['points'] ?? 0}'),
          ),
        ),
      ],
    ),
  );
}
