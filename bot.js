require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

// =====================================================
// 🔥 GLOBAL SAFE MODE (BOT ASLA ÇÖKMEZ)
// =====================================================
process.on("uncaughtException", err => console.error("❌ UNCAUGHT:", err));
process.on("unhandledRejection", reason => console.error("❌ UNHANDLED:", reason));

// =====================================================
// 🔥 CLIENT
// =====================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ]
});

global.client = client;

client.commands = new Collection();
client.music = new Collection();

// =====================================================
// 🎵 DISCORD-PLAYER (YouTube Engine FIX)
// =====================================================
const { Player } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");

client.player = new Player(client, {
    ytdlOptions: {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25
    }
});

// Extractors load (no YouTubeExtractor — 6.x already supports it)
(async () => {
    await client.player.extractors.loadMulti(DefaultExtractors);
    console.log("🎵 Tüm müzik extractors başarıyla yüklendi!");
})();

// =====================================================
// 🔥 PERMISSION SYSTEM
// =====================================================
const PERM_FILE_PATH = path.resolve(__dirname, "permissions.json");

function loadPermissionsData() {
    try {
        if (!fs.existsSync(PERM_FILE_PATH)) return {};
        delete require.cache[require.resolve(PERM_FILE_PATH)];
        return require(PERM_FILE_PATH);
    } catch {
        return {};
    }
}

function checkCustomPermissions(message, command, perms) {
    if (message.author.id === message.guild.ownerId) return true;

    const p = perms[command.name];
    if (!p) return false;

    if (p.users.includes(message.author.id)) return true;

    if (message.member.roles.cache.some(r => p.roles.includes(r.id))) {
        return true;
    }

    return false;
}

// =====================================================
// 🔥 COMMAND HANDLER
// =====================================================
const commandFiles = fs.readdirSync("./commands").filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
    try {
        const cmd = require(`./commands/${file}`);
        client.commands.set(cmd.name, cmd);
    } catch (err) {
        console.error(`❌ Komut yüklenemedi (${file}):`, err);
    }
}

// =====================================================
// 🔥 MUSIC COMMAND HANDLER
// =====================================================
if (fs.existsSync("./music")) {
    const musicFiles = fs.readdirSync("./music").filter(f => f.endsWith(".js"));
    for (const file of musicFiles) {
        try {
            const cmd = require(`./music/${file}`);
            client.music.set(cmd.name, cmd);
        } catch (err) {
            console.error(`❌ Müzik komutu yüklenemedi (${file}):`, err);
        }
    }
}

// =====================================================
// 🔥 BOT READY
// =====================================================
client.once("clientReady", async () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);

    try {
        delete require.cache[require.resolve("./settings.json")];
        const settings = require("./settings.json");

        if (!settings.targetGuildID) return;

        const guild = client.guilds.cache.get(settings.targetGuildID);
        if (!guild) return;

        if (settings.auto_role_id && settings.auto_role_id !== "ROL_ID_YOK") {
            const members = await guild.members.fetch();
            const role = guild.roles.cache.get(settings.auto_role_id);
            if (!role) return;

            const without = members.filter(m =>
                !m.user.bot && !m.roles.cache.has(settings.auto_role_id)
            );

            for (const m of without.values()) {
                await m.roles.add(role).catch(() => {});
            }
        }

    } catch (err) {
        console.error("❌ BACKFILL HATASI:", err);
    }
});

// =====================================================
// 🔥 MESSAGE EVENT — Komut sistemi
// =====================================================
client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot || !message.guild) return;

        delete require.cache[require.resolve("./settings.json")];
        const settings = require("./settings.json");

        if (message.guild.id !== settings.targetGuildID) return;

        const prefix = settings.prefix;
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const name = args.shift().toLowerCase();

        // 🎵 MÜZİK KOMUTU
        const musicCmd = client.music.get(name) ||
            client.music.find(c => c.aliases?.includes(name));

        if (musicCmd) {
            return musicCmd.execute(message, args);
        }

        // 🔥 NORMAL KOMUT
        const cmd = client.commands.get(name) ||
            client.commands.find(c => c.aliases?.includes(name));

        if (!cmd) return;

        const perms = loadPermissionsData();
        const customAllowed = checkCustomPermissions(message, cmd, perms);

        const discordAllowed = cmd.permissions?.length
            ? message.member.permissions.has(cmd.permissions)
            : false;

        if (!customAllowed && !discordAllowed) {
            return message.reply("❌ Bu komutu kullanma yetkin yok.");
        }

        await cmd.execute(message, args, name);

    } catch (err) {
        console.error("❌ Komut HATASI:", err);
    }
});

// =====================================================
// 🔥 AUTO ROLE
// =====================================================
client.on("guildMemberAdd", async (member) => {
    try {
        delete require.cache[require.resolve("./settings.json")];
        const settings = require("./settings.json");

        if (member.guild.id !== settings.targetGuildID) return;

        if (settings.auto_role_id && settings.auto_role_id !== "ROL_ID_YOK") {
            const role = member.guild.roles.cache.get(settings.auto_role_id);
            if (role) await member.roles.add(role).catch(() => {});
        }

    } catch (err) {
        console.error("❌ AUTO ROLE HATASI:", err);
    }
});

client.login(process.env.DISCORD_TOKEN);
