const TelegramBot = require('node-telegram-bot-api');
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const tgChatId = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(tgToken, { polling: false });

const sendTelegramMessage = (message, options = {}) =>
  bot.sendMessage(tgChatId, message, options);

const sendMessage = (message, options = {}) => {
  if (tgToken && tgChatId) {
    sendTelegramMessage(message, options);
  }
};

module.exports = {
  sendMessage,
  sendTelegramMessage,
};
