// storage.js - persistência simples em arquivo JSON (users.json)
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'users.json');

// garante arquivo
function ensure() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
  }
}
function readDB() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { users: [] };
  }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function activateByReference(reference, startTs, endTs) {
  const chatId = Number(String(reference || '').split('|')[0]); // "<chatId>|P15|..."
  if (!chatId) return;

  const db = readDB();
  const i = db.users.findIndex(u => u.chatId === chatId);
  const rec = { chatId, reference, startTs, endTs };

  if (i >= 0) db.users[i] = { ...db.users[i], ...rec };
  else db.users.push(rec);

  writeDB(db);
}

function listExpired(now = Date.now()) {
  const db = readDB();
  return db.users.filter(u => u.endTs && u.endTs <= now);
}

function deactivateByChatId(chatId) {
  const db = readDB();
  db.users = db.users.filter(u => u.chatId !== Number(chatId));
  writeDB(db);
}

module.exports = {
  activateByReference,
  listExpired,
  deactivateByChatId,
};
