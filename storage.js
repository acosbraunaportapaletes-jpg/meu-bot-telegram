const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "users.json");

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const txt = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(txt || "[]");
  } catch (e) {
    console.error("Erro ao ler DB:", e);
    return [];
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Erro ao escrever DB:", e);
  }
}

/** Salva/atualiza uma cobrança pendente */
async function upsertPending(record) {
  const db = readDB();
  const filtered = db.filter((r) => r.external_reference !== record.external_reference);
  filtered.push(record);
  writeDB(filtered);
}

/** Marca como ativo após pagamento aprovado */
async function activateByReference(external_reference, startTs, endTs) {
  const db = readDB();
  const idx = db.findIndex((r) => r.external_reference === external_reference);
  if (idx >= 0) {
    db[idx].status = "active";
    db[idx].activatedAt = startTs;
    db[idx].expiresAt = endTs || db[idx].expiresAt;
    writeDB(db);
    return db[idx];
  }
  return null;
}

/** Retorna todos que já venceram até nowTs */
function listExpired(nowTs) {
  const db = readDB();
  return db.filter((r) => r.status === "active" && r.expiresAt && r.expiresAt <= nowTs);
}

/** Marca como expirado por chatId */
function deactivateByChatId(chatId) {
  const db = readDB();
  let changed = false;
  for (const r of db) {
    if (r.chatId === chatId && r.status === "active") {
      r.status = "expired";
      changed = true;
    }
  }
  if (changed) writeDB(db);
}

/** Cancela imediatamente a assinatura ativa do chatId */
function cancelByChatId(chatId) {
  const db = readDB();
  let changed = false;
  for (const r of db) {
    if (r.chatId === chatId && r.status === "active") {
      r.status = "canceled";
      r.expiresAt = Date.now(); // efetiva agora
      changed = true;
    }
  }
  if (changed) writeDB(db);
  return changed;
}

/** Busca o último registro (mais recente) do usuário */
function findLatestByChatId(chatId) {
  const db = readDB().filter((r) => r.chatId === chatId);
  if (!db.length) return null;
  db.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return db[0];
}

module.exports = {
  upsertPending,
  activateByReference,
  listExpired,
  deactivateByChatId,
  cancelByChatId,
  findLatestByChatId,
};
