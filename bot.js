// bot.js
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const gerarPix = require("./gerarPixMercadoPago");
const store = require("./storage");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

/* =========================================
   IMAGEM DO /start
   Usa media/picture.png (repo) com legenda opcional START_IMAGE_CAPTION
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
    "- 🔥 *15 dias — R$ 5,90*",
    "- ⭐ *30 dias — R$ 9,90*",
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
    "⚠️ *Apenas para maiores de 18 anos.* Nada de conteúdo ilegal ou não consensual.",
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
   Vídeo de introdução
   START_VIDEO pode ser:
   - URL https,
   - file_id do Telegram,
   - caminho local (p.ex.: media/intro.mp4)
   Se não definir START_VIDEO, tenta media/intro.mp4.
========================================= */
function resolveStartVideo() {
  let raw = (process.env.START_VIDEO || "").trim();
  if (!raw) raw = path.resolve(__dirname, "media", "intro.mp4");

  // URL?
  if (/^https?:\/\//i.test(raw)) return raw;

  // Parece um file_id? (sem / ou \)
  if (!raw.includes("/") && !raw.includes("\\")) return raw;

  // Caminho local (resolve relativo)
  const abs = path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw);
  if (!fs.existsSync(abs)) {
    console.warn("Arquivo de vídeo não encontrado:", abs);
    return { missing: abs };
  }
  return fs.createReadStream(abs);
}

/* =========================================
   /start e /planos
   -> /start envia VÍDEO -> IMAGEM -> MENSAGEM
   -> /planos envia VÍDEO -> MENSAGEM (sem imagem)
========================================= */
async function sendStart(chatId, { withImage = false } = {}) {
  try {
    // 1) VÍDEO primeiro
    const videoInput = resolveStartVideo();
    if (videoInput) {
      if (typeof videoInput === "object" && videoInput.missing) {
        await bot.sendMessage(
          chatId,
          "⚠️ Vídeo de introdução não encontrado. Verifique START_VIDEO ou coloque `media/intro.mp4`.",
          { parse_mode: "Markdown" }
        );
      } else {
        try {
          await bot.sendVideo(chatId, videoInput, { supports_streaming: true });
        } catch (e) {
          console.warn("Falha ao enviar vídeo do /start:", e?.response?.data || e?.message);
        }
      }
    }

    // 2) IMAGEM depois do vídeo (apenas no /start)
    if (withImage && HAS_START_IMAGE) {
      try {
        await bot.sendPhoto(chatId, START_IMAGE_PATH, {
          caption: START_IMAGE_CAPTION,
        });
      } catch (e) {
        console.warn("Falha ao enviar imagem do /start:", e?.response?.data || e?.message);
      }
    }

    // 3) Mensagem com os planos
    await bot.sendMessage(chatId, startMessage(), {
      reply_markup: planKeyboard(),
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error("Erro no sendStart:", e);
  }
}

// aceita /start com ou sem payload (ex.: /start 123)
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
    return bot.sendMessage(chatId, `⚠️ Vídeo não encontrado em:\n\`${videoInput.missing}\``, {
      parse_mode: "Markdown",
    });
  }
  try {
    const sent = await bot.sendVideo(chatId, videoInput, { supports_streaming: true });
    await bot.sendMessage(
      chatId,
      "✅ Vídeo enviado! Se quiser agilizar próximas vezes, use este *file_id* no .env:\n\n" +
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
      return bot.sendMessage(
        chatId,
        "ℹ️ Você ainda não tem assinatura.\nEnvie /planos para escolher um plano e gerar seu Pix."
      );
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
      return bot.sendMessage(
        chatId,
        "⏳ Seu pagamento está *pendente* de confirmação. Assim que for aprovado, você receberá o link do VIP.",
        { parse_mode: "Markdown" }
      );
    }
    return bot.sendMessage(
      chatId,
      "⛔ Sua assinatura *expirou* ou foi *cancelada*. Para continuar, escolha um plano em /planos.",
      { parse_mode: "Markdown" }
    );
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
      return bot.sendMessage(chatId, "ℹ️ Você não possui assinatura *ativa* para cancelar.", {
        parse_mode: "Markdown",
      });
    }

    // Marca como cancelado
    store.cancelByChatId(chatId);

    // Remove do canal/grupo (ban + unban para permitir voltar futuramente)
    if (groupId) {
      try {
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/banChatMember`,
          { chat_id: groupId, user_id: chatId, revoke_messages: true }
        );
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/unbanChatMember`,
          { chat_id: groupId, user_id: chatId }
        );
      } catch (e) {
        console.warn("Falha ao remover do canal no cancelamento:", e?.response?.data || e?.message);
      }
    }

    await bot.sendMessage(
      chatId,
      "✅ Sua assinatura foi *cancelada* e o acesso ao VIP foi removido.\nSe quiser voltar, é só escolher um plano em /planos.",
      { parse_mode: "Markdown" }
    );
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

    // 1) Envia o QR (APENAS 1x)
    const qrBuffer = Buffer.from(qr_code_base64, "base64");
    await bot.sendPhoto(chatId, qrBuffer, {
      caption: `📲 Escaneie o QR Code para pagar via Pix.\nPlano: ${planDays} dias (R$ ${amount.toFixed(2)})`,
    });

    // 2) Texto explicativo separado
    await bot.sendMessage(chatId, "💳 Ou copie e cole este código no seu app bancário:");

    // 3) Payload sozinho em bloco de código (MarkdownV2)
    const payload = (qr_code || "").trim();
    await bot.sendMessage(chatId, "```\n" + payload + "\n```", {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });

    await bot.answerCallbackQuery(query.id, { text: "Cobrança gerada!" });
  } catch (err) {
    console.error("Erro no callback buy:", err?.response?.data || err);
    await bot.answerCallbackQuery(query.id, {
      text: "Erro ao gerar Pix. Tente novamente.",
      show_alert: true,
    });
  }
});

/* =========================================
   /idcanal + detector de forward de canal
========================================= */
bot.onText(/\/idcanal/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Encaminhe *qualquer postagem* do seu canal VIP para este chat, que eu respondo com o ID.",
    { parse_mode: "Markdown" }
  );
});

bot.on("message", (msg) => {
  if (msg.forward_from_chat && msg.forward_from_chat.type === "channel") {
    const channelId = msg.forward_from_chat.id; // tipo: -100xxxxxxxxxx
    bot.sendMessage(
      msg.chat.id,
      `✅ ID do canal detectado:\n\`${channelId}\`\n\nColoque isso no .env como TELEGRAM_CHANNEL_ID e reinicie o bot.`,
      { parse_mode: "Markdown" }
    );
  }
});

module.exports = bot;
