// --- GLOBAL STATE ---
let realToday = new Date();
let activeViewDate = new Date();
let globalSchedule = []; // Holds historical ledger data

// --- TIME AND MATH UTILITIES ---

function formatLocalResetTime(resetUtcHour) {
    let d = new Date();
    d.setUTCHours(resetUtcHour, 0, 0, 0);
    return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function getTimeUntilReset(resetUtcHour) {
    const now = new Date();
    let resetTime = new Date();
    resetTime.setUTCHours(resetUtcHour, 0, 0, 0);
    if (now > resetTime) resetTime.setUTCDate(resetTime.getUTCDate() + 1);

    const diffMs = resetTime - now;
    return {
        hours: Math.floor(diffMs / (1000 * 60 * 60)),
        minutes: Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    };
}

// BP math now calculates relative to the Active View Date
function getBPDaysRemaining(endDateStr) {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    const diffTime = end - activeViewDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
}

// Determines if we are in the Past, Present, or Future
function getViewMode() {
    const todayStr = realToday.toDateString();
    const viewStr = activeViewDate.toDateString();

    if (todayStr === viewStr) return 'present';
    if (activeViewDate < realToday) return 'past';
    return 'future';
}

// --- CALENDAR UI ---

function renderCalendar() {
    const ribbon = document.getElementById('calendar-ribbon');
    ribbon.innerHTML = '';

    // Generate -3 to +3 days from real today
    for (let i = -3; i <= 3; i++) {
        let d = new Date(realToday);
        d.setDate(realToday.getDate() + i);

        const isSelected = d.toDateString() === activeViewDate.toDateString();
        const isToday = d.toDateString() === realToday.toDateString();

        const dayName = d.toLocaleDateString('en-US', {
            weekday: 'short'
        });
        const dateNum = d.getDate();

        let colors = isSelected ?
            'bg-teal-600 text-white border-teal-400' :
            'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200';

        if (isToday && !isSelected) colors += ' ring-2 ring-gray-600';

        ribbon.innerHTML += `
            <button onclick="changeDate(${i})" class="flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-xl border transition cursor-pointer ${colors}">
                <span class="text-[10px] uppercase font-bold tracking-wider">${dayName}</span>
                <span class="text-xl font-bold">${dateNum}</span>
            </button>
        `;
    }

    // Update Mode Badge
    const badge = document.getElementById('view-mode-badge');
    const mode = getViewMode();
    if (mode === 'present') {
        badge.innerText = 'PRESENT MODE';
        badge.className = 'text-xs text-teal-500 uppercase tracking-widest font-bold mb-1';
    }
    if (mode === 'past') {
        badge.innerText = 'HISTORY MODE';
        badge.className = 'text-xs text-yellow-500 uppercase tracking-widest font-bold mb-1';
    }
    if (mode === 'future') {
        badge.innerText = 'PLANNER MODE';
        badge.className = 'text-xs text-purple-500 uppercase tracking-widest font-bold mb-1';
    }
}

function changeDate(offset) {
    let newDate = new Date(realToday);
    newDate.setDate(realToday.getDate() + offset);
    activeViewDate = newDate;
    renderCalendar();
    initializeDashboard(); // Reload data with new time context
}


// --- CORE LOGIC ---

// The engine that checks the past ledger or the present state
function isTaskCompleted(gameId, taskType, tasksState, resetUtcHour) {
    const mode = getViewMode();

    // FUTURE: Can't do tasks in the future
    if (mode === 'future') return {
        done: false,
        locked: true
    };

    // PAST: Search the schedule.json ledger
    if (mode === 'past') {
        const targetDateStr = activeViewDate.toDateString();
        const foundInHistory = globalSchedule.some(log => {
            if (log.game_id !== gameId || log.task_type !== taskType) return false;
            let logDate = new Date(log.timestamp);
            return logDate.toDateString() === targetDateStr;
        });
        return {
            done: foundInHistory,
            locked: foundInHistory
        }; // If done, locked. If not, open for backdating.
    }

    // PRESENT: Standard reset math using master_state.json
    let taskIsoStr = tasksState[taskType];
    if (!taskIsoStr) return {
        done: false,
        locked: false
    };

    const taskTime = new Date(taskIsoStr);
    let lastReset = new Date();
    lastReset.setUTCHours(resetUtcHour, 0, 0, 0);
    if (realToday < lastReset) lastReset.setUTCDate(lastReset.getUTCDate() - 1);

    if (taskType === 'last_weekly') {
        let dayOfWeek = lastReset.getUTCDay();
        let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        let lastWeeklyReset = new Date(lastReset);
        lastWeeklyReset.setUTCDate(lastWeeklyReset.getUTCDate() - daysSinceMonday);
        const done = taskTime >= lastWeeklyReset;
        return {
            done: done,
            locked: done
        };
    }

    const done = taskTime >= lastReset;
    return {
        done: done,
        locked: done
    };
}


async function initializeDashboard() {
    try {
        const [gamesRes, stateRes, scheduleRes] = await Promise.all([
            fetch('db/games.json?t=' + Date.now()),
            fetch('db/user/master_state.json?t=' + Date.now()),
            fetch('db/user/schedule.json?t=' + Date.now()).catch(() => ({
                json: () => []
            })) // Safe fallback if empty
        ]);

        const rawGames = await gamesRes.json();
        const masterState = await stateRes.json();
        globalSchedule = await scheduleRes.json();

        let activeGames = rawGames.map(game => {
            const userState = masterState[game.id];
            if (!userState) return null;

            return {
                ...game,
                tier: userState.tier,
                platforms: userState.platform,
                bp_end_date: userState.bp_end_date,
                tasks: userState.tasks,
                bp_days_left: getBPDaysRemaining(userState.bp_end_date)
            };
        }).filter(g => g !== null);

        const tierWeights = {
            "High": 1,
            "Mid": 2,
            "Low": 3,
            "Mood": 4
        };

        activeGames.sort((a, b) => {
            if (tierWeights[a.tier] !== tierWeights[b.tier]) return tierWeights[a.tier] - tierWeights[b.tier];
            if (a.tier === "High") {
                const bpA = a.bp_days_left !== null ? a.bp_days_left : 999;
                const bpB = b.bp_days_left !== null ? b.bp_days_left : 999;
                return bpA - bpB;
            }
            return 0;
        });

        renderGrid(activeGames);

    } catch (error) {
        console.error("Failed to load telemetry:", error);
        document.getElementById('game-grid').innerHTML = `<p class="text-red-400 col-span-full border border-red-800 bg-red-900/20 p-4 rounded text-center">Connection Error. Make sure Uvicorn is running.</p>`;
    }
}

// --- UI RENDERING ---

function renderGrid(games) {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';

    games.forEach(game => {
        const timeRemaining = getTimeUntilReset(game.reset_utc_hour);
        const isUrgentReset = timeRemaining.hours < 3;
        const resetColor = isUrgentReset ? 'text-orange-400 font-bold' : 'text-gray-400';

        let bpBadge = '';
        if (game.bp_days_left !== null) {
            const isBpUrgent = game.bp_days_left <= 10;
            const bpColor = isBpUrgent ? 'bg-red-900 text-red-200 border-red-500' : 'bg-gray-700 text-gray-300 border-gray-600';
            bpBadge = `<div class="text-xs font-bold border px-2 py-1 rounded shadow-sm ${bpColor}">BP: ${game.bp_days_left} Days</div>`;
        }

        const tierColors = {
            "High": "text-yellow-400 border-yellow-400",
            "Mid": "text-blue-400 border-blue-400",
            "Low": "text-green-400 border-green-400",
            "Mood": "text-purple-400 border-purple-400"
        };
        const tierTag = `<span class="text-[10px] uppercase font-bold tracking-widest border px-1.5 py-0.5 rounded ${tierColors[game.tier]}">${game.tier}</span>`;

        // Run the Time Machine logic for checkboxes
        const loginState = isTaskCompleted(game.id, 'last_login', game.tasks, game.reset_utc_hour);
        const dailyState = isTaskCompleted(game.id, 'last_daily', game.tasks, game.reset_utc_hour);
        const weeklyState = isTaskCompleted(game.id, 'last_weekly', game.tasks, game.reset_utc_hour);

        grid.innerHTML += `
            <div class="bg-gray-800 rounded-xl p-5 border-l-4 shadow-lg ${game.theme} flex flex-col justify-between transition hover:bg-gray-750">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="text-lg font-bold text-white leading-tight mb-1">${game.name}</h3>
                        <div class="flex gap-2 items-center">
                            ${tierTag}
                            <span class="text-xs text-gray-500">${game.platforms.join(', ')}</span>
                        </div>
                    </div>
                    ${bpBadge}
                </div>
                
                <div class="my-4 space-y-1 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Local Reset</span>
                        <span class="text-xs font-mono text-gray-400">${formatLocalResetTime(game.reset_utc_hour)}</span>
                    </div>
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Time Until Reset</span>
                        <span class="text-sm font-mono ${resetColor}">${timeRemaining.hours}h ${timeRemaining.minutes}m</span>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-2 mt-auto">
                    <label class="flex flex-col items-center justify-center p-2 rounded bg-gray-700 hover:bg-gray-600 cursor-pointer border border-gray-600 transition ${loginState.locked ? 'opacity-30 cursor-not-allowed' : ''}">
                        <input type="checkbox" data-game="${game.id}" data-task="last_login" class="task-checkbox mb-1 w-4 h-4 accent-teal-500 cursor-pointer" ${loginState.done ? 'checked' : ''} ${loginState.locked ? 'disabled' : ''}>
                        <span class="text-[10px] font-bold text-gray-300 uppercase">Login</span>
                    </label>
                    <label class="flex flex-col items-center justify-center p-2 rounded bg-gray-700 hover:bg-gray-600 cursor-pointer border border-gray-600 transition ${dailyState.locked ? 'opacity-30 cursor-not-allowed' : ''}">
                        <input type="checkbox" data-game="${game.id}" data-task="last_daily" class="task-checkbox mb-1 w-4 h-4 accent-teal-500 cursor-pointer" ${dailyState.done ? 'checked' : ''} ${dailyState.locked ? 'disabled' : ''}>
                        <span class="text-[10px] font-bold text-gray-300 uppercase">Daily</span>
                    </label>
                    <label class="flex flex-col items-center justify-center p-2 rounded bg-gray-700 hover:bg-gray-600 cursor-pointer border border-gray-600 transition ${weeklyState.locked ? 'opacity-30 cursor-not-allowed' : ''}">
                        <input type="checkbox" data-game="${game.id}" data-task="last_weekly" class="task-checkbox mb-1 w-4 h-4 accent-purple-500 cursor-pointer" ${weeklyState.done ? 'checked' : ''} ${weeklyState.locked ? 'disabled' : ''}>
                        <span class="text-[10px] font-bold text-gray-300 uppercase">Weekly</span>
                    </label>
                </div>
            </div>
        `;
    });
}

// --- DATABASE SYNCING ---

async function syncTasks() {
    const checkboxes = document.querySelectorAll('.task-checkbox:checked');
    const logs = [];

    // BACKDATING: If we are viewing a past date, generate a timestamp for noon on that specific day
    let syncTimestamp = new Date();
    if (getViewMode() === 'past') {
        syncTimestamp = new Date(activeViewDate);
        syncTimestamp.setHours(12, 0, 0); // Fake the time to noon on the historical day
    }
    const isoTimestamp = syncTimestamp.toISOString();

    checkboxes.forEach(box => {
        if (!box.disabled) {
            logs.push({
                timestamp: isoTimestamp,
                game_id: box.getAttribute('data-game'),
                task_type: box.getAttribute('data-task'),
                action: "Completed"
            });
        }
    });

    if (logs.length === 0) {
        alert("No new tasks to sync.");
        return;
    }

    try {
        const response = await fetch('/api/save_tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                logs: logs
            })
        });
        const result = await response.json();
        if (result.status === "success") {
            checkboxes.forEach(box => {
                if (!box.disabled) {
                    box.disabled = true;
                    box.parentElement.classList.add('opacity-30', 'cursor-not-allowed');
                }
            });
            alert(`Saved! Context: ${getViewMode().toUpperCase()}`);
        }
    } catch (error) {
        alert("Failed to sync. Server down.");
    }
}

// The Context-Aware Reset Function
async function resetAllTasks() {
    const mode = getViewMode();
    const targetDateStr = activeViewDate.toDateString();

    // Create a safe YYYY-MM-DD string to send to the backend
    let syncTimestamp = new Date(activeViewDate);
    syncTimestamp.setHours(12, 0, 0);
    const dbTargetDate = syncTimestamp.toISOString().split('T')[0];

    if (!confirm(`Targeted DB Flush: Are you sure you want to erase all telemetry for ${targetDateStr}?`)) return;

    try {
        const res = await fetch('/api/reset_state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mode: mode,
                date: dbTargetDate
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            location.reload();
        }
    } catch (e) {
        console.error("Reset failed:", e);
        alert("Failed to contact FastAPI backend.");
    }
}

// --- INIT ---
function updateClock() {
    document.getElementById('local-clock').innerText = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();
renderCalendar();
initializeDashboard();