// Fails if any tracked or new (non-ignored) text file contains an em dash (U+2014).
// Project rule: no em dashes in code, comments, UI copy, docs or commit messages.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Built from its code point so no formatter can turn it into a literal character.
const EM_DASH = String.fromCharCode(0x2014);
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|py|sh|yml|yaml|txt|wgsl|glsl)$/i;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && TEXT.test(f) && !f.startsWith('references/candidates/'));

let bad = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) {
      console.error(`${file}:${i + 1}: em dash`);
      bad++;
    }
  });
}

// Also check the message of the commit being made, when run from a commit-msg hook.
const msgFile = process.argv[2];
if (msgFile) {
  const msg = readFileSync(msgFile, 'utf8');
  if (msg.includes(EM_DASH)) {
    console.error('commit message: em dash');
    bad++;
  }
}

if (bad > 0) {
  console.error(`\n${bad} em dash(es) found. Use a comma, colon, parentheses or a new sentence instead.`);
  process.exit(1);
}
console.log(`no em dashes in ${files.length} files`);
