from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import json
import os

app = FastAPI()

SCHEDULE_FILE = "db/user/schedule.json"
MASTER_STATE_FILE = "db/user/master_state.json"
GAMES_FILE = "db/games.json"


def safe_read_json(filepath, default_val):
    if not os.path.exists(filepath):
        return default_val
    try:
        with open(filepath, "r") as f:
            data = json.load(f)
            return data if data else default_val
    except json.JSONDecodeError:
        return default_val


# --- PHASE 3/4 ENDPOINTS (CORE DASHBOARD) ---


@app.post("/api/save_tasks")
async def save_tasks(request: Request):
    try:
        data = await request.json()
        logs_to_save = data.get("logs", [])
        if not logs_to_save:
            return JSONResponse({"status": "empty"})

        master_state = safe_read_json(MASTER_STATE_FILE, {})
        for log in logs_to_save:
            if log["game_id"] in master_state:
                master_state[log["game_id"]]["tasks"][log["task_type"]] = log[
                    "timestamp"
                ]
        with open(MASTER_STATE_FILE, "w") as f:
            json.dump(master_state, f, indent=2)

        schedule = safe_read_json(SCHEDULE_FILE, [])
        for log in logs_to_save:
            # Generate a unique ID based on length + timestamp to avoid collisions
            log["log_id"] = f"{len(schedule)}_{log['timestamp']}"
            schedule.append(log)
        with open(SCHEDULE_FILE, "w") as f:
            json.dump(schedule, f, indent=2)

        return JSONResponse({"status": "success"})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/reset_state")
async def reset_state(request: Request):
    data = await request.json()
    target_date = data.get("date")

    schedule = safe_read_json(SCHEDULE_FILE, [])
    if target_date:
        filtered_schedule = [
            log for log in schedule if log["timestamp"].split("T")[0] != target_date
        ]
        with open(SCHEDULE_FILE, "w") as f:
            json.dump(filtered_schedule, f, indent=2)

    if data.get("mode") == "present":
        master_state = safe_read_json(MASTER_STATE_FILE, {})
        for game_id in master_state:
            master_state[game_id]["tasks"] = {
                "last_login": None,
                "last_daily": None,
                "last_weekly": None,
            }
        with open(MASTER_STATE_FILE, "w") as f:
            json.dump(master_state, f, indent=2)

    return JSONResponse({"status": "success"})


# --- PHASE 5 ENDPOINTS (CONTROL ROOM) ---


@app.get("/api/data")
async def get_all_data():
    return {
        "games": safe_read_json(GAMES_FILE, []),
        "master_state": safe_read_json(MASTER_STATE_FILE, {}),
        "schedule": safe_read_json(SCHEDULE_FILE, []),
    }


@app.post("/api/update_game")
async def update_game(request: Request):
    data = await request.json()
    master_state = safe_read_json(MASTER_STATE_FILE, {})
    game_id = data.get("id")

    if game_id in master_state:
        master_state[game_id]["tier"] = data.get("tier")
        master_state[game_id]["bp_end_date"] = data.get("bp_end_date") or None
        with open(MASTER_STATE_FILE, "w") as f:
            json.dump(master_state, f, indent=2)
        return JSONResponse({"status": "success"})
    return JSONResponse(
        {"status": "error", "message": "Game not found"}, status_code=404
    )


@app.post("/api/delete_log")
async def delete_log(request: Request):
    data = await request.json()
    target_log_id = data.get("log_id")
    schedule = safe_read_json(SCHEDULE_FILE, [])

    # Filter out the specific log
    filtered_schedule = [
        log for log in schedule if str(log.get("log_id")) != str(target_log_id)
    ]
    with open(SCHEDULE_FILE, "w") as f:
        json.dump(filtered_schedule, f, indent=2)
    return JSONResponse({"status": "success"})


# Mount static files
app.mount("/", StaticFiles(directory=".", html=True), name="static")
