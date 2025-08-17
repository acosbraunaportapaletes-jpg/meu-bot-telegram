// bot.js
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const gerarPix = require("./gerarPixMercadoPago");
const store = require("./storage");
const cron = require("node-cron");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ===== Cooldown (respiro) por usuário: default 3h, pode mudar com env MIN_GAP_MS =====
const MIN_GAP_MS = Number(process.env.MIN_GAP_MS || 3 * 60 * 60 * 1000);

/* =========================================
   IMAGEM DO /start
========================================= */
const START_IMAGE_PATH = path.join(__dirname, "media", "picture.png");
const HAS_START_IMAGE = fs.existsSync(START_IMAGE_PATH);
const START_IMAGE_CAPTION =
  process.env.START_IMAGE_CAPTION ||
  "🔥 Acesso VIP — pague no Pix e receba o link automaticamente!";

/* =========================================
   Comandos de menu ("/")
========================================= */
(async () => {
  try {
    await bot.setMyCommands([
      { command: "start",    description: "Ver vídeo, planos e gerar Pix" },
      { command: "planos",   description: "Ver planos disponíveis" },
      { command: "status",   description: "Consultar sua assinatura" },
      { command: "cancelar", description: "Cancelar sua assinatura agora" },
      { command: "videotest",description: "Testar envio do vídeo do /start" },
      { command: "idcanal",  description: "Descobrir o ID numérico do canal" }
    ]);
  } catch (e) {
    console.warn("Falha ao registrar comandos:", e.message);
  }
})();

/* =========================================
   Helpers de UI
========================================= */
function planKeyboard() {
  const p15 = Number(process.env.PLAN_15_PRICE || 5.90).toFixed(2);
  const p30 = Number(process.env.PLAN_30_PRICE || 9.90).toFixed(2);
  return {
    inline_keyboard: [
      [{ text: `🔥 Plano 15 dias — R$ ${p15}`, callback_data: "buy:15" }],
      [{ text: `⭐ Plano 30 dias — R$ ${p30}`, callback_data: "buy:30" }],
    ],
  };
}

function startMessage() {
  const lines = [
    "😈⚡️🔥 *Tenha acesso ao nosso VIP em um só lugar.*",
    "",
    "🟢 *PLANOS*",
    `- 🔥 *15 dias — R$ ${Number(process.env.PLAN_15_PRICE || 5.90).toFixed(2)}*`,
    `- ⭐ *30 dias — R$ ${Number(process.env.PLAN_30_PRICE || 9.90).toFixed(2)}*`,
    "",
    "📦 *Você terá acesso a:*",
    "✅ Conteúdos completos de Famosas (Pr1v4cy e @nlyf4n$",
    "✅ 1NC3ST0",
    "✅ F4mos4s V4z4d4s",
    "✅ Virg3n$",
    "✅ Am4dores",
    "✅ C4mer4 Esc0nd1d4",
    "✅ Fl4gr4s de Tr4içã0",
    "✅ B0quetes n4 s4l4 de 4ul4",
    "✅ Reb0l4nd0 Funk Pel4dinh4",
    "✅ Compra *100% segura*",
    "✅ *Acesso instantâneo* após confirmação",
    "",
    "💳 *Como pagar:*",
    "Escolha um dos planos abaixo para *gerar o Pix* (QR Code + Copia e Cola).",
    "",
    "⚠️ *Apenas para maiores de 18 anos.*",
  ];
  return lines.join("\n");
}

function formatRemaining(ms) {
  if (ms <= 0) return "expirado";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / (3600 * 24));
  const hours = Math.floor((total % (3600 * 24)) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || (!days && !hours)) parts.push(`${mins}m`);
  return parts.join(" ");
}

/* =========================================
   Vídeo de introdução do /start
========================================= */
function resolveStartVideo() {
  let raw = (process.env.START_VIDEO || "").trim();
  if (!raw) raw = path.resolve(__dirname, "media", "intro.mp4");
  if (/^https?:\/\//i.test(raw)) return raw;        // URL
  if (!raw.includes("/") && !raw.includes("\\")) return raw; // file_id
  const abs = path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw);
  if (!fs.existsSync(abs)) {
    console.warn("Arquivo de vídeo não encontrado:", abs);
    return { missing: abs };
  }
  return fs.createReadStream(abs);
}

