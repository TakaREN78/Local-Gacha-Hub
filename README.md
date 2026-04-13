# Gacha Operations Hub

A privacy-first, local telemetry command center for managing daily routines across multiple live-service games. 

## Architecture
* **Frontend:** Vanilla JavaScript, HTML5, Tailwind CSS
* **Backend:** Python (FastAPI / Uvicorn)
* **Database:** Flat JSON architecture (Immutable Game configs + Mutable User States)

## Features
* **Timezone Math Engine:** Automatically converts global UTC server resets to local time.
* **The "Time Machine":** A historical ledger that allows backdating missed dailies and scrubbing accidental logs.
* **Control Room:** GUI for managing Priority Tiers and Battle Pass expiration dates.
* **Offline First:** No cloud accounts, no SQL servers. Data never leaves the local machine.

## Setup
1. Clone the repository.
2. Duplicate `db/user/master_state_TEMPLATE.json` and rename it to `master_state.json`.
3. Duplicate `db/user/schedule_TEMPLATE.json` and rename it to `schedule.json`.
4. Run `run.bat` (Requires Python, FastAPI, and Uvicorn).