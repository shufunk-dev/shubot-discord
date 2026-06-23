const { Client, GatewayIntentBits, ActivityType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const token = process.env.DISCORD_TOKEN;
if (!token || token.trim() === '') {
  console.error('[Bot Error] No Discord Token provided. Exiting...');
  process.exit(1);
}

// Read configuration
let config = {
  prefix: "!",
  statusType: "PLAYING",
  statusText: "with Discord.js!",
  moderationEnabled: true,
  dndEnabled: true,
  eliteEnabled: true,
  galnetAutoPost: false,
  galnetChannelId: ""
};

let customCommands = {};

function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('[Bot] Configuration loaded.');
    }
  } catch (err) {
    console.error(`[Bot Error] Failed to load config: ${err.message}`);
  }
}

function loadCustomCommands() {
  try {
    const commandsPath = path.join(__dirname, 'custom_commands.json');
    if (fs.existsSync(commandsPath)) {
      customCommands = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
      console.log('[Bot] Custom commands loaded.');
    }
  } catch (err) {
    console.error(`[Bot Error] Failed to load custom commands: ${err.message}`);
  }
}

loadConfig();
loadCustomCommands();

// Initialize client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Update presence based on config.json
function updatePresence() {
  try {
    const typeStr = config.statusType.toUpperCase();
    let activityType;
    
    switch (typeStr) {
      case 'PLAYING':
        activityType = ActivityType.Playing;
        break;
      case 'LISTENING':
        activityType = ActivityType.Listening;
        break;
      case 'WATCHING':
        activityType = ActivityType.Watching;
        break;
      case 'COMPETING':
        activityType = ActivityType.Competing;
        break;
      case 'STREAMING':
        activityType = ActivityType.Streaming;
        break;
      default:
        activityType = ActivityType.Playing;
    }
    
    client.user.setPresence({
      activities: [{ name: config.statusText, type: activityType }],
      status: 'online'
    });
    console.log(`[Bot] Updated presence: ${typeStr} "${config.statusText}"`);
  } catch (err) {
    console.error(`[Bot Error] Failed to update presence: ${err.message}`);
  }
}

let galnetInterval = null;

async function checkNewGalnetArticles() {
  if (config.eliteEnabled === false || config.galnetAutoPost === false || !config.galnetChannelId) {
    return;
  }
  
  console.log('[Bot Galnet] Checking for new Galnet articles...');
  
  try {
    const url = 'https://cms.zaonce.net/en-GB/jsonapi/node/galnet_article?sort=-published_at&page[limit]=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const result = await res.json();
    
    if (!result || !Array.isArray(result.data) || result.data.length === 0) {
      return;
    }
    
    const latestArticle = result.data[0];
    const articleId = latestArticle.id;
    
    // Read local state
    const statePath = path.join(__dirname, 'galnet_state.json');
    let lastPostedId = '';
    if (fs.existsSync(statePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        lastPostedId = state.lastPostedId || '';
      } catch (e) {
        console.error(`[Bot Galnet Error] Failed to read state: ${e.message}`);
      }
    }
    
    if (articleId !== lastPostedId) {
      const channelInput = config.galnetChannelId.trim();
      const channelId = channelInput.includes('/') ? channelInput.split('/').pop().trim() : channelInput;
      
      console.log(`[Bot Galnet] New article detected: "${latestArticle.attributes.title}". Posting to channel: ${channelId}`);
      
      const channel = await client.channels.fetch(channelId).catch((err) => {
        console.error(`[Bot Galnet Error] Failed to fetch channel ${channelId}: ${err.message}`);
        return null;
      });
      
      if (channel) {
        const title = latestArticle.attributes?.title || 'No Title';
        const date = latestArticle.attributes?.field_galnet_date || '';
        let bodyClean = latestArticle.attributes?.body?.value || '';
        bodyClean = bodyClean.replace(/<[^>]*>/g, '').trim();
        
        const embed = new EmbedBuilder()
          .setTitle(`📰 Galnet: ${title}`)
          .setDescription(bodyClean.length > 2048 ? bodyClean.substring(0, 2045) + '...' : bodyClean)
          .setColor('#ffaa00')
          .setFooter({ text: `Galnet News • ${date}` });
          
        const imageKey = latestArticle.attributes?.field_galnet_image;
        if (imageKey) {
          embed.setThumbnail(`https://hosting.zaonce.net/elite-dangerous/galnet/${encodeURIComponent(imageKey)}.png`);
        }
        
        await channel.send({ embeds: [embed] }).catch(err => {
          console.error(`[Bot Galnet Error] Failed to send message: ${err.message}`);
        });
        
        fs.writeFileSync(statePath, JSON.stringify({ lastPostedId: articleId }, null, 2), 'utf8');
      } else {
        console.warn(`[Bot Galnet Warning] Auto-posting is enabled but the configured channel ID ${config.galnetChannelId} could not be resolved.`);
      }
    }
  } catch (error) {
    console.error(`[Bot Galnet Error] Failed checking Galnet: ${error.message}`);
  }
}

