// Creates one username account - the way to make the first administrator.
//
//   node scripts/create-user.mjs --project <id> --username principal.office --role admin --name "Principal's Office"
//   node scripts/create-user.mjs --emulator --username asha.k --role student --name "Asha K"
//
// The password is asked for (not echoed), or read from CAMPUS_NEW_PASSWORD for
// automation. It is never a command-line argument, where it would land in the
// shell history.
import { createInterface } from 'node:readline';
import { arg, initAdmin } from './lib/admin.mjs';
import { C, createAccount, normalizeUsername, usernameProblem } from './lib/accounts.mjs';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const username = normalizeUsername(arg('username', ''));
const role = arg('role', 'student');
const displayName = arg('name', username);
const problem = usernameProblem(username);
if (problem) { console.error(`--username: ${problem}`); process.exit(2); }
if (!C.roles.includes(role)) { console.error(`--role must be one of ${C.roles.join(', ')}`); process.exit(2); }

const ctx = initAdmin();
let password = process.env.CAMPUS_NEW_PASSWORD;
if (!password) {
  password = await askHidden(`Password for ${username} (${C.passwordMinLength}+ characters): `);
  if (password !== await askHidden('Repeat the password: ')) { console.error('The passwords differ.'); process.exit(2); }
}
try {
  const uid = await createAccount(ctx, { username, password, displayName, role, createdBy: 'create-user script' });
  console.log(`Created ${role} "${username}" (uid ${uid}) in ${ctx.useEmulator ? 'the emulator' : ctx.projectId}.`);
} catch (err) {
  console.error(`Could not create the account: ${err.message}`);
  process.exit(1);
}
