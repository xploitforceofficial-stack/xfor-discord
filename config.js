// config.js
require('dotenv').config();

module.exports = {
    // Bot Configuration
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    
    // Owner Configuration
    OWNER_IDS: process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : [],
    
    // Target Channels
    TARGET_CHANNELS: process.env.TARGET_CHANNELS ? process.env.TARGET_CHANNELS.split(',') : [],
    
    // Banned Words
    BAD_WORDS: process.env.BAD_WORDS ? process.env.BAD_WORDS.split(',') : [
        "PORN", "XXX", "BOKEP", "MMK", "KNTL", "PELER", "MEMEK", 
        "KONTOL", "NGENTOT", "JEMBUT", "VCS", "SANGE", "SEX"
    ],
    
    // Thumbnail URLs
    THUMBNAILS: {
        HELP: process.env.THUMBNAIL_HELP || "https://files.catbox.moe/sscgka.jpeg",
        COOLDOWN: process.env.THUMBNAIL_COOLDOWN || "https://files.catbox.moe/mgdch6.jpg",
        SERVER_SEARCH: process.env.THUMBNAIL_SERVER_SEARCH || "https://files.catbox.moe/31024x.jpg",
        PREMIUM_HELP: process.env.THUMBNAIL_PREMIUM_HELP || "https://files.catbox.moe/rawjwz.jpeg",
        PREMIUM_QR: process.env.THUMBNAIL_PREMIUM_QR || "https://files.catbox.moe/m0laal.jpeg"
    },
    
    // Obfuscator API
    LUA_OBFUSCATOR_API_KEY: process.env.LUA_OBFUSCATOR_API_KEY,
    OBFUSCATOR_API_URL: process.env.OBFUSCATOR_API_URL || "https://api.luaobfuscator.com/v1/obfuscator",
    
    // Premium Configuration
    PREMIUM_PRICE: parseInt(process.env.PREMIUM_PRICE) || 20000,
    PREMIUM_RATE_LIMIT: parseInt(process.env.PREMIUM_RATE_LIMIT) || 100,
    FREE_RATE_LIMIT: parseInt(process.env.FREE_RATE_LIMIT) || 10,
    
    // Payment Methods
    PAYMENT_METHODS: {
        DANA: { 
            number: process.env.DANA_NUMBER || "087703248232", 
            name: process.env.DANA_NAME || "ANSORI" 
        },
        GOPAY: { 
            number: process.env.GOPAY_NUMBER || "087703248232", 
            name: process.env.GOPAY_NAME || "CELLZZ" 
        },
        QRIS: { 
            url: process.env.QRIS_URL || "https://files.catbox.moe/m0laal.jpeg" 
        }
    },
    
    // Database Paths
    DATABASE: {
        DATA: './databases/database.json',
        VAULT: './databases/vault_data.json',
        STATS: './databases/bot_stats.json',
        PREMIUM: './databases/premium_users.json'
    },
    
    // Cache Duration (5 minutes)
    CACHE_DURATION: parseInt(process.env.CACHE_DURATION) || 300000,
    
    // Auto Release Interval (30 minutes)
    AUTO_RELEASE_INTERVAL: parseInt(process.env.AUTO_RELEASE_INTERVAL) || 1800000
};
