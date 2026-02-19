const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("WhatsApp conectado 🚀");

      const groups = await sock.groupFetchAllParticipating();

      console.log("\n=== LISTA DE GRUPOS ===\n");

      Object.values(groups).forEach((g) => {
        console.log("Nome:", g.subject);
        console.log("ID:", g.id);
        console.log("----------------------");
      });

      process.exit(0);
    }
  });
}

start();