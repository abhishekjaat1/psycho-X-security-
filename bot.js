
// bot.js
const { Client, GatewayIntentBits, Partials, Collection, Events, PermissionsBitField, ChannelType } = require('discord.js');
const fs = require('fs');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
require('dotenv').config();

const PREFIX = '!';
let serverConfigs = {};
const TARGET_USER_TAG = 'abhishek_da_goat'; // Target user tag for reactions

if (fs.existsSync('./configs.json')) {
    serverConfigs = JSON.parse(fs.readFileSync('./configs.json', 'utf-8'));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

client.commands = new Collection();
const whitelist = new Set();

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // 👀 Custom reaction if target user is pinged by username
    if (message.content.toLowerCase().includes('@' + TARGET_USER_TAG.toLowerCase())) {
        try {
            await message.react('☠️');
            await message.react('🥶');
        } catch {}
    }

    const guildPrefix = serverConfigs[message.guild?.id]?.prefix || PREFIX;
    if (!message.content.startsWith(guildPrefix)) return;

    const args = message.content.slice(guildPrefix.length).split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
        const member = message.mentions.members.first();
        if (member) {
            await member.kick();
            await message.reply(`✅ Kicked ${member.user.tag}`);
        }
    }

    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
        const member = message.mentions.members.first();
        if (member) {
            await member.ban();
            await message.reply(`✅ Banned ${member.user.tag}`);
        }
    }

    if (command === 'warn') {
        const user = message.mentions.users.first();
        if (user) {
            await message.reply(`⚠️ ${user.tag} has been warned.`);
        }
    }

    if (command === 'dm') {
        const user = message.mentions.users.first();
        const msg = args.slice(1).join(' ');
        if (user) {
            try {
                await user.send(`📩 **DM from ${message.author.tag}:** ${msg}`);
                await message.reply('✅ Message sent!');
            } catch {
                await message.reply('❌ Failed to send DM.');
            }
        }
    }

    if (command === 'help') {
        return message.channel.send(`📘 **Available Commands:**
\`\`\`
${guildPrefix}kick @user
${guildPrefix}ban @user
${guildPrefix}warn @user
${guildPrefix}dm @user message
${guildPrefix}ticket
${guildPrefix}play <url>
${guildPrefix}setprefix <newPrefix>
${guildPrefix}help
\`\`\``);
    }

    if (command === 'setprefix') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
        const newPrefix = args[0];
        if (!newPrefix) return message.reply('❗ Please provide a new prefix.');

        if (!serverConfigs[message.guild.id]) serverConfigs[message.guild.id] = {};
        serverConfigs[message.guild.id].prefix = newPrefix;
        fs.writeFileSync('./configs.json', JSON.stringify(serverConfigs, null, 2));
        return message.reply(`✅ Prefix changed to \`${newPrefix}\``);
    }

    if (command === 'ticket') {
        const category = message.guild.channels.cache.find(c => c.name.toLowerCase() === 'tickets' && c.type === ChannelType.GuildCategory);
        const ticketChannel = await message.guild.channels.create({
            name: `ticket-${message.author.username}`,
            type: ChannelType.GuildText,
            parent: category?.id || null,
            permissionOverwrites: [
                {
                    id: message.guild.roles.everyone.id,
                    deny: ['ViewChannel']
                },
                {
                    id: message.author.id,
                    allow: ['ViewChannel', 'SendMessages']
                }
            ]
        });
        ticketChannel.send(`🎟️ Hello ${message.author}, support will be with you shortly.`);
        message.reply('✅ Ticket created!');
    }

    if (command === 'play') {
        const url = args[0];
        if (!url || !ytdl.validateURL(url)) return message.reply('❌ Provide a valid YouTube URL.');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('🔊 You need to be in a voice channel first.');

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        });

        const stream = ytdl(url, { filter: 'audioonly' });
        const resource = createAudioResource(stream);
        const player = createAudioPlayer();

        connection.subscribe(player);
        player.play(resource);

        message.reply('🎶 Now playing!');
    }

    if (message.mentions.has(client.user)) {
        try {
            await message.react('👀');
            await message.react('✅');
        } catch {}
    }
});

client.on('guildBanAdd', async (ban) => {
    const fetchedLogs = await ban.guild.fetchAuditLogs({ type: 'MEMBER_BAN_ADD', limit: 1 });
    const log = fetchedLogs.entries.first();
    const { executor } = log;
    if (!whitelist.has(executor.id)) {
        const member = await ban.guild.members.fetch(executor.id);
        if (member && member.bannable) {
            await member.ban({ reason: 'Unauthorized ban action (anti-nuke)' });
        }
    }
});

client.on('channelDelete', async (channel) => {
    const logs = await channel.guild.fetchAuditLogs({ type: 'CHANNEL_DELETE', limit: 1 });
    const entry = logs.entries.first();
    const { executor } = entry;
    if (!whitelist.has(executor.id)) {
        const member = await channel.guild.members.fetch(executor.id);
        if (member && member.bannable) {
            await member.ban({ reason: 'Unauthorized channel deletion (anti-nuke)' });
        }
    }
});

client.on('roleDelete', async (role) => {
    const logs = await role.guild.fetchAuditLogs({ type: 'ROLE_DELETE', limit: 1 });
    const entry = logs.entries.first();
    const { executor } = entry;
    if (!whitelist.has(executor.id)) {
        const member = await role.guild.members.fetch(executor.id);
        if (member && member.bannable) {
            await member.ban({ reason: 'Unauthorized role deletion (anti-nuke)' });
        }
    }
});

client.on('webhookUpdate', async (channel) => {
    const logs = await channel.guild.fetchAuditLogs({ type: 'WEBHOOK_UPDATE', limit: 1 });
    const entry = logs.entries.first();
    const { executor } = entry;
    if (!whitelist.has(executor.id)) {
        const member = await channel.guild.members.fetch(executor.id);
        if (member && member.bannable) {
            await member.ban({ reason: 'Unauthorized webhook update (anti-nuke)' });
        }
    }
});

client.login("MTM5MTQyNTkyMzQ5NjI4NDE4MA.Gn_Bfv.8ZlI1dT7XNKCI1O-yXCyw7J-CUX6F7UCxM7-hQ");
