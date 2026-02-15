#!/bin/bash

# Create databases directory if it doesn't exist
mkdir -p databases

# Initialize database files if they don't exist
if [ ! -f databases/database.json ]; then
    echo '{
        "blacklist": [],
        "violations": {},
        "lastExecs": {},
        "robloxVersion": { "pc": "", "mobile": "" },
        "allowedChannels": []
    }' > databases/database.json
fi

if [ ! -f databases/vault_data.json ]; then
    echo "{}" > databases/vault_data.json
fi

if [ ! -f databases/bot_stats.json ]; then
    echo '{
        "totalSearches": 0,
        "totalCommands": 0,
        "totalVaultSaves": 0,
        "totalObfuscates": 0,
        "totalServerSearches": 0,
        "totalScriptReleases": 0,
        "userActivity": {},
        "startTime": '$(date +%s)'000,
        "premiumSubscriptions": 0,
        "premiumRevenue": 0
    }' > databases/bot_stats.json
fi

if [ ! -f databases/premium_users.json ]; then
    echo "{}" > databases/premium_users.json
fi

# Start the bot
node index.js
