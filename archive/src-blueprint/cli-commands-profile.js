const fs = require('fs/promises');
const path = require('path');
const { manager: profile } = require('../../identity');
const bus = require('../../core/command-bus');

function userDir() {
  return path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia', 'users');
}

const pm = require('../../identity/profile');

bus.register('profile.update', async (command) => {
  const users = await fs.readdir(userDir());
  if (!users.length) {
    throw new Error('No identity');
  }

  return pm.update(path.join(userDir(), users[0]), command.data);
});

bus.register('profile.show', async () => {
  const users = await fs.readdir(userDir());
  if (!users.length) {
    throw new Error('No identity');
  }

  const file = path.join(userDir(), users[0], 'profile.json');
  return JSON.parse(await fs.readFile(file, 'utf8'));
});