// --- DATA FETCHING ---
async function loadControlRoom() {
    try {
        const res = await fetch('/api/data?t=' + Date.now());
        const data = await res.json();
        renderGameSettings(data.games, data.master_state);
        renderLedger(data.schedule, data.games);
    } catch (e) {
        document.getElementById('settings-grid').innerHTML = `<p class="text-red-400">Failed to connect to FastAPI.</p>`;
    }
}

// --- ACTIVE OPERATIONS (UPDATE BP & TIERS) ---
function renderGameSettings(games, masterState) {
    const grid = document.getElementById('settings-grid');
    grid.innerHTML = '';

    games.forEach(game => {
        const state = masterState[game.id];
        if (!state) return;

        const tiers = ['High', 'Mid', 'Low', 'Mood'];
        const options = tiers.map(t => `<option value="${t}" ${state.tier === t ? 'selected' : ''}>${t}</option>`).join('');
        const bpDate = state.bp_end_date ? state.bp_end_date : '';

        grid.innerHTML += `
            <div class="flex flex-col md:flex-row md:items-center justify-between bg-gray-900 p-4 rounded-lg border border-gray-700 gap-4">
                <div class="w-1/3">
                    <h3 class="font-bold text-white">${game.name}</h3>
                    <span class="text-xs text-gray-500">${game.region} Server</span>
                </div>
                
                <div class="flex gap-4 flex-1 justify-end items-center">
                    <div class="flex flex-col">
                        <label class="text-[10px] uppercase font-bold text-gray-500 mb-1">Priority Tier</label>
                        <select id="tier-${game.id}" class="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm focus:border-teal-500 focus:outline-none">
                            ${options}
                        </select>
                    </div>
                    <div class="flex flex-col">
                        <label class="text-[10px] uppercase font-bold text-gray-500 mb-1">BP Expiration (Optional)</label>
                        <input type="date" id="bp-${game.id}" value="${bpDate}" class="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm focus:border-teal-500 focus:outline-none">
                    </div>
                    <button onclick="saveGameConfig('${game.id}')" class="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 mt-4 rounded font-bold text-xs uppercase tracking-wider transition">Update</button>
                </div>
            </div>
        `;
    });
}

async function saveGameConfig(gameId) {
    const newTier = document.getElementById(`tier-${gameId}`).value;
    const newBp = document.getElementById(`bp-${gameId}`).value;

    try {
        const res = await fetch('/api/update_game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: gameId,
                tier: newTier,
                bp_end_date: newBp
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('Settings Saved Successfully!');
            loadControlRoom();
        }
    } catch (e) {
        alert("Save failed.");
    }
}

// --- SURGICAL LOG DELETION ---
function renderLedger(schedule, games) {
    const tbody = document.getElementById('ledger-table');
    tbody.innerHTML = '';

    // Reverse to show newest first, limit to last 20 for performance
    const recentLogs = schedule.slice().reverse().slice(0, 20);

    if (recentLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500 italic">No telemetry recorded yet.</td></tr>`;
        return;
    }

    // Helper map to translate 'hsr' into 'Honkai: Star Rail' for readability
    const gameMap = {};
    games.forEach(g => gameMap[g.id] = g.name);

    recentLogs.forEach(log => {
        const d = new Date(log.timestamp);
        const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        const gameName = gameMap[log.game_id] || log.game_id;
        const taskName = log.task_type.replace('last_', '').toUpperCase();

        tbody.innerHTML += `
            <tr class="hover:bg-gray-800 transition">
                <td class="px-4 py-3 font-mono text-gray-400">${dateStr}</td>
                <td class="px-4 py-3 font-bold text-white">${gameName}</td>
                <td class="px-4 py-3 text-teal-400 font-bold text-xs">${taskName}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick="deleteLog('${log.log_id}')" class="text-xs border border-red-900 bg-red-900/30 text-red-400 hover:bg-red-800 hover:text-white px-2 py-1 rounded transition">Scrub Log</button>
                </td>
            </tr>
        `;
    });
}

async function deleteLog(logId) {
    if (!confirm("Are you sure you want to permanently erase this historical log?")) return;
    try {
        const res = await fetch('/api/delete_log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                log_id: logId
            })
        });
        const data = await res.json();
        if (data.status === 'success') loadControlRoom();
    } catch (e) {
        alert("Deletion failed.");
    }
}

// Init
loadControlRoom();