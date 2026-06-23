const { Client, GatewayIntentBits, ActivityType, PermissionFlagsBits } = require('discord.js');
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
  dndEnabled: true
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

// Bot ready event
client.once('clientReady', () => {
  console.log(`[Bot] Ready! Logged in as ${client.user.tag}`);
  updatePresence();
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
