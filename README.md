# 🤖 Shubot Discord Bot & Launcher Control Center

A modern, lightweight Discord bot built with **Discord.js v14**, accompanied by a premium, locally hosted **Web Control Center Dashboard** (Express + HTML/CSS/JS) to easily launch, monitor, configure, and manage your bot on Windows.

---

## ✨ Features

- **Local Web Control Center**: A stunning, glassmorphic dark-theme dashboard to start, stop, and restart your bot with a single click.
- **Live Terminal Logging**: Streams standard outputs (`stdout`) and errors (`stderr`) directly from your running bot to your browser in real-time.
- **Dynamic Settings Panel**: Save your Discord Token, Command Prefix, Bot Status Activity (Playing, Listening, Watching, Competing), and Owner ID directly in the UI.
- **Dynamic Custom Commands**: Add, edit, or delete custom text commands directly from the dashboard.
- **Remote Command Management**: Add or delete commands directly from Discord channels using owner-only admin commands.
- **Instant Hot-Reloading**: Any custom command modifications take effect immediately in Discord without needing to restart the bot.
- **Automatic Recovery**: Self-healing process ID (PID) locking terminates orphaned background bot processes automatically on next launcher boot.
- **GitHub Ready**: Preset `.gitignore` prevents private credentials (`.env`) or temporary files from being uploaded.

---

## 🛠️ Prerequisites

- **Node.js**: `v16.9.0` or higher (verified compatible with v24.x).
- **Discord Bot Account**: You will need to create a bot application on the [Discord Developer Portal](https://discord.com/developers/applications) and obtain a bot token.

---

## 🚀 Quick Start (Windows)

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/shufunk-dev/shubot-discord.git
   cd shubot-discord
   ```

2. **Launch the Application**:
   Double-click the **`launch.bat`** file in the root folder.
   - This automatically checks and installs dependencies (`npm install`).
   - Starts the local manager server.
   - Automatically opens your default web browser to the control panel at **`http://localhost:3000`**.

3. **Configure Your Settings**:
   - In the dashboard settings panel, paste your private **Discord Bot Token**.
   - Copy your Discord User ID (enable Developer Mode in Discord, right-click your profile, and click *Copy User ID*) and paste it into the **Owner Discord User ID** field.
   - Click **Save Configurations** (this generates your local, private `.env` file).

4. **Bring Your Bot Online**:
   - Click **Start Bot** in the control panel.
   - Watch the live terminal logs stream in!

---

## 📁 Discord Permissions Checklist

To make sure the bot functions properly:
1. Go to the **Bot** tab in the Discord Developer Portal.
2. Scroll to **Privileged Gateway Intents** and enable:
   - **Presence Intent**
   - **Server Members Intent**
   - **Message Content Intent** (Required to parse commands)
3. Go to **OAuth2 > URL Generator**.
4. Select scopes: `bot` and `applications.commands`.
5. Select permissions: **Read Messages/View Channels**, **Send Messages**, **Manage Messages**, **Read Message History**.
6. Copy the URL at the bottom and use it to invite the bot to your server.

---

## 📖 Commands Directory

### 👤 Public Commands
- `!ping` - Check latency between bot and Discord.
- `!say <message>` - Repeats the provided text (deletes original command).
- `!server` - Displays server profile details.
- `!user` - Displays user profile details.
- `!help` - Show all commands grouped by category.
- `!listcmds` - Displays a directory of all active custom commands.

### 👑 Owner-Only Commands (Discord Chat Management)
Manage your bot's command list directly in Discord chat:
- `!addcmd <name> <category> <response text...>` - Creates a new custom command or updates an existing one (e.g. `!addcmd rules Rules 1. Be respectful`).
- `!delcmd <name>` - Deletes the custom command (e.g. `!delcmd rules`).

---

## 🔒 Security & Privacy

This codebase acts as a clean, blank template. 
- All credentials, bot tokens, custom commands, and logs are kept strictly private on the host machine inside the local `.env` and `custom_commands.json` files.
- These files are configured inside `.gitignore` and **will never be uploaded** to GitHub.
- If someone else clones this project, they will have their own local, completely isolated database and instance.
