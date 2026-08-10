# AGENTS Configuration

## Telegram Config
- BOT_TOKEN: "7998187987:AAEJmGWyN7OfDMuGIFr0dTuswS7sw6GLL78"
- CHAT_ID: "8356164848"

## Tech Stack
- PHP REST API (PDO, JSON Output)
- Node.js Frontend
- Astryx Design System

## Automation Rules
- **Telegram Notifications:**
  - Send `curl` notification to Telegram when a task starts.
  - Send `curl` notification to Telegram when a task finishes.
  - Example `curl` command (replace with actual message and URL):
    ```bash
    curl -s -X POST https://api.telegram.org/bot<BOT_TOKEN>/sendMessage -d chat_id=<CHAT_ID> -d text="[CMMS] Task Started: <Task Description>"
    ```
- **Auto-Git Push:**
  - Automatically push changes to `origin main` when a task finishes.
  - Example command:
    ```bash
    git add .
    git commit -m "chore: <Task Description> completed"
    git push origin main
    ```