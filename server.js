// server.js — validação correta do x-signature do Mercado Pago + envio do link VIP
require("dotenv").config();
const express = require("express");
const crypto  = require("crypto");
const axios   = require("axios");
const store   = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;
const VIP_CHAT_ID = process.env.TELEGRAM_CHANNEL_ID; // grupo VIP (bot precisa ser admin)

// Evita processar o mesmo pagamento duas vezes
const processedPayments = new Set();

app.use(express.json());

app.get("/webhook", (req, res) => res.send("OK"));

// --- Utilitário: valida a assinatura do Mercado Pago ---
function validateMPSignature(req) {
  const signature = req.headers["x-signature"] || req.headers["x-meli-signature"];
  const requestId = req.headers["x-request-id"];
  if (!signature || !requestId) {
    throw new Error("Headers de assinatura ausentes");
  }

  // x-signature vem como: ts=172305...,v1=abcdef123...
  const parts = signature.split(",");
  const ts = (parts[0] || "").split("=")[1];
  const v1 = (parts[1] || "").split("=")[1];

  const dataId =
    (req.query && (req.query["data.id"] || req.query.id)) ||
    (req.body && req.body.data && req.body.data.id);

  if (!ts || !v1 || !dataId) {
    throw new Error(`Campos faltando para validação (ts:${ts} v1:${v1} id:${dataId})`);
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  if (expected !== v1) {
    const err = new Error("Assinatura inválida");
    err.details = { expected, v1, manifest };
    throw err;
  }

  return { dataId };
}

app.post("/webhook", async (req, res) => {
  try {
    // 1) Validar assinatura
    const { dataId } = validateMPSignature(req);

    // 2) Processar somente eventos de payment
    const { type } = req.body || {};
    if (type !== "payment") {
      return res.status(200).send("OK");
    }

    const paymentId = String(dataId);
    if (processedPayments.has(paymentId)) {
      return res.status(200).send("OK (dup)");
    }

    // 3) Buscar detalhes do pagamento
    const { data: payment } = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    console.log(`Pagamento ${paymentId} => ${payment.status}`);

    if (payment.status === "approved") {
      processedPayments.add(paymentId);

      const ext = payment.external_reference || "";
      // Formato gerado no bot: "<chatId>|P15|<timestamp>" ou "<chatId>|P30|<timestamp>"
      let chatId, planDays = 30;
      if (ext && ext.includes("|")) {
        const [chatIdStr, planCode] = ext.split("|");
        chatId = Number(chatIdStr);
        planDays = (planCode && planCode.includes("P15")) ? 15 : 30;
      } else {
        // fallback para versões antigas que só enviavam chatId
        chatId = Number(ext || payment.metadata?.chat_id);
      }

      if (chatId) {
        const startTs = Date.now();
        const endTs = startTs + planDays * 24 * 60 * 60 * 1000;

        // ativa/atualiza no "banco"
        await store.activateByReference(ext || `${chatId}|P${planDays}`, startTs, endTs);

        const text =
          `✅ Pagamento aprovado!
` +
          `Plano: ${planDays} dias
` +
          `Válido até: ${new Date(endTs).toLocaleString()}

` +
          `Clique para entrar no grupo VIP:`;

        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [[{ text: "Entrar no Grupo VIP", url: process.env.VIP_LINK }]],
            },
          }
        );
      } else {
        console.warn("Não consegui definir o chatId a partir do external_reference:", ext);
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.warn("Falha na validação do webhook:", err.details || err.message);
    // Para testes, você pode trocar para 200 para não perder eventos:
    return res.sendStatus(401);
  }
});

// --- Job para expirar planos (a cada 5 minutos) ---
setInterval(async () => {
  try {
    if (!process.env.TELEGRAM_CHANNEL_ID) return;
    const now = Date.now();
    const expirados = store.listExpired(now);
    for (const u of expirados) {
      try {
        // remover do grupo (bot precisa ser admin)
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/banChatMember`,
          { chat_id: VIP_CHAT_ID, user_id: u.chatId, revoke_messages: true }
        );
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          { chat_id: u.chatId, text: "⛔ Seu plano VIP expirou. Para continuar, renove em /planos." }
        );
      } catch (e) {
        console.warn("Falha ao remover do grupo (bot é admin?):", e.response?.data || e.message);
      } finally {
        store.deactivateByChatId(u.chatId);
      }
    }
    if (expirados.length) {
      console.log(`Expiraram ${expirados.length} assinaturas e foram processadas.`);
    }
  } catch (e) {
    console.error("Erro no job de expiração:", e);
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => console.log(`🚀 Servidor de webhook ouvindo na porta ${PORT}`));
