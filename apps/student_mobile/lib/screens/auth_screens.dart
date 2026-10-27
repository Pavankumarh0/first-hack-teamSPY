import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/errors.dart';
import '../core/username.dart';
import '../ui/theme.dart';

Widget _logo() => Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(color: Brand.navy, borderRadius: BorderRadius.circular(18)),
      child: const Icon(Icons.account_balance_outlined, color: Brand.saffron, size: 34),
    );

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.next});
  final String? next;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false, _show = false;
  String? _error;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      await AppScope.of(context).session.signIn(_username.text, _password.text);
      if (mounted) context.go(widget.next ?? '/');
    } catch (e) {
      setState(() { _error = friendlyError(e); _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: SafeArea(
          child: Form(
            key: _form,
            child: ListView(padding: const EdgeInsets.all(24), children: [
              Center(child: _logo()),
              const SizedBox(height: 16),
              Text('Sign in to Campus Mithra', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              const Text('Use the username and password you registered with.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF64748B))),
              const SizedBox(height: 24),
              if (_error != null) _ErrorText(_error!),
              TextFormField(
                key: const Key('login-username'),
                controller: _username,
                decoration: const InputDecoration(labelText: 'Username', hintText: 'e.g. asha.k', prefixIcon: Icon(Icons.person_outline)),
                autocorrect: false,
                textCapitalization: TextCapitalization.none,
                autofillHints: const [AutofillHints.username],
                validator: (v) => normalizeUsername(v ?? '').isEmpty ? 'Enter your username.' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                key: const Key('login-password'),
                controller: _password,
                obscureText: !_show,
                autofillHints: const [AutofillHints.password],
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    tooltip: _show ? 'Hide password' : 'Show password',
                    icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                    onPressed: () => setState(() => _show = !_show),
                  ),
                ),
                validator: (v) => (v ?? '').isEmpty ? 'Enter your password.' : null,
                onFieldSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in'),
              ),
              const SizedBox(height: 12),
              const Text('Forgot your password? The college office can reset it - there is no email recovery.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              const SizedBox(height: 12),
              TextButton(onPressed: () => context.push('/register'), child: const Text('New here? Create an account')),
            ]),
          ),
        ),
      );
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _name = TextEditingController();
  final _dept = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _code = TextEditingController();
  int? _year;
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      await AppScope.of(context).session.register(
            username: _username.text,
            password: _password.text,
            displayName: _name.text,
            department: _dept.text,
            year: _year,
            inviteCode: _code.text,
          );
      if (mounted) context.go('/');
    } catch (e) {
      setState(() { _error = friendlyError(e); _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Create account')),
        body: SafeArea(
          child: Form(
            key: _form,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: ListView(padding: const EdgeInsets.all(20), children: [
              const Text('Just a username and a password - no email or phone number needed.', style: TextStyle(color: Color(0xFF475569))),
              const SizedBox(height: 16),
              if (_error != null) _ErrorText(_error!),
              TextFormField(
                key: const Key('register-username'),
                controller: _username,
                autocorrect: false,
                decoration: const InputDecoration(labelText: 'Username', helperText: '3-24 characters: letters, digits, dots, underscores'),
                validator: (v) => usernameProblem(normalizeUsername(v ?? '')),
              ),
              const SizedBox(height: 14),
              TextFormField(
                key: const Key('register-name'),
                controller: _name,
                maxLength: 40,
                decoration: const InputDecoration(labelText: 'Your name', helperText: 'Shown next to your posts, with your username'),
                validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your name (2-40 characters).' : null,
              ),
              const SizedBox(height: 6),
              Row(children: [
                Expanded(child: TextFormField(controller: _dept, decoration: const InputDecoration(labelText: 'Department'))),
                const SizedBox(width: 12),
                SizedBox(
                  width: 110,
                  child: DropdownButtonFormField<int?>(
                    initialValue: _year,
                    decoration: const InputDecoration(labelText: 'Year'),
                    items: [const DropdownMenuItem(value: null, child: Text('-')), for (var y = 1; y <= 6; y++) DropdownMenuItem(value: y, child: Text('$y'))],
                    onChanged: (v) => setState(() => _year = v),
                  ),
                ),
              ]),
              const SizedBox(height: 14),
              TextFormField(
                key: const Key('register-password'),
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password', helperText: 'At least 8 characters, with letters and a digit'),
                validator: (v) => passwordProblem(v ?? ''),
              ),
              const SizedBox(height: 14),
              TextFormField(
                key: const Key('register-confirm'),
                controller: _confirm,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirm password'),
                validator: (v) => v != _password.text ? 'The passwords do not match.' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _code,
                decoration: const InputDecoration(labelText: 'Campus registration code', helperText: 'If the college gave you one'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                key: const Key('register-submit'),
                onPressed: _busy ? null : _submit,
                child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Create account'),
              ),
              const SizedBox(height: 12),
              const Text('Without an email there is no automatic password reset: the college office resets it.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            ]),
          ),
        ),
      );
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: const TextStyle(color: Color(0xFF991B1B))),
      );
}

/// For screens that need an account: explains why and links to sign in.
class SignInPrompt extends StatelessWidget {
  const SignInPrompt({super.key, required this.why, required this.next});
  final String why;
  final String next;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircleAvatar(radius: 28, backgroundColor: Brand.teal.withValues(alpha: 0.12), child: const Icon(Icons.lock_outline, color: Brand.tealDark)),
            const SizedBox(height: 12),
            const Text('Sign in to continue', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(why, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B))),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => context.push(Uri(path: '/login', queryParameters: {'next': next}).toString()), child: const Text('Sign in')),
            TextButton(onPressed: () => context.push('/register'), child: const Text('Create an account')),
          ]),
        ),
      );
}
