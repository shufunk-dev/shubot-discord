document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnRestart = document.getElementById('btnRestart');
  
  const terminalConsole = document.getElementById('terminalConsole');
  const btnAutoscroll = document.getElementById('btnAutoscroll');
  const btnClearConsole = document.getElementById('btnClearConsole');
  
  const settingsForm = document.getElementById('settingsForm');
  const tokenInput = document.getElementById('tokenInput');
  const btnToggleToken = document.getElementById('btnToggleToken');
  const tokenBadge = document.getElementById('tokenBadge');
  const prefixInput = document.getElementById('prefixInput');
  const statusTypeSelect = document.getElementById('statusTypeSelect');
  const statusTextInput = document.getElementById('statusTextInput');
  const ownerIdInput = document.getElementById('ownerIdInput');
  
  const cmdPrefixes = document.querySelectorAll('.cmd-prefix');
  
  let autoscroll = true;
  let isTokenVisible = false;
  let currentStatus = 'offline';

  // Toggle Token Visibility
  btnToggleToken.addEventListener('click', () => {
    isTokenVisible = !isTokenVisible;
    tokenInput.type = isTokenVisible ? 'text' : 'password';
    
    // Change eye icon
    btnToggleToken.innerHTML = isTokenVisible 
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.024 10.024 0 014.507-4.829m2-1.36a10.125 10.125 0 0112.113 4.22m-3.9 3.9a3 3 0 11-4.22-4.22m3.75 3.75a3 3 0 00-4-4" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18" />
        </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>`;
  });

  // Load configuration from server
  async function loadConfig() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      
      if (data.success) {
        prefixInput.value = data.config.prefix || '!';
        statusTypeSelect.value = data.config.statusType || 'PLAYING';
        statusTextInput.value = data.config.statusText || 'with Discord.js!';
        
        // Update command preview prefixes
        updateCommandPrefixes(data.config.prefix || '!');
        
        // Update token badge
        if (data.tokenExists) {
          tokenBadge.textContent = 'Configured';
          tokenBadge.className = 'badge configured';
          tokenInput.placeholder = '••••••••••••••••••••••••••••••••••••••••';
        } else {
          tokenBadge.textContent = 'Not Configured';
          tokenBadge.className = 'badge not-configured';
          tokenInput.placeholder = 'Paste your bot token here...';
        }
        
        // Update owner ID field
        ownerIdInput.value = data.ownerId || '';
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
  }

  function updateCommandPrefixes(prefix) {
    cmdPrefixes.forEach(el => {
      el.textContent = prefix;
    });
  }

  // Save configurations
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = tokenInput.value.trim();
    const prefix = prefixInput.value.trim();
    const statusType = statusTypeSelect.value;
    const statusText = statusTextInput.value.trim();
    const ownerId = ownerIdInput.value.trim();
    
    const payload = { prefix, statusType, statusText, ownerId };
    // Only send token if the user typed something in
    if (token) {
      payload.token = token;
    }
    
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (data.success) {
        alert('Configurations saved successfully!');
        tokenInput.value = ''; // Clear visual token input
        loadConfig();
      } else {
        alert(`Failed to save: ${data.error}`);
      }
    } catch (err) {
      alert(`Error saving configuration: ${err.message}`);
    }
  });

  // Update Status UI
  function updateStatusUI(status) {
    currentStatus = status;
    statusLabel.textContent = status.toUpperCase();
    
    // Clear classes
    statusDot.className = 'status-dot';
    statusDot.classList.add(status);
    
    // Manage button states
    if (status === 'online') {
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnRestart.disabled = false;
    } else if (status === 'offline') {
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnRestart.disabled = true;
    } else if (status === 'starting') {
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnRestart.disabled = true;
    }
  }

  // EventSource for Status Stream
  const statusEvents = new EventSource('/api/status/stream');
  statusEvents.onmessage = (e) => {
    const data = JSON.parse(e.data);
    updateStatusUI(data.status);
  };
  
  statusEvents.onerror = () => {
    updateStatusUI('offline');
  };

  // EventSource for Log Stream
  const logEvents = new EventSource('/api/logs/stream');
  logEvents.onmessage = (e) => {
    const log = JSON.parse(e.data);
    appendLog(log);
  };

  function appendLog(log) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.source}`;
    
    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = `[${log.timestamp}]`;
    
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = log.text;
    
    entry.appendChild(ts);
    entry.appendChild(text);
    
    terminalConsole.appendChild(entry);
    
    if (autoscroll) {
      terminalConsole.scrollTop = terminalConsole.scrollHeight;
    }
  }

  // Clear Terminal
  btnClearConsole.addEventListener('click', () => {
    terminalConsole.innerHTML = '';
  });

  // Toggle Autoscroll
  btnAutoscroll.addEventListener('click', () => {
    autoscroll = !autoscroll;
    btnAutoscroll.classList.toggle('active', autoscroll);
    btnAutoscroll.textContent = `Autoscroll: ${autoscroll ? 'On' : 'Off'}`;
  });

  // Bot Lifecycle Controls
  btnStart.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/bot/start', { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Failed to start bot.');
      }
    } catch (err) {
      alert(`Error starting bot: ${err.message}`);
    }
  });

  btnStop.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Failed to stop bot.');
      }
    } catch (err) {
      alert(`Error stopping bot: ${err.message}`);
    }
  });

  btnRestart.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/bot/restart', { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Failed to restart bot.');
      }
    } catch (err) {
      alert(`Error restarting bot: ${err.message}`);
    }
  });

  // Custom Commands UI Logic
  const tabBuiltIn = document.getElementById('tabBuiltIn');
  const tabCustom = document.getElementById('tabCustom');
  const contentBuiltIn = document.getElementById('contentBuiltIn');
  const contentCustom = document.getElementById('contentCustom');
  const customCommandsList = document.getElementById('customCommandsList');
  const customCommandForm = document.getElementById('customCommandForm');
  const customCmdName = document.getElementById('customCmdName');
  const customCmdCategory = document.getElementById('customCmdCategory');
  const customCmdResponse = document.getElementById('customCmdResponse');
  
  const formTitle = document.getElementById('formTitle');
  const btnSubmitCustom = document.getElementById('btnSubmitCustom');
  const btnCancelEdit = document.getElementById('btnCancelEdit');

  let editingCommandName = null;

  // Tab switching
  tabBuiltIn.addEventListener('click', () => {
    tabBuiltIn.classList.add('active');
    tabCustom.classList.remove('active');
    contentBuiltIn.classList.remove('hidden');
    contentCustom.classList.add('hidden');
  });

  tabCustom.addEventListener('click', () => {
    tabCustom.classList.add('active');
    tabBuiltIn.classList.remove('active');
    contentCustom.classList.remove('hidden');
    contentBuiltIn.classList.add('hidden');
    loadCustomCommands();
  });

  // Load Custom Commands
  async function loadCustomCommands() {
    try {
      const response = await fetch('/api/commands');
      const data = await response.json();
      if (data.success) {
        updateCategoryDatalist(data.commands);
        renderCustomCommands(data.commands);
      }
    } catch (err) {
      console.error('Error loading custom commands:', err);
    }
  }

  // Dynamically update category list suggestions
  function updateCategoryDatalist(commands) {
    const suggestions = document.getElementById('categorySuggestions');
    if (!suggestions) return;
    
    const categories = new Set();
    Object.values(commands).forEach(cmd => {
      const cat = typeof cmd === 'object' ? cmd.category : 'General';
      if (cat) categories.add(cat);
    });
    
    // Add defaults
    ['General', 'Links', 'Rules', 'Fun', 'Utility'].forEach(cat => categories.add(cat));
    
    suggestions.innerHTML = '';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      suggestions.appendChild(option);
    });
  }

  function renderCustomCommands(commands) {
    customCommandsList.innerHTML = '';
    const keys = Object.keys(commands);
    
    if (keys.length === 0) {
      customCommandsList.innerHTML = '<p class="no-commands">No custom commands added yet.</p>';
      return;
    }
    
    const prefix = prefixInput.value || '!';
    keys.forEach(name => {
      const cmdObj = typeof commands[name] === 'object' 
        ? commands[name] 
        : { response: commands[name], category: 'General' };

      const item = document.createElement('div');
      item.className = 'custom-commands-list-item';
      
      const details = document.createElement('div');
      
      const syntax = document.createElement('span');
      syntax.className = 'cmd-syntax';
      
      const pfx = document.createElement('span');
      pfx.className = 'cmd-prefix';
      pfx.textContent = prefix;
      
      const nm = document.createTextNode(name);
      
      syntax.appendChild(pfx);
      syntax.appendChild(nm);
      
      // Category Tag
      const catTag = document.createElement('span');
      catTag.style.fontSize = '0.7rem';
      catTag.style.background = 'rgba(88, 101, 242, 0.15)';
      catTag.style.color = '#a5b4fc';
      catTag.style.border = '1px solid rgba(88, 101, 242, 0.3)';
      catTag.style.padding = '0.1rem 0.4rem';
      catTag.style.borderRadius = '4px';
      catTag.style.marginLeft = '0.5rem';
      catTag.style.fontWeight = '600';
      catTag.style.display = 'inline-block';
      catTag.textContent = cmdObj.category || 'General';
      syntax.appendChild(catTag);
      
      const desc = document.createElement('p');
      desc.style.fontSize = '0.8rem';
      desc.style.color = 'var(--text-secondary)';
      desc.style.marginTop = '0.2rem';
      desc.textContent = cmdObj.response;
      
      details.appendChild(syntax);
      details.appendChild(desc);
      
      // Action Group for Edit/Delete
      const actionGroup = document.createElement('div');
      actionGroup.style.display = 'flex';
      actionGroup.style.alignItems = 'center';
      
      // Edit Button
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-icon';
      editBtn.type = 'button';
      editBtn.style.color = 'var(--color-warning)';
      editBtn.style.marginRight = '0.5rem';
      editBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      `;
      editBtn.title = 'Edit Command';
      editBtn.addEventListener('click', () => startEditCustomCommand(name, cmdObj));
      
      // Delete Button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      `;
      deleteBtn.title = 'Delete Command';
      deleteBtn.addEventListener('click', () => deleteCustomCommand(name));
      
      actionGroup.appendChild(editBtn);
      actionGroup.appendChild(deleteBtn);
      
      item.appendChild(details);
      item.appendChild(actionGroup);
      
      customCommandsList.appendChild(item);
    });
  }

  // Start Edit Mode
  function startEditCustomCommand(name, cmdObj) {
    editingCommandName = name;
    customCmdName.value = name;
    customCmdCategory.value = cmdObj.category || 'General';
    customCmdResponse.value = cmdObj.response;
    
    formTitle.textContent = 'Edit Custom Command';
    btnSubmitCustom.textContent = 'Update Command';
    btnCancelEdit.classList.remove('hidden');
    
    customCmdResponse.focus();
  }

  // Cancel Edit Mode
  function cancelEditCustomCommand() {
    editingCommandName = null;
    customCmdName.value = '';
    customCmdCategory.value = '';
    customCmdResponse.value = '';
    
    formTitle.textContent = 'Create Custom Command';
    btnSubmitCustom.textContent = 'Add Command';
    btnCancelEdit.classList.add('hidden');
  }

  btnCancelEdit.addEventListener('click', cancelEditCustomCommand);

  // Create/Update Custom Command
  customCommandForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = customCmdName.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const categoryText = customCmdCategory.value.trim();
    const responseText = customCmdResponse.value.trim();
    
    try {
      // If we are editing, and the name changed, delete the old one first
      if (editingCommandName && editingCommandName !== name) {
        const deleteResponse = await fetch(`/api/commands/${editingCommandName}`, {
          method: 'DELETE'
        });
        const deleteData = await deleteResponse.json();
        if (!deleteData.success) {
          alert(`Failed to update command name: ${deleteData.error}`);
          return;
        }
      }
      
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, response: responseText, category: categoryText })
      });
      const data = await response.json();
      if (data.success) {
        cancelEditCustomCommand();
        loadCustomCommands();
      } else {
        alert(`Failed to save command: ${data.error}`);
      }
    } catch (err) {
      alert(`Error saving command: ${err.message}`);
    }
  });

  // Delete Custom Command
  async function deleteCustomCommand(name) {
    // If we are currently editing the one being deleted, cancel edit mode
    if (editingCommandName === name) {
      cancelEditCustomCommand();
    }
    
    if (!confirm(`Are you sure you want to delete command !${name}?`)) return;
    
    try {
      const response = await fetch(`/api/commands/${name}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        loadCustomCommands();
      } else {
        alert(`Failed to delete command: ${data.error}`);
      }
    } catch (err) {
      alert(`Error deleting command: ${err.message}`);
    }
  }

  // Initial Load
  loadConfig();
  loadCustomCommands();
});
