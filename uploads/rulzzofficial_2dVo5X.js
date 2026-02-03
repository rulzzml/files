//#Julzz2ND
//Aku sayang kalian semua
require("./setting.js") 
const { Telegraf, Markup } = require('telegraf')
const fs = require('fs')
const axios = require('axios')
const moment = require("moment-timezone")

// --- Gausah di apa2in nanti jadi emror demo ke gw lagi ---
let db = JSON.parse(fs.readFileSync('./database.json'))
setInterval(() => {
    fs.writeFileSync('./database.json', JSON.stringify(db, null, 2))
}, 2000)

if (!db.data.config) db.data.config = { apikey: "" };
if (!db.data.users) db.data.users = {};
if (!db.data.deposit) db.data.deposit = {};
if (!db.data.produk) db.data.produk = [];

const bot = new Telegraf(global.botTokenTelegram)
const toRupiah = (a) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a)

// --- HELPER LICENSE ---
const checkLicense = async (key) => {
    try {
        const res = await axios.get(`https://julzzapis.biz.id/orderkuota/mutasiqr?apikey=${key}&username=${global.username}&token=${global.tokenorkut}`);
        return res.data.status;
    } catch (e) { return false; }
};

bot.use(async (ctx, next) => {
    if (ctx.from && !db.data.users[ctx.from.id]) {
        db.data.users[ctx.from.id] = { balance: 0, name: ctx.from.first_name };
    }
    return next()
})

// --- MENU UTAMA ---
bot.start(async (ctx) => {
    const uId = ctx.from.id;
    const currentKey = db.data.config.apikey;

    if (!currentKey || currentKey === "") {
        return ctx.reply(`❌ BOT TERKUNCI\n\nMasukkan APIKEY terlebih dahulu.\nKetik: \`/apikey [key]\``, { parse_mode: 'Markdown' });
    }

    const user = db.data.users[uId];
    const isAdmin = String(uId) === String(global.ownerTelegramId);
    
    let caption = `───「 ${global.namaStore} 」───\n\n👋 Halo, ${ctx.from.first_name}!\nSaldo: ${toRupiah(user.balance)}\nSaya adalah bot telegram yang di rancang Rulzz OfficiaL untuk kebutuhan anda.`

    const btns = [
        [Markup.button.callback('🛍️ PRODUK', 'list_produk')],
        [Markup.button.callback('💳 DEPOSIT', 'depo_menu'), Markup.button.callback('👤 PROFIL', 'user_info')],
        [Markup.button.url('👨‍💻 HUBUNGI OWNER', `https://t.me/${global.ownerTelegramUsername}`)]
    ]
    
    if (isAdmin) {
        btns.push([Markup.button.callback('⚙️ ADMIN PANEL', 'admin_panel')]);
    }

    ctx.replyWithPhoto(global.bannerUrl, { caption, parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) })
})

// --- HANDLER TOMBOL ---
bot.action('admin_panel', async (ctx) => {
    const uId = ctx.from.id;
    if (String(uId) !== String(global.ownerTelegramId)) {
        return ctx.answerCbQuery('❌ Akses Ditolak!', { show_alert: true });
    }
    await ctx.answerCbQuery();
    const teksAdmin = `⚙️ ADMIN DASHBOARD\n\n` +
                      `• \`/addstok Nama|Harga|Akun\`\n` +
                      `• \`/addsaldo ID Jumlah\`\n` +
                      `• \`/delstok ID_Produk\``;
    ctx.reply(teksAdmin, { parse_mode: 'Markdown' });
});

