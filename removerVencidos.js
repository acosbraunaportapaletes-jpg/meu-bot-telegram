const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const usersPath = path.join(__dirname, 'users.json');

// Carrega usuários
function carregarUsuarios() {
  try {
    const data = fs.readFileSync(usersPath);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Salva usuários
function salvarUsuarios(usuarios) {
  fs.writeFileSync(usersPath, JSON.stringify(usuarios, null, 2));
}

async function removerUsuariosVencidos() {
  const hoje = new Date();
  const usuarios = carregarUsuarios();
  const ativos = [];

  for (const user of usuarios) {
    const dataVencimento = new Date(user.vencimento);

    if (dataVencimento < hoje) {
      try {
        await bot.sendMessage(user.id, `⚠️ Seu acesso VIP venceu em ${user.vencimento}. Caso queira renovar, basta realizar um novo pagamento.`);
        await bot.banChatMember(process.env.TELEGRAM_CHANNEL_ID, user.id);
        await bot.unbanChatMember(process.env.TELEGRAM_CHANNEL_ID, user.id); // Remove sem bloquear permanentemente
        console.log(`🔴 Usuário removido do canal: ${user.nome} (${user.id})`);
      } catch (err) {
        console.error(`Erro ao remover ${user.nome} (${user.id}):`, err.message);
      }
    } else {
      ativos.push(user);
    }
  }

  salvarUsuarios(ativos);
  console.log('✅ Remoção de vencidos finalizada.');
}

removerUsuariosVencidos();