/* =========================================
   /start e /planos
   -> /start: VÍDEO -> IMAGEM -> MENSAGEM
   -> /planos: VÍDEO -> MENSAGEM
========================================= */
async function sendStart(chatId, { withImage = false } = {}) {
  try {
    // 1) VÍDEO
    const videoInput = resolveStartVideo();
    if (videoInput) {
      if (typeof videoInput === "object" && videoInput.missing) {
        await bot.sendMessage(
          chatId,
          "⚠️ Vídeo de introdução não encontrado. Verifique START_VIDEO ou coloque `media/intro.mp4`.",
          { parse_mode: "Markdown" }
        );
      } else {
        try { await bot.sendVideo(chatId, videoInput, { supports_streaming: true }); }
        catch (e) { console.warn("Falha ao enviar vídeo do /start:", e?.response?.data || e?.message); }
      }
    }

    // 2) IMAGEM (apenas /start)
    if (withImage && HAS_START_IMAGE) {
      try {
        await bot.sendPhoto(chatId, START_IMAGE_PATH, { caption: START_IMAGE_CAPTION });
      } catch (e) {
        console.warn("Falha ao enviar imagem do /start:", e?.response?.data || e?.message);
      }
    }

    // 3) TEXTO + BOTÕES
    await bot.sendMessage(chatId, startMessage(), {
      reply_markup: planKeyboard(),
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error("Erro no sendStart:", e);
  }
}

// aceita /start com ou sem payload
bot.onText(/^\/start/, (msg) => sendStart(msg.chat.id, { withImage: true }));
bot.onText(/^\/planos$/, (msg) => sendStart(msg.chat.id, { withImage: false }));

/* =========================================
   /videotest
========================================= */
bot.onText(/\/videotest/, async (msg) => {
  const chatId = msg.chat.id;
  const videoInput = resolveStartVideo();
  if (!videoInput) {
    return bot.sendMessage(chatId, "ℹ️ START_VIDEO não está configurado no .env e `media/intro.mp4` não foi encontrado.");
  }
  if (typeof videoInput === "object" && videoInput.missing) {
    return bot.sendMessage(chatId, `⚠️ Vídeo não encontrado em:\n\`${videoInput.missing}\``, { parse_mode: "Markdown" });
  }
  try {
    const sent = await bot.sendVideo(chatId, videoInput, { supports_streaming: true });
    await bot.sendMessage(
      chatId,
      "✅ Vídeo enviado! Para agilizar próximas vezes, use este *file_id* no .env:\n\n" +
        "`START_VIDEO=" + (sent.video?.file_id || "N/A") + "`",
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(chatId, "❌ Não consegui enviar o vídeo. Veja os logs.");
    console.error("Erro no /videotest:", e?.response?.data || e?.message);
  }
});

/* =========================================
   /status
========================================= */
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const rec = await store.findLatestByChatId(chatId);
    if (!rec) {
      return bot.sendMessage(chatId, "ℹ️ Você ainda não tem assinatura.\nEnvie /planos para escolher um plano e gerar seu Pix.");
    }
    if (rec.status === "active") {
      const rest = rec.expiresAt - Date.now();
      const vence = new Date(rec.expiresAt).toLocaleString();
      return bot.sendMessage(
        chatId,
        `✅ *Assinatura ativa*.\nPlano: ${rec.planDays} dias\nVence em: *${vence}* (${formatRemaining(rest)} restantes)`,
        { parse_mode: "Markdown" }
      );
    }
    if (rec.status === "pending") {
      return bot.sendMessage(chatId, "⏳ Seu pagamento está *pendente* de confirmação. Assim que for aprovado, você receberá o link do VIP.", { parse_mode: "Markdown" });
    }
    return bot.sendMessage(chatId, "⛔ Sua assinatura *expirou* ou foi *cancelada*. Para continuar, escolha um plano em /planos.", { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Erro no /status:", e);
    bot.sendMessage(chatId, "❌ Não consegui consultar sua assinatura agora. Tente novamente.");
  }
});

/* =========================================
   /cancelar
========================================= */
bot.onText(/\/cancelar|\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  const groupId = process.env.TELEGRAM_CHANNEL_ID;
  try {
    const rec = await store.findLatestByChatId(chatId);
    if (!rec || rec.status !== "active") {
      return bot.sendMessage(chatId, "ℹ️ Você não possui assinatura *ativa* para cancelar.", { parse_mode: "Markdown" });
    }

    store.cancelByChatId(chatId);

    if (groupId) {
      try {
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/banChatMember`,
          { chat_id: groupId, user_id: chatId, revoke_messages: true });
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/unbanChatMember`,
          { chat_id: groupId, user_id: chatId });
      } catch (e) {
        console.warn("Falha ao remover do canal no cancelamento:", e?.response?.data || e?.message);
      }
    }

    await bot.sendMessage(chatId, "✅ Sua assinatura foi *cancelada* e o acesso ao VIP foi removido.\nSe quiser voltar, é só escolher um plano em /planos.", { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Erro no /cancelar:", e);
    bot.sendMessage(chatId, "❌ Não consegui cancelar agora. Tente novamente em instantes.");
  }
});

/* =========================================
   Compra (callback dos botões)
========================================= */
bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const data = query.data || "";
    if (!data.startsWith("buy:")) return;

    const planDays = data.split(":")[1] === "15" ? 15 : 30;
    const amount =
      planDays === 15
        ? Number(process.env.PLAN_15_PRICE || 5.90)
        : Number(process.env.PLAN_30_PRICE || 9.90);

    const reference = `${chatId}|P${planDays}|${Date.now()}`;
    const expiresAt = Date.now() + planDays * 24 * 60 * 60 * 1000;

    const { qr_code, qr_code_base64 } = await gerarPix(amount, reference);

    await store.upsertPending({
      chatId,
      planDays,
      amount,
      external_reference: reference,
      expiresAt,
      status: "pending",
      createdAt: Date.now(),
    });

    const qrBuffer = Buffer.from(qr_code_base64, "base64");
    await bot.sendPhoto(chatId, qrBuffer, {
      caption: `📲 Escaneie o QR Code para pagar via Pix.\nPlano: ${planDays} dias (R$ ${amount.toFixed(2)})`,
    });

    await bot.sendMessage(chatId, "💳 Ou copie e cole este código no seu app bancário:");
    const payload = (qr_code || "").trim();
    await bot.sendMessage(chatId, "```\n" + payload + "\n```", {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });

    await bot.answerCallbackQuery(query.id, { text: "Cobrança gerada!" });
  } catch (err) {
    console.error("Erro no callback buy:", err?.response?.data || err);
    await bot.answerCallbackQuery(query.id, { text: "Erro ao gerar Pix. Tente novamente.", show_alert: true });
  }
});