bot.action('list_produk', async (ctx) => {
    await ctx.answerCbQuery();
    if (db.data.produk.length === 0) return ctx.reply('📦 Stok produk masih kosong.');
    let teks = `───「 DAFTAR PRODUK 」───\n\n`;
    const buttons = [];
    db.data.produk.forEach((p) => {
        teks += `📦 ${p.nama}\n💰 Harga: ${toRupiah(p.harga)}\n📊 Stok: ${p.stok.length}\n🆔 ID: \`${p.id}\` \n━━━━━━━━━━━━\n`;
        if (p.stok.length > 0) buttons.push([Markup.button.callback(`🛒 Beli ${p.nama}`, `beli_${p.id}`)]);
    });
    ctx.reply(teks, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/^beli_(\d+)$/, async (ctx) => {
    const pId = parseInt(ctx.match[1]);
    const uId = ctx.from.id;
    const user = db.data.users[uId];
    const p = db.data.produk.find(x => x.id === pId);

    if (!p) return ctx.answerCbQuery('Produk tidak ditemukan!');
    if (user.balance < p.harga) return ctx.answerCbQuery('❌ Saldo Lu Kurang!', { show_alert: true });

    user.balance -= p.harga;
    const akun = p.stok.shift();
    await ctx.answerCbQuery('✅ Pembelian Berhasil!');
    
    ctx.reply(`✅ PEMBELIAN BERHASIL\n\nProduk: ${p.nama}\n📦 Detail Akun:\n\`${akun}\``, { parse_mode: 'Markdown' });

    const laporanOwner = `🔔 NOTIFIKASI PENJUALANl\n\n👤 Pembeli: l${ctx.from.first_name}l\n📦 Produk: ${p.nama}l\n💰 Harga: l${toRupiah(p.harga)}l\n⏰ Waktu: ${moment().tz("Asia/Jakarta").format("HH:mm:ss")}`;
    bot.telegram.sendMessage(global.ownerTelegramId, laporanOwner, { parse_mode: 'Markdown' });
});

bot.action('depo_menu', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply(`💳 TOP UP SALDO\n\nKetik: \`/deposit [nominal]\``);
});

bot.action('user_info', async (ctx) => {
    await ctx.answerCbQuery();
    const user = db.data.users[ctx.from.id];
    ctx.reply(`👤 PROFIL\n\nID: \`${ctx.from.id}\`\nSaldo: ${toRupiah(user.balance)}`, { parse_mode: 'Markdown' });
});

// --- COMMANDS ---
bot.command('deposit', async (ctx) => {
    const key = db.data.config.apikey;
    const uId = ctx.from.id;
    const amt = parseInt(ctx.payload);
    if (isNaN(amt) || amt < 1000) return ctx.reply('❌ Min Rp 1.000');

    if (db.data.deposit[uId]) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, db.data.deposit[uId].msgId) } catch (e) {}
    }

    ctx.reply('⌛ _Generating QRIS..._');
    try {
        const res = await axios.get(`https://julzzapis.biz.id/orderkuota/createpayment?apikey=${key}&username=${global.username}&token=${global.tokenorkut}&amount=${amt}`);
        if (res.data.status) {
            const total = res.data.result.amount; 
            const qrisMsg = await ctx.replyWithPhoto(res.data.result.imageqris.url, { 
                caption: `✅ lTAGIHAN QRISl\n\n💰 Bayar: ${toRupiah(total)}\n\n❌ Ketik /bataldepo untuk membatalkan.`, 
                parse_mode: 'Markdown' 
            });
            db.data.deposit[uId] = { total, amt, msgId: qrisMsg.message_id };

            let iv = setInterval(async () => {
                if (!db.data.deposit[uId]) return clearInterval(iv);
                try {
                    const mut = await axios.get(`https://julzzapis.biz.id/orderkuota/mutasiqr?apikey=${key}&username=${global.username}&token=${global.tokenorkut}`);
                    const lunas = mut.data.result.find(i => i.status === "IN" && parseInt(i.kredit.replace(/\./g, "")) === total);
                    if (lunas) {
                        db.data.users[uId].balance += amt;
                        try { await ctx.telegram.deleteMessage(ctx.chat.id, db.data.deposit[uId].msgId) } catch (e) {}
                        ctx.reply(`✅ DEPOSIT BERHASIL!\nSaldo ${toRupiah(amt)} ditambahkan.`);
                        bot.telegram.sendMessage(global.ownerTelegramId, `💰 DEPOSIT MASUK\n👤 User: ${ctx.from.first_name}\n💵 Nominal: l${toRupiah(amt)}`, { parse_mode: 'Markdown' });
                        delete db.data.deposit[uId];
                        clearInterval(iv);
                    }
                } catch (e) { }
            }, 10000);
        }
    } catch (e) { ctx.reply('❌ API Error'); }
});

bot.command('bataldepo', async (ctx) => {
    const uId = ctx.from.id;
    if (db.data.deposit[uId]) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, db.data.deposit[uId].msgId) } catch (e) {}
        delete db.data.deposit[uId];
        ctx.reply('✅ Deposit dibatalkan.');
    }
});

bot.command('apikey', async (ctx) => {
    if (String(ctx.from.id) !== String(global.ownerTelegramId)) return;
    const inputKey = ctx.payload.trim();
    if (!inputKey) return ctx.reply('Format: /apikey KEY_LU');
    const isValid = await checkLicense(inputKey);
    if (isValid) {
        db.data.config.apikey = inputKey;
        ctx.reply('✅ Bot Terverifikasi!');
    } else { ctx.reply('❌ Key Salah!'); }
});

bot.command('addsaldo', (ctx) => {
    if (String(ctx.from.id) !== String(global.ownerTelegramId)) return;
    const args = ctx.payload.split(' ');
    const targetId = args[0];
    const nominal = parseInt(args[1]);
    if (!targetId || isNaN(nominal)) return ctx.reply('Format: `/addsaldo [ID] [JUMLAH]`');
    if (db.data.users[targetId]) {
        db.data.users[targetId].balance += nominal;
        ctx.reply(`✅ Berhasil tambah saldo ke ${targetId}`);
        bot.telegram.sendMessage(targetId, `🎁 Saldo lu ditambah ${toRupiah(nominal)} oleh Admin.`);
    } else { ctx.reply('❌ ID tidak ada.'); }
});

bot.command('delstok', (ctx) => {
    if (String(ctx.from.id) !== String(global.ownerTelegramId)) return;
    const targetId = parseInt(ctx.payload.trim());
    const index = db.data.produk.findIndex(p => p.id === targetId);
    if (index !== -1) {
        db.data.produk.splice(index, 1);
        ctx.reply(`✅ Produk ID ${targetId} dihapus.`);
    } else { ctx.reply('❌ ID tidak ditemukan.'); }
});

bot.command('addstok', (ctx) => {
    if (String(ctx.from.id) !== String(global.ownerTelegramId)) return;
    const [nama, harga, akun] = ctx.payload.split('|');
    if (!akun) return ctx.reply('Format: Nama|Harga|Akun');
    let p = db.data.produk.find(x => x.nama.toLowerCase() === nama.trim().toLowerCase());
    if (p) {
        p.stok.push(akun.trim());
        ctx.reply(`✅ Stok ${p.nama} ditambah!`);
    } else {
        db.data.produk.push({ id: Date.now(), nama: nama.trim(), harga: parseInt(harga), stok: [akun.trim()] });
        ctx.reply(`✅ Produk ${nama} didaftarkan!`);
    }
});

bot.launch();
console.log('🚀 Bot Onlen!');