// storage.js — persistência simples em arquivo com migração de users.json
const fs = require("fs");
const path = require("path");

// Preferir disco montado (Render Disk) em /data, senão cai para ./data
function ensureDataDir() {
  const candidates = [process.env.DATA_DIR, "/data", path.join(__dirname, "data")].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {}
  }
  // último recurso: pasta local
  const local = path.join(__dirname, "data");
  if (!fs.existsSync(local)) fs.mkdirSync(local, { recursive: true });
  return local;
}

const DATA_DIR = ensureDataDir();
const DB_FILE = path.join(DATA_DIR, "db.json");
let db = load();

// ---- carrega/salva ----
function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: {}, pending: {} };
  }
}
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---- migração automática de users.json (array) para db.users ----
function migrateLegacyUsersJson() {
  try {
    const legacyPath = path.join(__dirname, "users.json");
    if (!fs.existsSync(legacyPath)) return;

    const arr = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    if (!Array.isArray(arr) || arr.length === 0) return;

    // escolhe, por chatId, o registro "mais novo"
    const byChat = new Map();
    for (const r of arr) {
      if (!r || !r.chatId) continue;
      const key = String(r.chatId);
      const prev = byChat.get(key);
      const score =
        (r.activatedAt ?? 0) * 2 + // dá mais peso para activatedAt
        (r.createdAt ?? 0) +
        (r.expiresAt ?? 0);
      const prevScore =
        (prev?.activatedAt ?? 0) * 2 + (prev?.createdAt ?? 0) + (prev?.expiresAt ?? 0);
      if (!prev || score > prevScore) byChat.set(key, r);
    }

    const now = Date.now();
    for (const [key, r] of byChat.entries()) {
      db.users[key] = {
        chatId: Number(key),
        active: !!(r.expiresAt && r.expiresAt > now),
        startTs: r.activatedAt || r.createdAt || now,
        endTs: r.expiresAt || now,
        reference: r.external_reference || "",
      };
    }
    save();
    console.log(`[storage] Migrated ${byChat.size} user(s) from legacy users.json → ${DB_FILE}`);
  } catch (e) {
    console.warn("[storage] Migration from users.json failed:", e.message);
  }
}

// roda migração na primeira carga se banco “vazio”
if (Object.keys(db.users || {}).length === 0) {
  migrateLegacyUsersJson();
  db = load(); // recarrega após migração
}

/** ====== Funções usadas pelo BOT ====== **/

// salva/atualiza dados de pagamento pendente para um chat
function upsertPending(chatId, data) {
  const k = String(chatId);
  db.pending[k] = { ...(db.pending[k] || {}), ...data };
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

// desativa assinatura por chatId (usado ao cancelar/expirar)
function deactivateByChatId(chatId) {
  const k = String(chatId);
  if (db.users[k]) {
    db.users[k].active = false;
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
  // bot
  upsertPending,
  getPending,
  removePending,
  get,

  // webhook/server
  activateByReference,
  deactivateByChatId,
  listExpired,

  // util
  DATA_DIR,
  DB_FILE,
};