/* =========================================
   recipients.json helpers (com cooldown por usuário)
========================================= */
const RECIP_PATH = path.join(__dirname, "recipients.json");
function readRecipients() {
  try {
    const d = JSON.parse(fs.readFileSync(RECIP_PATH, "utf-8"));
    // compat versões antigas (lastStartAt) -> lastPushAt
    const lastPushAt = d.lastPushAt || d.lastStartAt || {};
    return { chat_ids: d.chat_ids || [], lastPushAt };
  } catch {
    return { chat_ids: [], lastPushAt: {} };
  }
}
function saveRecipients(data) {
  const uniq = [...new Set(data.chat_ids)];
  fs.writeFileSync(
    RECIP_PATH,
    JSON.stringify({ chat_ids: uniq, lastPushAt: data.lastPushAt || {} }, null, 2)
  );
}
function touchRecipient(chatId) {
  const data = readRecipients();
  if (!data.chat_ids.includes(chatId)) {
    data.chat_ids.push(chatId);
    saveRecipients(data);
  }
}
function canSendNow(chatId) {
  const d = readRecipients();
  const last = d.lastPushAt?.[String(chatId)] || 0;
  return (Date.now() - last) >= MIN_GAP_MS;
}
function markPushed(chatId) {
  const d = readRecipients();
  d.lastPushAt[String(chatId)] = Date.now();
  saveRecipients(d);
}

/* =========================================
   /idcanal + detector de forward de canal
   + captura recipients
========================================= */
bot.onText(/\/idcanal/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Encaminhe *qualquer postagem* do seu canal VIP para este chat, que eu respondo com o ID.",
    { parse_mode: "Markdown" }
  );
});

bot.on("message", (msg) => {
  if (msg && msg.chat && msg.chat.id) touchRecipient(msg.chat.id);

  if (msg.forward_from_chat && msg.forward_from_chat.type === "channel") {
    const channelId = msg.forward_from_chat.id;
    bot.sendMessage(
      msg.chat.id,
      `✅ ID do canal detectado:\n\`${channelId}\`\n\nColoque isso no .env como TELEGRAM_CHANNEL_ID e reinicie o bot.`,
      { parse_mode: "Markdown" }
    );
  }
});

/* =========================================
   BROADCAST DIÁRIO (12:30 nudge, 18h TARDE, 22h NOITE) + cooldown
========================================= */
const DOW = ["DOMINGO","SEGUNDA","TERÇA","QUARTA","QUINTA","SEXTA","SABADO"];

function mediaPathFor(dayName, period /* "TARDE"|"NOITE" */) {
  return path.join(__dirname, "media", `${dayName} ${period}.mp4`);
}

