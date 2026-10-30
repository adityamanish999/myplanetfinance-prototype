'use strict';

// Generates ADMIN_PASSWORD_HASH for .env. The password is read from the
// terminal and never written to disk or shell history.
const readline = require('node:readline');
const { hashPassword } = require('../server/admin/adminAuth');

const MIN_LENGTH = 12;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

// Hide typed characters.
rl._writeToOutput = function writeToOutput(text) {
  if (text.includes('password')) rl.output.write(text);
};

rl.question('Choose an admin password (min 12 characters): ', (password) => {
  rl.close();
  process.stdout.write('\n');
  if (password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  console.log('\nAdd this line to your .env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
});
