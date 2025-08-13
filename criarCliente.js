require('dotenv').config();
const axios = require('axios');

async function gerarPixMercadoPago(valor, nome, cpf = '12345678909', email = 'cliente@fake.com') {
  try {
    const response = await axios.post(
      'https://api.mercadopago.com/v1/payments',
      {
        transaction_amount: valor,
        description: `Plano VIP - R$${valor}`,
        payment_method_id: 'pix',
        payer: {
          email,
          first_name: nome,
          identification: {
            type: 'CPF',
            number: cpf
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const info = response.data.point_of_interaction.transaction_data;

    return {
      valor,
      pixCopiaECola: info.qr_code,
      qrCodeBase64: info.qr_code_base64,
      paymentId: response.data.id
    };
  } catch (error) {
    console.error("❌ Erro ao gerar Pix no Mercado Pago:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = gerarPixMercadoPago;