// Legendas +18 neutras/consensuais; personalize se quiser
const CAPTIONS = {
  "SEGUNDA_TARDE": "🎬 Segunda 18h — Teaser VIP do dia: Tia deixou os pr1mos sozinhos e eles não se aguentaram se pegaram no banho sem cam1s1nha. 😉",
  "SEGUNDA_NOITE": "🌙 Segunda 22h — T1o viu sobr1nha se tr0cando e não se aguentou. 🔥",
  "TERÇA_TARDE":   "🎬 Terça 18h — Foi chamar o amigo pra jogar e acabou comendo a namorada dele no pelo. ✨",
  "TERÇA_NOITE":   "🌙 Terça 22h — Edição noturna: Pr1mos foram assistir filme e a pr1ma curiosa achou o que queria. 😈",
  "QUARTA_TARDE":  "🎬 Quarta 18h — Aquecimento da metade da semana. 💫",
  "QUARTA_NOITE":  "🌙 Quarta 22h — Noite VIP: Aluna realiza sonho do am1go que era tranz@r na sala  de aula. 💥",
  "QUINTA_TARDE":  "🎬 Quinta 18h — Pr1m1nha mostrando pro pr1mo que perdeu o cabac1nho. ⚡",
  "QUINTA_NOITE":  "🌙 Quinta 22h — Esquenta do VIP: T1a foi no mercado e deixou os dois pr1mos sozinhos não teve outra foi Jorrada dentro. 🔥",
  "SEXTA_TARDE":   "🎬 Sexta 18h — Começou o fds: Sobr1nha mostrando para o t1o o que aprendeu a fazer. 🥳",
  "SEXTA_NOITE":   "🌙 Sexta 22h — Noite oficial: Depois de um dia trabalhando pr1minha vem deixar o pr1mo calminho. 😏",
  "SABADO_TARDE":  "🎬 Sábado 18h — Tarde VIP: T1o vê a sobr1nha moscando não pensa duas vezes é no fundo sem choro. 🚀",
  "SABADO_NOITE":  "🌙 Sábado 22h — Comeu aluna no banheiro da quadra sem cam1s1nha. 👑",
  "DOMINGO_TARDE": "🎬 Domingo 18h — Pr1ma não queriar perder o cabac1nho então foi na portinha de trás. 🧩",
  "DOMINGO_NOITE": "🌙 Domingo 22h — Último drop da semana: Pr1m1nha 1nocente tomou banho e ja recebeu o le1te. 🛋️",
};

async function broadcastFile(filePath, caption) {
  const { chat_ids } = readRecipients();
  if (!chat_ids.length) return;
  for (const id of chat_ids) {
    if (!canSendNow(id)) continue; // respeita cooldown 3h
    try {
      await bot.sendVideo(id, fs.createReadStream(filePath), {
        caption,
        supports_streaming: true,
      });
      markPushed(id);
    } catch (e) {
      console.warn("Falha ao enviar para", id, e?.response?.data || e?.message);
    }
    await new Promise(r => setTimeout(r, 350)); // rate limit básico
  }
}

async function runScheduled(period /* "TARDE"|"NOITE" */) {
  const now = new Date();
  const dayName = DOW[now.getDay()]; // 0=DOMINGO...6=SABADO
  const file = mediaPathFor(dayName, period);
  if (!fs.existsSync(file)) {
    console.warn("Arquivo não encontrado para", dayName, period, "->", file);
    return;
  }
  const key = `${dayName}_${period}`;
  const caption = CAPTIONS[key] || `🎥 VIP ${dayName} ${period}`;
  await broadcastFile(file, caption);
}

// Nudge 12:30: manda /start só para não-ativos (pending <6h pula) + cooldown
async function nudgeStartMidday() {
  const { chat_ids } = readRecipients();
  for (const id of chat_ids) {
    // filtro de status
    let pode = true;
    try {
      const rec = await store.findLatestByChatId(id);
      if (rec) {
        if (rec.status === "active") pode = false;
        if (rec.status === "pending") {
          const age = Date.now() - (rec.createdAt || Date.now());
          if (age < 6 * 60 * 60 * 1000) pode = false;
        }
      }
    } catch {}
    if (!pode) continue;
    if (!canSendNow(id)) continue;

    try {
      await sendStart(id, { withImage: true }); // vídeo -> imagem -> texto
      markPushed(id);
    } catch (e) {
      console.warn("Falha ao enviar /start 12:30 para", id, e?.response?.data || e?.message);
    }
    await new Promise(r => setTimeout(r, 350));
  }
}

// Agendas (timezone Brasil)
const tz = process.env.TZ || "America/Sao_Paulo";
cron.schedule("30 12 * * *", () => nudgeStartMidday(), { timezone: tz }); // 12:30
cron.schedule("0 18 * * *",  () => runScheduled("TARDE"), { timezone: tz }); // 18:00
cron.schedule("0 22 * * *",  () => runScheduled("NOITE"), { timezone: tz }); // 22:00

// Comandos manuais de teste
bot.onText(/^\/test_1230$/, async (msg) => { await nudgeStartMidday(); });
bot.onText(/^\/test_1800$/, async (msg) => { await runScheduled("TARDE"); });
bot.onText(/^\/test_2200$/, async (msg) => { await runScheduled("NOITE"); });

module.exports = bot;
