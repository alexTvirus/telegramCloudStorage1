import TelegramBot from "node-telegram-bot-api";
import { runTelegramRequest } from "./telegramQueue";

// Memoized bots for optimization
const cachedBots: { [token: string]: TelegramBot } = {};
const getMemoizedBot = (token: string) => {
  if (!cachedBots[token]) {
    cachedBots[token] = new TelegramBot(token);
  }
  return cachedBots[token];
};

export const uploadDocument = (data, fileName, token, chatId) => {
  const bot = getMemoizedBot(token);
  return runTelegramRequest(token, () =>
    bot.sendDocument(
      chatId,
      data,
      {},
      {
        filename: fileName,
        contentType: "application/octet-stream",
      }
    )
  );
};

export const removeDocument = (messageId, token, chatId) => {
  const bot = getMemoizedBot(token);
  return runTelegramRequest(token, () => bot.deleteMessage(chatId, messageId));
};

export const downloadDocument = async (fileId, token) => {
  const bot = getMemoizedBot(token);
  const file = await runTelegramRequest(token, () => bot.getFile(fileId));
  return file.file_path;
};

export const getDownloadURL = (fileName, token) => {
  return `https://api.telegram.org/file/bot${token}/${fileName}`;
};
