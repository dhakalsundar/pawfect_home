import { registerSchema, passwordSchema } from '../modules/auth/auth.validators.js';

/** Direct schema checks — the HTTP suite hits the auth rate limiter before covering every case. */
const cases: [string, boolean][] = [
  ['NoDigitsHere', false],
  ['short1A', false],
  ['alllowercase1', false],
  ['ALLUPPERCASE1', false],
  ['ValidPass123', true],
  [`${'a'.repeat(80)}A1`, false],
];

let failures = 0;

for (const [pw, shouldPass] of cases) {
  const accepted = passwordSchema.safeParse(pw).success;
  if (accepted !== shouldPass) failures++;
  const label = pw.length > 18 ? `${pw.slice(0, 18)}...` : pw;
  console.log(
    `  ${accepted === shouldPass ? 'PASS' : 'FAIL'}  "${label}" accepted=${accepted} expected=${shouldPass}`,
  );
}

const normalised = registerSchema.safeParse({
  name: 'A B',
  email: '  MiXeD@Example.COM ',
  password: 'ValidPass123',
});
const emailOk = normalised.success && normalised.data.email === 'mixed@example.com';
if (!emailOk) failures++;
console.log(
  `  ${emailOk ? 'PASS' : 'FAIL'}  email trimmed + lowercased -> ${normalised.success ? normalised.data.email : 'rejected'}`,
);

console.log(failures === 0 ? '\nPASSWORD POLICY OK' : `\n${failures} POLICY FAILURE(S)`);
