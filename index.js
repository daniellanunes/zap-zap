const { Client, GatewayIntentBits } = require("discord.js");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN env var");
if (!CHANNEL_ID) throw new Error("Missing CHANNEL_ID env var");
if (!WHATSAPP_GROUP_ID) throw new Error("Missing WHATSAPP_GROUP_ID env var");

let waSock = null;

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  waSock = makeWASocket({
    auth: state,
    browser: ["Windows", "Chrome", "120"],
  });

  waSock.ev.on("creds.update", saveCreds);

  waSock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection) console.log("WA status:", connection);

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("WA closed. statusCode:", statusCode || "unknown");

      // 401 = sessão removida/deslogada. Não adianta reconectar em loop.
      if (statusCode === 401) {
        console.log("⚠️ WhatsApp deslogou/removeu o device (401). Apague a pasta auth e pareie de novo.");
        process.exit(1);
      }

      // Outros motivos: tenta reconectar
      setTimeout(() => {
        startWhatsApp().catch((e) => console.error("Restart WA failed:", e?.message || e));
      }, 2000);
    }
  });

  return waSock;
}

function buildTextFromDiscordMessage(msg) {
  const parts = [];

  const content = (msg.content || "").trim();
  if (content) parts.push(content);

  // Se tiver embeds (ex: webhook de notícias), pega título + url
  if (msg.embeds?.length) {
    for (const e of msg.embeds) {
      const title = e.title ? String(e.title).trim() : "";
      const url = e.url ? String(e.url).trim() : "";
      const desc = e.description ? String(e.description).trim() : "";
      const line = [title, url, desc].filter(Boolean).join("\n");
      if (line) parts.push(line);
    }
  }

  // Se tiver anexos, manda links
  if (msg.attachments?.size) {
    for (const a of msg.attachments.values()) {
      if (a.url) parts.push(a.url);
    }
  }

  // Remove duplicados
  return Array.from(new Set(parts)).join("\n\n").trim();
}

async function startDiscord() {
  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  discord.once("ready", () => {
    console.log(`Discord online ✅ ${discord.user.tag}`);
    console.log("Listening CHANNEL_ID:", CHANNEL_ID);
    console.log("Sending to WHATSAPP_GROUP_ID:", WHATSAPP_GROUP_ID);
  });

  discord.on("messageCreate", async (msg) => {
    // só o canal certo
    if (msg.channelId !== CHANNEL_ID) return;

    // evita loop: ignora mensagens do PRÓPRIO bot
    if (msg.author?.id === discord.user?.id) return;

    // ✅ permite mensagens de webhook (rss), mas ignora outros bots “normais”
    // (webhookId existe quando a mensagem veio de webhook)
    if (msg.author?.bot && !msg.webhookId) return;

    const text = (msg.content || "").trim();
    if (!text) return;

    if (!waSock) {
      console.log("WA socket not ready yet…");
      return;
    }

    try {
      await waSock.sendMessage(WHATSAPP_GROUP_ID, { text });
      console.log("Enviado para WhatsApp 🚀");
    } catch (e) {
      console.error("Falha ao enviar no WA:", e?.message || e);
    }
  });

  await discord.login(DISCORD_TOKEN);
}

async function main() {
  await startWhatsApp();
  await startDiscord();
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exit(1);
});