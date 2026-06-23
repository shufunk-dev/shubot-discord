const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const pidFile = path.join(__dirname, 'bot.pid');

// Check and kill orphaned bot processes from previous runs
if (fs.existsSync(pidFile)) {
  try {
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (oldPid) {
      console.log(`[Dashboard] Found orphaned bot process (PID ${oldPid}). Terminating...`);
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try { execSync(`taskkill /f /pid ${oldPid}`); } catch(e){}
      } else {
        try { process.kill(oldPid, 'SIGKILL'); } catch(e){}
      }
    }
  } catch (err) {
    console.error(`[Dashboard Error] Failed to clean up orphaned bot: ${err.message}`);
  }
  try { fs.unlinkSync(pidFile); } catch (e) {}
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let botProcess = null;
let botStatus = 'offline';
let logs = [];
const maxLogs = 500;
const statusClients = new Set();
const logClients = new Set();

// Utility: Add log entry and broadcast to clients
function addLog(text, source = 'system') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, text, source };
  logs.push(logEntry);
  if (logs.length > maxLogs) {
    logs.shift();
  }
  
  // Format for SSE
  const sseData = `data: ${JSON.stringify(logEntry)}\n\n`;
  logClients.forEach(client => client.write(sseData));
}

// Utility: Update status and broadcast
function updateStatus(status) {
  botStatus = status;
  const sseData = `data: ${JSON.stringify({ status })}\n\n`;
  statusClients.forEach(client => client.write(sseData));
}

// Server-Sent Events (SSE) for Logs
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send historical logs first
  logs.forEach(logEntry => {
    res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
  });

  logClients.add(res);

  req.on('close', () => {
    logClients.delete(res);
  });
});

// Server-Sent Events (SSE) for Status
app.get('/api/status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current status immediately
  res.write(`data: ${JSON.stringify({ status: botStatus })}\n\n`);

  statusClients.add(res);

  req.on('close', () => {
    statusClients.delete(res);
  });
});

// Helper: Update environmental variables in .env
function updateEnvVariable(key, value) {
  const envPath = path.join(__dirname, '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  let lines = envContent.split('\n');
  let updated = false;
  
  lines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });
  
  if (!updated) {
    lines.push(`${key}=${value}`);
  }
  
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
  process.env[key] = value;
}

