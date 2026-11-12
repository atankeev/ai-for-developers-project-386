import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../apps/api/src/auth.js';

if (!process.stdin.isTTY) throw new Error('Run in a terminal for hidden password input');
const hiddenOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});
const terminal = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });
try {
  process.stderr.write('Password (hidden): ');
  const password = await terminal.question('');
  process.stderr.write('\n');
  if (!password) throw new Error('Password is required');
  console.log(hashPassword(password));
} finally {
  terminal.close();
}
