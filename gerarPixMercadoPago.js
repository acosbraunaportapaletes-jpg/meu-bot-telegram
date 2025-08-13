require("dotenv").config();
const axios = require("axios");

/**
 * Gera uma cobrança Pix e retorna QR code e base64.
 * @param {number} amount - Valor da cobrança em reais.
 * @param {string} reference - Referência externa (ex: chatId).
 * @param {number} expiration_seconds - Tempo de expiração (padrão 24h).
 */
async function gerarPix(amount, reference = "", expiration_seconds = 86400) {
  const paymentData = {
    transaction_amount: amount,
    description: `Acesso VIP 30 dias: R$${amount}`,
    payment_method_id: "pix",
    payer: {
      email: process.env.PAYER_EMAIL || "payer@example.com"
    },
    external_reference: reference,
    date_of_expiration: new Date(Date.now() + expiration_seconds * 1000).toISOString()
  };

  // Gera uma chave idempotency única para evitar duplicação
  const idempotencyKey = `pix_${reference}_${Date.now()}`;

  const resp = await axios.post(
    "https://api.mercadopago.com/v1/payments",
    paymentData,
    {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey
      }
    }
  );

  const tx = resp.data.point_of_interaction.transaction_data;
  return {
    qr_code: tx.qr_code,
    qr_code_base64: tx.qr_code_base64
  };
}

module.exports = gerarPix;