// Get Config Endpoint
app.get('/api/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    const tokenExists = !!process.env.DISCORD_TOKEN;
    const ownerId = process.env.OWNER_ID || '';
    
    res.json({
      success: true,
      config,
      tokenExists,
      ownerId
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save Config Endpoint
app.post('/api/config', (req, res) => {
  try {
    const { token, prefix, statusType, statusText, ownerId, moderationEnabled, dndEnabled } = req.body;
    
    // Save to config.json
    const configPath = path.join(__dirname, 'config.json');
    const config = { 
      prefix, 
      statusType, 
      statusText,
      moderationEnabled: moderationEnabled === true,
      dndEnabled: dndEnabled === true
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    // Update token if provided
    if (token !== undefined) {
      updateEnvVariable('DISCORD_TOKEN', token);
    }
    
    // Update owner ID if provided
    if (ownerId !== undefined) {
      updateEnvVariable('OWNER_ID', ownerId);
    }
    
    addLog('[Dashboard] Configurations updated.', 'system');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Custom Commands Endpoint
app.get('/api/commands', (req, res) => {
  try {
    const commandsPath = path.join(__dirname, 'custom_commands.json');
    let commands = {};
    if (fs.existsSync(commandsPath)) {
      commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
    }
    res.json({ success: true, commands });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save/Update Custom Command Endpoint
app.post('/api/commands', (req, res) => {
  try {
    const { name, response: cmdResponse, category } = req.body;
    if (!name || name.trim() === '' || !cmdResponse || cmdResponse.trim() === '') {
      return res.status(400).json({ success: false, error: 'Command name and response are required.' });
    }
    
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Invalid command name. Use alphanumeric characters only.' });
    }
    
    const cleanCategory = (category && category.trim() !== '') ? category.trim() : 'General';
    
    const commandsPath = path.join(__dirname, 'custom_commands.json');
    let commands = {};
    if (fs.existsSync(commandsPath)) {
      commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
    }
    
    // Support upgrading old flat strings to new objects if they exist
    commands[cleanName] = {
      response: cmdResponse,
      category: cleanCategory
    };
    fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2), 'utf8');
    
    addLog(`[Dashboard] Custom command saved: ${cleanName} [${cleanCategory}]`, 'system');
    res.json({ success: true, name: cleanName });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Custom Command Endpoint
app.delete('/api/commands/:name', (req, res) => {
  try {
    const name = req.params.name.trim().toLowerCase();
    const commandsPath = path.join(__dirname, 'custom_commands.json');
    if (!fs.existsSync(commandsPath)) {
      return res.status(404).json({ success: false, error: 'No custom commands found.' });
    }
    
    let commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
    if (commands[name] === undefined) {
      return res.status(404).json({ success: false, error: `Command ${name} does not exist.` });
    }
    
    delete commands[name];
    fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2), 'utf8');
    
    addLog(`[Dashboard] Custom command deleted: ${name}`, 'system');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function killBotProcess(callback) {
  if (!botProcess) {
    if (callback) callback();
    return;
  }

  const pid = botProcess.pid;
  const cleanup = () => {
    botProcess = null;
    updateStatus('offline');
    try {
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    } catch(e){}
    if (callback) callback();
  };

  if (process.platform === 'win32') {
    addLog(`[Dashboard] Sending force-kill signal to process tree (PID ${pid})...`, 'system');
    exec(`taskkill /pid ${pid} /t /f`, (error) => {
      if (error) {
        addLog(`[Dashboard Error] taskkill error: ${error.message}`, 'error');
      }
      cleanup();
    });
  } else {
    botProcess.once('close', cleanup);
    botProcess.kill('SIGKILL');
  }
}

// Start Bot Endpoint
app.post('/api/bot/start', (req, res) => {
  if (botProcess) {
    return res.json({ success: false, message: 'Bot is already running.' });
  }
  
  const token = process.env.DISCORD_TOKEN;
  if (!token || token.trim() === '') {
    addLog('[Dashboard] Failed to start bot: Discord Token is missing.', 'error');
    return res.json({ success: false, message: 'Discord Token is missing. Please save your Token in the Settings panel.' });
  }
  
  addLog('[Dashboard] Starting Discord bot...', 'system');
  updateStatus('starting');
  
  try {
    // Spawn bot.js process
    botProcess = spawn('node', ['bot.js'], {
      cwd: __dirname,
      env: { ...process.env }
    });
    
    // Write PID file
    fs.writeFileSync(pidFile, botProcess.pid.toString(), 'utf8');
    
    botProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          addLog(trimmed, 'bot');
        }
      });
    });
    
    botProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          addLog(trimmed, 'bot-error');
        }
      });
    });
    
    botProcess.on('close', (code) => {
      addLog(`[Dashboard] Bot process exited with code ${code}`, 'system');
      botProcess = null;
      updateStatus('offline');
      try {
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      } catch(e){}
    });
    
    botProcess.on('error', (err) => {
      addLog(`[Dashboard] Failed to start bot process: ${err.message}`, 'error');
      botProcess = null;
      updateStatus('offline');
      try {
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      } catch(e){}
    });
    
    // We give it a short duration to verify it spawns correctly
    setTimeout(() => {
      if (botProcess) {
        updateStatus('online');
      }
    }, 1500);
    
    res.json({ success: true });
  } catch (err) {
    addLog(`[Dashboard] Error spawning bot process: ${err.message}`, 'error');
    updateStatus('offline');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop Bot Endpoint
app.post('/api/bot/stop', (req, res) => {
  if (!botProcess) {
    return res.json({ success: false, message: 'Bot is not running.' });
  }
  
  addLog('[Dashboard] Stopping Discord bot...', 'system');
  
  killBotProcess(() => {
    res.json({ success: true });
  });
});

// Restart Bot Endpoint
app.post('/api/bot/restart', (req, res) => {
  addLog('[Dashboard] Restarting bot...', 'system');
  
  if (botProcess) {
    killBotProcess(() => {
      setTimeout(() => {
        startBotInternal(res);
      }, 500);
    });
  } else {
    startBotInternal(res);
  }
});

function startBotInternal(res) {
  const token = process.env.DISCORD_TOKEN;
  if (!token || token.trim() === '') {
    addLog('[Dashboard] Failed to start bot: Discord Token is missing.', 'error');
    return res.json({ success: false, message: 'Discord Token is missing.' });
  }
  
  updateStatus('starting');
  try {
    botProcess = spawn('node', ['bot.js'], {
      cwd: __dirname,
      env: { ...process.env }
    });
    
    // Write PID file
    fs.writeFileSync(pidFile, botProcess.pid.toString(), 'utf8');
    
    botProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          addLog(trimmed, 'bot');
        }
      });
    });
    
    botProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          addLog(trimmed, 'bot-error');
        }
      });
    });
    
    botProcess.on('close', (code) => {
      addLog(`[Dashboard] Bot process exited with code ${code}`, 'system');
      botProcess = null;
      updateStatus('offline');
      try {
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      } catch(e){}
    });
    
    botProcess.on('error', (err) => {
      addLog(`[Dashboard] Bot process error: ${err.message}`, 'error');
      botProcess = null;
      updateStatus('offline');
      try {
        if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      } catch(e){}
    });
    
    setTimeout(() => {
      if (botProcess) {
        updateStatus('online');
      }
    }, 1500);
    
    res.json({ success: true });
  } catch (err) {
    addLog(`[Dashboard] Error spawning bot process: ${err.message}`, 'error');
    updateStatus('offline');
    res.status(500).json({ success: false, error: err.message });
  }
}

// Clean shutdown of child process if dashboard server terminates
process.on('SIGINT', () => {
  if (botProcess) {
    botProcess.kill();
  }
  process.exit();
});

process.on('SIGTERM', () => {
  if (botProcess) {
    botProcess.kill();
  }
  process.exit();
});

// Start dashboard server
app.listen(PORT, () => {
  addLog(`[Dashboard] Manager server listening on http://localhost:${PORT}`, 'system');
  console.log(`[Dashboard] Manager server running on http://localhost:${PORT}`);
});
