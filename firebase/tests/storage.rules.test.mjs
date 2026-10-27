import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-campus-mithra',
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });

const storageAs = (uid, claims) => env.authenticatedContext(uid, claims).storage();
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe('report photos', () => {
  it('a student uploads an image to their own report folder only', async () => {
    const s = storageAs('stu1', { role: 'student', active: true });
    await assertSucceeds(uploadBytes(ref(s, 'reports/stu1/r1/photo.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(s, 'reports/stu2/r1/photo.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(s, 'reports/stu1/r1/notes.pdf'), jpeg, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(s, 'reports/stu1/r1/big.jpg'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
  });
  it('photos are private: reporter and staff only', async () => {
    await env.withSecurityRulesDisabled((ctx) => uploadBytes(ref(ctx.storage(), 'reports/stu1/r9/p.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(storageAs('stu1', { role: 'student', active: true }), 'reports/stu1/r9/p.jpg')));
    await assertSucceeds(getBytes(ref(storageAs('staff1', { role: 'staff', active: true }), 'reports/stu1/r9/p.jpg')));
    await assertFails(getBytes(ref(storageAs('stu2', { role: 'student', active: true }), 'reports/stu1/r9/p.jpg')));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'reports/stu1/r9/p.jpg')));
  });
  it('only admins publish public media', async () => {
    await assertFails(uploadBytes(ref(storageAs('stu1', { role: 'student', active: true }), 'public/logo.png'), jpeg, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(storageAs('admin1', { role: 'admin', active: true }), 'public/logo.png'), jpeg, { contentType: 'image/png' }));
  });
});