function startGalnetPoller() {
  if (galnetInterval) {
    clearInterval(galnetInterval);
    galnetInterval = null;
  }

  // Poll immediately, then every 30 minutes
  checkNewGalnetArticles();
  galnetInterval = setInterval(checkNewGalnetArticles, 30 * 60 * 1000);
}

// Bot ready event
client.once('ready', () => {
  console.log(`[Bot] Ready! Logged in as ${client.user.tag}`);
  updatePresence();
  startGalnetPoller();
});

// Handle incoming messages
client.on('messageCreate', async (message) => {
  // Ignore bots and webhooks
  if (message.author.bot || message.webhookId) return;
  
  // Check prefix
  const prefix = config.prefix || '!';
  if (!message.content.startsWith(prefix)) return;
  
  // Parse command and arguments
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  console.log(`[Bot Info] User ${message.author.tag} invoked command: ${commandName} ${args.join(' ')}`);
  
  // Moderation module toggle check
  const moderationCmds = ['kick', 'ban', 'timeout', 'untimeout'];
  if (moderationCmds.includes(commandName) && config.moderationEnabled === false) {
    return message.reply("❌ The moderation module is currently disabled for this bot.");
  }
  
  // Commands list
  if (commandName === 'ping') {
    const sent = await message.reply('Pinging...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);
    sent.edit(`🏓 Pong!\n• Bot Latency: **${latency}ms**\n• Discord API Latency: **${apiLatency}ms**`);
  } 
  
  else if (commandName === 'say') {
    const sayMessage = args.join(' ');
    if (!sayMessage) {
      return message.reply(`Please provide a message for me to say. Example: \`${prefix}say hello!\``);
    }
    // Delete the original user command message if bot has permissions
    try {
      await message.delete();
    } catch (err) {
      // Ignore permission errors
    }
    message.channel.send(sayMessage);
  }
  
  else if (commandName === 'server') {
    if (!message.guild) {
      return message.reply('This command can only be used within a server.');
    }
    const guild = message.guild;
    const createdDate = new Date(guild.createdTimestamp).toLocaleDateString();
    message.reply(`🏰 **Server Information**:\n• Name: **${guild.name}**\n• Members: **${guild.memberCount}**\n• Created On: **${createdDate}**\n• Server ID: \`${guild.id}\``);
  }
  
  else if (commandName === 'user') {
    const member = message.member || message.author;
    const joinedDate = message.guild ? new Date(message.member.joinedTimestamp).toLocaleDateString() : 'N/A';
    const createdDate = new Date(message.author.createdTimestamp).toLocaleDateString();
    
    message.reply(`👤 **User Information**:\n• Username: **${message.author.username}**\n• Tag: **${message.author.tag}**\n• Account Created: **${createdDate}**\n• Server Joined: **${joinedDate}**`);
  }
  
  else if (commandName === 'kick') {
    if (!message.guild) return message.reply("❌ This command can only be used in a server.");
    
    // Check if author has permission to kick
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply("❌ You do not have permission to kick members (requires `Kick Members` permission).");
    }
    
    // Check if bot has permission to kick
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply("❌ I do not have permission to kick members. Please check my server permissions.");
    }
    
    const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
    if (!target) {
      return message.reply(`❌ Please mention a valid member or provide their User ID.\nExample: \`${prefix}kick @user Spamming\``);
    }
    
    // Check if target is kickable (hierarchy check)
    if (!target.kickable) {
      return message.reply("❌ I cannot kick this member. They may have a higher role than me or are the server owner.");
    }
    
    // Check if author role is higher than target role
    if (message.member.roles.highest.position <= target.roles.highest.position && message.guild.ownerId !== message.author.id) {
      return message.reply("❌ You cannot kick this member because their highest role is equal to or higher than yours.");
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      await target.kick(reason);
      message.reply(`✅ **${target.user.tag}** has been kicked.\n• **Reason**: ${reason}\n• **Moderator**: ${message.author.tag}`);
      console.log(`[Moderation] Kicked ${target.user.tag} for: ${reason} (by ${message.author.tag})`);
    } catch (err) {
      message.reply(`❌ Failed to kick member: ${err.message}`);
    }
  }
  
  else if (commandName === 'ban') {
    if (!message.guild) return message.reply("❌ This command can only be used in a server.");
    
    // Check if author has permission to ban
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ You do not have permission to ban members (requires `Ban Members` permission).");
    }
    
    // Check if bot has permission to ban
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ I do not have permission to ban members. Please check my server permissions.");
    }
    
    const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
    if (!target) {
      return message.reply(`❌ Please mention a valid member or provide their User ID.\nExample: \`${prefix}ban @user Guild rules violation\``);
    }
    
    // Check if target is bannable (hierarchy check)
    if (!target.bannable) {
      return message.reply("❌ I cannot ban this member. They may have a higher role than me or are the server owner.");
    }
    
    // Check if author role is higher than target role
    if (message.member.roles.highest.position <= target.roles.highest.position && message.guild.ownerId !== message.author.id) {
      return message.reply("❌ You cannot ban this member because their highest role is equal to or higher than yours.");
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      await target.ban({ reason });
      message.reply(`✅ **${target.user.tag}** has been banned.\n• **Reason**: ${reason}\n• **Moderator**: ${message.author.tag}`);
      console.log(`[Moderation] Banned ${target.user.tag} for: ${reason} (by ${message.author.tag})`);
    } catch (err) {
      message.reply(`❌ Failed to ban member: ${err.message}`);
    }
  }
  
  else if (commandName === 'timeout') {
    if (!message.guild) return message.reply("❌ This command can only be used in a server.");
    
    // Check if author has permission to moderate/timeout
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ You do not have permission to timeout members (requires `Timeout Members` permission).");
    }
    
    // Check if bot has permission to moderate/timeout
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ I do not have permission to timeout members. Please check my server permissions.");
    }
    
    const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
    if (!target) {
      return message.reply(`❌ Please mention a valid member or provide their User ID.\nExample: \`${prefix}timeout @user 10m Spamming\``);
    }
    
    const durationArg = args[1];
    if (!durationArg) {
      return message.reply(`❌ Please specify a duration (e.g. \`10m\`, \`2h\`, \`1d\`).`);
    }
    
    // Parse duration
    let ms = 0;
    const match = durationArg.match(/^(\d+)([mhd])$/i);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === 'm') ms = amount * 60 * 1000;
      else if (unit === 'h') ms = amount * 60 * 60 * 1000;
      else if (unit === 'd') ms = amount * 24 * 60 * 60 * 1000;
    } else {
      const rawNum = parseInt(durationArg);
      if (!isNaN(rawNum)) {
        ms = rawNum * 60 * 1000;
      }
    }
    
    if (ms <= 0 || ms > 28 * 24 * 60 * 60 * 1000) {
      return message.reply("❌ Invalid duration. Please specify a value between 1 minute and 28 days (e.g., `10m`, `3h`, `7d`).");
    }
    
    // Check if target is moderatable
    if (!target.moderatable) {
      return message.reply("❌ I cannot moderate this member. They may have a higher role than me or are the server owner.");
    }
    
    // Check if author role is higher than target role
    if (message.member.roles.highest.position <= target.roles.highest.position && message.guild.ownerId !== message.author.id) {
      return message.reply("❌ You cannot timeout this member because their highest role is equal to or higher than yours.");
    }
    
    const reason = args.slice(2).join(' ') || 'No reason provided';
    try {
      await target.timeout(ms, reason);
      message.reply(`✅ **${target.user.tag}** has been timed out for **${durationArg}**.\n• **Reason**: ${reason}\n• **Moderator**: ${message.author.tag}`);
      console.log(`[Moderation] Timed out ${target.user.tag} for ${durationArg}: ${reason} (by ${message.author.tag})`);
    } catch (err) {
      message.reply(`❌ Failed to timeout member: ${err.message}`);
    }
  }
  
  else if (commandName === 'untimeout') {
    if (!message.guild) return message.reply("❌ This command can only be used in a server.");
    
    // Check if author has permission to moderate/timeout
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ You do not have permission to remove timeouts (requires `Timeout Members` permission).");
    }
    
    // Check if bot has permission to moderate/timeout
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ I do not have permission to manage timeouts. Please check my server permissions.");
    }
    
    const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
    if (!target) {
      return message.reply(`❌ Please mention a valid member or provide their User ID.\nExample: \`${prefix}untimeout @user\``);
    }
    
    // Check if target has a timeout active
    if (!target.communicationDisabledUntilTimestamp || target.communicationDisabledUntilTimestamp < Date.now()) {
      return message.reply("❌ This member does not have an active timeout.");
    }
    
    // Check if target is moderatable
    if (!target.moderatable) {
      return message.reply("❌ I cannot remove the timeout for this member. They may have a higher role than me.");
    }
    
    // Check if author role is higher than target role
    if (message.member.roles.highest.position <= target.roles.highest.position && message.guild.ownerId !== message.author.id) {
      return message.reply("❌ You cannot remove the timeout for this member because their highest role is equal to or higher than yours.");
    }
    
    try {
      await target.timeout(null);
      message.reply(`✅ Removed timeout for **${target.user.tag}**.\n• **Moderator**: ${message.author.tag}`);
      console.log(`[Moderation] Removed timeout for ${target.user.tag} (by ${message.author.tag})`);
    } catch (err) {
      message.reply(`❌ Failed to remove timeout: ${err.message}`);
    }
  }
  
  else if (commandName === 'roll') {
    if (config.dndEnabled === false) {
      return message.reply("❌ The D&D module is currently disabled for this bot.");
    }
    
    const input = args[0] || '1d20';
    const diceRegex = /^(\d+)?d(\d+)([\+\-]\d+)?$/i;
    const match = input.match(diceRegex);
    
    if (!match) {
      return message.reply(`❌ Invalid roll format. Use something like \`1d20\`, \`3d6+2\`, or just \`roll\` to roll a d20.`);
    }
    
    const count = match[1] ? parseInt(match[1]) : 1;
    const sides = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;
    
    if (count <= 0 || count > 100) {
      return message.reply("❌ You can only roll between 1 and 100 dice at a time.");
    }
    
    if (sides <= 1 || sides > 1000) {
      return message.reply("❌ Dice sides must be between 2 and 1000.");
    }
    
    const rolls = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
      sum += roll;
    }
    
    const total = sum + modifier;
    let rollsStr = rolls.join(', ');
    if (rollsStr.length > 100) {
      rollsStr = rollsStr.substring(0, 97) + '...';
    }
    
    let responseMsg = `🎲 **D&D Roll Result** for **${input}**:\n`;
    if (count > 1) {
      responseMsg += `• Individual Rolls: \`[${rollsStr}]\` (Sum: **${sum}**)\n`;
    } else {
      responseMsg += `• Roll: **${sum}**\n`;
    }
    
    if (modifier !== 0) {
      responseMsg += `• Modifier: **${modifier > 0 ? '+' : ''}${modifier}**\n`;
    }
    
    responseMsg += `• **Total**: 🏆 **${total}** 🏆`;
    
    message.reply(responseMsg);
  }
  
  else if (commandName === 'ed') {
    if (config.eliteEnabled === false) {
      return message.reply("❌ The Elite Dangerous module is currently disabled for this bot.");
    }
    
    const subCommand = args[0]?.toLowerCase();
    if (!subCommand) {
      return message.reply(`❌ Invalid syntax. Use:\n• \`${prefix}ed system <system>\`\n• \`${prefix}ed station <system> / <station>\`\n• \`${prefix}ed cmdr <name>\`\n• \`${prefix}ed galnet\`\n• \`${prefix}ed cg\``);
    }
    
    if (subCommand === 'system') {
      const systemName = args.slice(1).join(' ');
      if (!systemName) return message.reply("❌ Please specify a system name. Example: `!ed system Sol`.");
      
      const sent = await message.reply(`Searching for system **${systemName}**...`);
      try {
        const url = `https://www.edsm.net/api-v1/system?systemName=${encodeURIComponent(systemName)}&showCoordinates=1&showInformation=1`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        
        if (!data || !data.name) {
          return sent.edit(`❌ System **${systemName}** was not found in EDSM.`);
        }
        
        const info = data.information || {};
        const coords = data.coords || {};
        
        const allegiance = info.allegiance || 'None';
        const government = info.government || 'None';
        const faction = info.faction || 'None';
        const security = info.security || 'None';
        const economy = info.secondEconomy ? `${info.economy} / ${info.secondEconomy}` : (info.economy || 'None');
        const population = info.population !== undefined ? info.population.toLocaleString() : 'Unknown';
        
        let reply = `🚀 **System Profile: ${data.name}**\n`;
        reply += `• Allegiance: **${allegiance}**\n`;
        reply += `• Controlling Faction: **${faction}**\n`;
        reply += `• Government: **${government}**\n`;
        reply += `• Economy: **${economy}**\n`;
        reply += `• Security: **${security}**\n`;
        reply += `• Population: **${population}**\n`;
        reply += `• Coordinates: \`X: ${coords.x ?? 0}, Y: ${coords.y ?? 0}, Z: ${coords.z ?? 0}\``;
        
        sent.edit(reply);
      } catch (err) {
        sent.edit(`❌ Failed to fetch system data: ${err.message}`);
      }
    }
    
    else if (subCommand === 'station') {
      const query = args.slice(1).join(' ');
      const parts = query.split('/');
      const systemName = parts[0]?.trim();
      const stationName = parts[1]?.trim();
      
      if (!systemName || !stationName) {
        return message.reply(`❌ Invalid syntax. Use: \`${prefix}ed station <system> / <station>\`\nExample: \`${prefix}ed station Sol / Daedalus\``);
      }
      
      const sent = await message.reply(`Searching for station **${stationName}** in **${systemName}**...`);
      try {
        const url = `https://www.edsm.net/api-system-v1/stations?systemName=${encodeURIComponent(systemName)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        
        if (!data || !data.name) {
          return sent.edit(`❌ System **${systemName}** was not found in EDSM.`);
        }
        
        const stations = data.stations || [];
        const station = stations.find(s => s.name.toLowerCase() === stationName.toLowerCase() || s.name.toLowerCase().includes(stationName.toLowerCase()));
        
        if (!station) {
          return sent.edit(`❌ Station **${stationName}** was not found in the **${systemName}** system.`);
        }
        
        const faction = station.controllingFaction?.name || 'None';
        const type = station.type || 'Starport';
        const distance = station.distanceToArrival ? `${station.distanceToArrival.toLocaleString()} Ls` : 'Unknown';
        
        let padSize = station.maxLandingPadSize;
        if (!padSize) {
          const typeLower = type.toLowerCase();
          if (typeLower.includes('port') || 
              typeLower.includes('coriolis') || 
              typeLower.includes('orbis') || 
              typeLower.includes('ocellus') || 
              typeLower.includes('asteroid base') || 
              typeLower.includes('megaship') ||
              typeLower.includes('carrier') ||
              typeLower.includes('installation')) {
            padSize = 'Large';
          } else if (typeLower.includes('outpost') || 
                     typeLower.includes('settlement') || 
                     typeLower.includes('surface station')) {
            padSize = 'Medium';
          } else {
            padSize = 'Unknown';
          }
        }
        
        const servicesList = [];
        if (station.haveMarket) servicesList.push('Market');
        if (station.haveShipyard) servicesList.push('Shipyard');
        if (station.haveOutfitting) servicesList.push('Outfitting');
        const services = servicesList.length > 0 ? servicesList.join(', ') : 'None';
        
        const economy = station.secondEconomy ? `${station.economy} / ${station.secondEconomy}` : (station.economy || 'None');
        const government = station.government || 'None';
        
        let reply = `🛰️ **Station Profile: ${station.name}** (${systemName})\n`;
        reply += `• Type: **${type}**\n`;
        reply += `• Allegiance: **${station.allegiance || 'None'}**\n`;
        reply += `• Government: **${government}**\n`;
        reply += `• Economy: **${economy}**\n`;
        reply += `• Arrival Distance: **${distance}**\n`;
        reply += `• Max Pad Size: **${padSize}**\n`;
        reply += `• Controlling Faction: **${faction}**\n`;
        reply += `• Services: **${services}**\n`;
        
        sent.edit(reply);
      } catch (err) {
        sent.edit(`❌ Failed to fetch station data: ${err.message}`);
      }
    }
    
    else if (subCommand === 'cmdr') {
      const cmdrName = args.slice(1).join(' ');
      if (!cmdrName) return message.reply("❌ Please specify a commander name. Example: `!ed cmdr Shufunk`.");
      
      const apiKey = process.env.EDSM_API_KEY;
      const botCmdr = process.env.EDSM_COMMANDER_NAME;
      
      if (!apiKey || !botCmdr) {
        return message.reply("❌ EDSM API Credentials are not configured. Please save your EDSM Commander Name and EDSM API Key under the **Elite** tab in the dashboard settings to search commanders.");
      }
      
      const sent = await message.reply(`Fetching ranks for CMDR **${cmdrName}**...`);
      try {
        const queryParams = `commanderName=${encodeURIComponent(cmdrName)}&apiKey=${apiKey}&commander=${encodeURIComponent(botCmdr)}`;
        const ranksUrl = `https://www.edsm.net/api-commander-v1/get-ranks?${queryParams}`;
        const posUrl = `https://www.edsm.net/api-logs-v1/get-position?${queryParams}`;
        
        const [ranksRes, posRes] = await Promise.all([fetch(ranksUrl), fetch(posUrl)]);
        
        if (!ranksRes.ok) throw new Error(`HTTP error ${ranksRes.status}`);
        const ranksData = await ranksRes.json();
        
        if (ranksData.msgnum === 203 || !ranksData.ranks) {
          return sent.edit(`❌ Commander **${cmdrName}** has no public logs linked to EDSM.`);
        }
        
        let posData = {};
        if (posRes.ok) {
          posData = await posRes.json().catch(() => ({}));
        }
        
        const ranksVerbose = ranksData.ranksVerbose || {};
        const combat = ranksVerbose.Combat || 'Unknown';
        const trade = ranksVerbose.Trade || 'Unknown';
        const explore = ranksVerbose.Explore || 'Unknown';
        const cqc = ranksVerbose.CQC || 'Unknown';
        const exobio = ranksVerbose.Exobiologist || 'Unknown';
        const fed = ranksVerbose.Federation || 'Unknown';
        const emp = ranksVerbose.Empire || 'Unknown';
        
        let reply = `👤 **Commander Profile: CMDR ${ranksData.commanderName || cmdrName}**\n`;
        reply += `• Combat Rank: **${combat}**\n`;
        reply += `• Trade Rank: **${trade}**\n`;
        reply += `• Exploration Rank: **${explore}**\n`;
        if (exobio !== 'Unknown') reply += `• Exobiologist Rank: **${exobio}**\n`;
        if (cqc !== 'Unknown' && cqc !== 'Helpless') reply += `• CQC Rank: **${cqc}**\n`;
        if (fed !== 'Unknown') reply += `• Federation Rank: **${fed}**\n`;
        if (emp !== 'Unknown') reply += `• Empire Rank: **${emp}**\n`;
        
        if (posData && posData.system) {
          reply += `• Current System: **${posData.system}** *(Last updated: ${posData.date || 'unknown'})*\n`;
        }
        
        sent.edit(reply);
      } catch (err) {
        sent.edit(`❌ Failed to fetch commander data: ${err.message}`);
      }
    }
    
    else if (subCommand === 'galnet') {
      const sent = await message.reply("Fetching latest Galnet articles...");
      try {
        const url = 'https://cms.zaonce.net/en-GB/jsonapi/node/galnet_article?sort=-published_at&page[limit]=3';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const result = await res.json();
        
        if (!result || !Array.isArray(result.data) || result.data.length === 0) {
          return sent.edit("❌ No Galnet articles found.");
        }
        
        let reply = `📰 **Latest Galnet News Headlines**\n`;
        
        result.data.forEach((art, idx) => {
          const title = art.attributes?.title || 'No Title';
          const date = art.attributes?.field_galnet_date || '';
          let bodyClean = art.attributes?.body?.value || '';
          // Strip any residual HTML tags
          bodyClean = bodyClean.replace(/<[^>]*>/g, '');
          bodyClean = bodyClean.trim();
          if (bodyClean.length > 250) {
            bodyClean = bodyClean.substring(0, 247) + '...';
          }
          
          reply += `\n**${idx + 1}. ${title}** - *${date}*\n> ${bodyClean}\n`;
        });
        
        sent.edit(reply);
      } catch (err) {
        sent.edit(`❌ Failed to fetch Galnet news: ${err.message}`);
      }
    }
    
    else if (subCommand === 'cg') {
      const sent = await message.reply("Fetching active Community Goals...");
      try {
        const url = 'https://api.orerve.net/2.0/website/initiatives/list?lang=en';
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        
        const activeGoals = data.activeInitiatives || [];
        
        if (activeGoals.length === 0) {
          return sent.edit("🌌 There are currently no active Community Goals in the galaxy.");
        }
        
        let reply = `🏆 **Active Community Goals** (${activeGoals.length} total)\n`;
        
        activeGoals.forEach((goal) => {
          const name = goal.title || goal.name || 'Unknown Goal';
          const system = goal.starsystem?.name || goal.systemName || goal.system || 'Unknown';
          const station = goal.market?.name || goal.stationName || goal.station || 'Unknown';
          const objective = goal.bulletin || goal.objective || goal.description || 'Unknown';
          
          let progress = 'Unknown';
          if (goal.progress !== undefined) {
            progress = `${(goal.progress * 100).toFixed(1)}%`;
          }
          
          reply += `\n**${name}**\n`;
          reply += `• Location: **${station}** (${system})\n`;
          reply += `• Progress: **${progress}**\n`;
          reply += `• Objective: *${objective}*\n`;
        });
        
        sent.edit(reply);
      } catch (err) {
        sent.edit(`❌ Failed to fetch community goals: ${err.message}`);
      }
    }
  }
  
  else if (commandName === 'addcmd') {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId || ownerId.trim() === '') {
      return message.reply("⚠️ The Bot Owner ID has not been configured in the launcher settings panel.");
    }
    
    if (message.author.id !== ownerId) {
      return message.reply("❌ Only the bot owner can manage custom commands.");
    }
    
    const cmdNameInput = args[0];
    const cmdCategoryInput = args[1];
    const cmdResponseInput = args.slice(2).join(' ');
    
    if (!cmdNameInput || !cmdCategoryInput || !cmdResponseInput) {
      return message.reply(`❌ Invalid syntax. Use: \`${prefix}addcmd <name> <category> <response text...>\`\nExample: \`${prefix}addcmd website Links Visit https://example.com\``);
    }
    
    const cleanCmdName = cmdNameInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanCmdName) {
      return message.reply("❌ Invalid command name. Use alphanumeric characters only.");
    }
    
    try {
      const commandsPath = path.join(__dirname, 'custom_commands.json');
      let commands = {};
      if (fs.existsSync(commandsPath)) {
        commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
      }
      
      commands[cleanCmdName] = {
        response: cmdResponseInput,
        category: cmdCategoryInput.trim()
      };
      
      fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2), 'utf8');
      message.reply(`✅ Command \`${prefix}${cleanCmdName}\` has been created/updated under category **${cmdCategoryInput}**!`);
    } catch (err) {
      console.error(`[Bot Error] Failed to write custom command: ${err.message}`);
      message.reply(`❌ Failed to save custom command: ${err.message}`);
    }
  }
  
  else if (commandName === 'delcmd') {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId || ownerId.trim() === '') {
      return message.reply("⚠️ The Bot Owner ID has not been configured in the launcher settings panel.");
    }
    
    if (message.author.id !== ownerId) {
      return message.reply("❌ Only the bot owner can manage custom commands.");
    }
    
    const cmdNameInput = args[0];
    if (!cmdNameInput) {
      return message.reply(`❌ Invalid syntax. Use: \`${prefix}delcmd <name>\``);
    }
    
    const cleanCmdName = cmdNameInput.trim().toLowerCase();
    
    try {
      const commandsPath = path.join(__dirname, 'custom_commands.json');
      if (!fs.existsSync(commandsPath)) {
        return message.reply("❌ No custom commands exist yet.");
      }
      
      let commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
      if (commands[cleanCmdName] === undefined) {
        return message.reply(`❌ Custom command \`${prefix}${cleanCmdName}\` does not exist.`);
      }
      
      delete commands[cleanCmdName];
      fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2), 'utf8');
      message.reply(`✅ Custom command \`${prefix}${cleanCmdName}\` has been successfully deleted!`);
    } catch (err) {
      console.error(`[Bot Error] Failed to delete custom command: ${err.message}`);
      message.reply(`❌ Failed to delete custom command: ${err.message}`);
    }
  }
  
  else if (commandName === 'listcmds') {
    const customKeys = Object.keys(customCommands);
    if (customKeys.length === 0) {
      return message.reply("📝 No custom commands have been configured yet.");
    }
    
    const categories = {};
    for (const [name, cmdObj] of Object.entries(customCommands)) {
      const cat = cmdObj.category || 'General';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(name);
    }
    
    let listMsg = `📋 **Custom Commands Directory**:\n`;
    for (const [cat, cmds] of Object.entries(categories)) {
      listMsg += `\n📁 **${cat}**\n` + cmds.map(k => `• \`${prefix}${k}\` - ${customCommands[k].response.slice(0, 50)}${customCommands[k].response.length > 50 ? '...' : ''}`).join('\n') + '\n';
    }
    
    message.reply(listMsg);
  }
  
  else if (commandName === 'help') {
    let customCmdsList = '';
    const customKeys = Object.keys(customCommands);
    if (customKeys.length > 0) {
      // Group by category
      const categories = {};
      for (const [name, cmdObj] of Object.entries(customCommands)) {
        const cat = cmdObj.category || 'General';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(name);
      }
      
      customCmdsList = '\n\n✨ **Custom Commands**:';
      for (const [cat, cmds] of Object.entries(categories)) {
        customCmdsList += `\n📁 **${cat}**\n` + cmds.map(k => `• \`${prefix}${k}\``).join('\n') + '\n';
      }
    }

    const helpEmbed = `📖 **Available Bot Commands** (Prefix: \`${prefix}\`):
• \`${prefix}ping\` - Check latency to Discord.
• \`${prefix}say <message>\` - Make the bot repeat a message.
• \`${prefix}server\` - Get information about the server.
• \`${prefix}user\` - Get information about yourself.
• \`${prefix}help\` - Show this help menu.
• \`${prefix}listcmds\` - Show all custom commands.

🛡️ **Moderation Commands** (Requires Server Permissions):
• \`${prefix}kick <member> [reason]\` - Kick a server member.
• \`${prefix}ban <member> [reason]\` - Ban a server member.
• \`${prefix}timeout <member> <duration> [reason]\` - Timeout a member (e.g. \`10m\`, \`2h\`, \`1d\`).
• \`${prefix}untimeout <member>\` - Remove active timeout from a member.

🐉 **D&D Commands**:
• \`${prefix}roll [dice]\` - Roll dice (e.g. \`d20\`, \`3d6\`, \`1d20+5\`).

🚀 **Elite Dangerous Commands**:
• \`${prefix}ed system <system>\` - Search system profile details.
• \`${prefix}ed station <system> / <station>\` - Search station details in a system.
• \`${prefix}ed cmdr <commander>\` - Search public commander ranks and position.
• \`${prefix}ed galnet\` - Fetch latest Galnet news articles.
• \`${prefix}ed cg\` - Fetch active galactic Community Goals.

👑 **Owner-Only Commands**:
• \`${prefix}addcmd <name> <category> <response...>\` - Add/edit custom command.
• \`${prefix}delcmd <name>\` - Delete custom command.${customCmdsList}

*Manage this bot directly from the desktop launcher dashboard.*`;
    message.reply(helpEmbed);
  }
  
  else if (customCommands[commandName] !== undefined) {
    message.reply(customCommands[commandName].response);
  }
});

// Watch for config file changes dynamically
fs.watch(path.join(__dirname, 'config.json'), (eventType) => {
  if (eventType === 'change') {
    console.log('[Bot] Detecting configuration change, reloading config...');
    // Slight delay to ensure file write finishes
    setTimeout(() => {
      loadConfig();
      if (client.user) {
        updatePresence();
        checkNewGalnetArticles();
      }
    }, 500);
  }
});

// Watch for custom commands dynamically
fs.watch(path.join(__dirname, 'custom_commands.json'), (eventType) => {
  if (eventType === 'change') {
    console.log('[Bot] Detecting custom commands change, reloading...');
    setTimeout(() => {
      loadCustomCommands();
    }, 500);
  }
});

// Handle connection/fatal errors
client.on('error', (error) => {
  console.error(`[Bot Error] client error: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Bot Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Login
client.login(token).catch(err => {
  console.error(`[Bot Fatal Error] Login failed: ${err.message}`);
  process.exit(1);
});
