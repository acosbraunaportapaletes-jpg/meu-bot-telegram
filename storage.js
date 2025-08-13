// storage.js — persistência simples em arquivo (para testes)
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// garante pasta
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// carrega/salva
function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: {}, pending: {} }; // estrutura inicial
  }
}
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = load();

/** ====== Funções usadas pelo BOT ====== **/

// salva/atualiza dados de pagamento pendente para um chat
function upsertPending(chatId, data) {
  chatId = String(chatId);
  db.pending[chatId] = { ...(db.pending[chatId] || {}), ...data };
  save();
}

// recupera pendência do chat
function getPending(chatId) {
  return db.pending[String(chatId)];
}

// remove pendência do chat
function removePending(chatId) {
  delete db.pending[String(chatId)];
  save();
}

// obtém dados de assinatura do usuário
function get(chatId) {
  return db.users[String(chatId)];
}

/** ====== Funções usadas pelo WEBHOOK (server.js) ====== **/

// ativa/renova assinatura a partir do external_reference
function activateByReference(reference, startTs, endTs) {
  // reference no formato "<chatId>|P15|<timestamp>" ou "<chatId>|P30|<timestamp>"
  const chatId = Number(String(reference || "").split("|")[0]);
  if (!chatId) return;

  db.users[String(chatId)] = {
    chatId,
    active: true,
    startTs,
    endTs,
    reference,
  };

  // se tinha pendência, remove
  delete db.pending[String(chatId)];
  save();
}

// desativa assinatura por chatId (usado ao expirar)
function deactivateByChatId(chatId) {
  chatId = String(chatId);
  if (db.users[chatId]) {
    db.users[chatId].active = false;
    save();
  }
}

// lista assinaturas expiradas (endTs <= now)
function listExpired(now = Date.now()) {
  const out = [];
  for (const [id, u] of Object.entries(db.users)) {
    if (u && u.active && u.endTs && u.endTs <= now) {
      out.push({ chatId: Number(id), ...u });
    }
  }
  return out;
}

module.exports = {
  // usadas no bot
  upsertPending,
  getPending,
  removePending,
  get,

  // usadas no webhook
  activateByReference,
  deactivateByChatId,
  listExpired,
};
