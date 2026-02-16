// index.js
require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    Collection,
    AttachmentBuilder,
    PermissionsBitField
} = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const ms = require('ms');
const cron = require('node-cron');

const config = require('./config.js');

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Collections
client.commands = new Collection();
client.cooldowns = new Collection();
client.premiumCooldowns = new Collection();
client.gameSearchCache = new Collection();
client.activeCooldownEdit = new Set();
client.scriptCache = new Collection(); // Cache untuk menyimpan script sementara

// Create databases directory if it doesn't exist
if (!fs.existsSync('./databases')) {
    fs.mkdirSync('./databases', { recursive: true });
}

// Database Functions
function loadData() {
    if (!fs.existsSync(config.DATABASE.DATA)) {
        return { 
            blacklist: [], 
            violations: {}, 
            lastExecs: {}, 
            robloxVersion: { pc: "", mobile: "" }, 
            allowedChannels: config.TARGET_CHANNELS 
        };
    }
    try {
        let data = JSON.parse(fs.readFileSync(config.DATABASE.DATA));
        if (!data.robloxVersion) data.robloxVersion = { pc: "", mobile: "" };
        if (!data.allowedChannels) data.allowedChannels = config.TARGET_CHANNELS;
        return data;
    } catch (e) {
        return { 
            blacklist: [], 
            violations: {}, 
            lastExecs: {}, 
            robloxVersion: { pc: "", mobile: "" }, 
            allowedChannels: config.TARGET_CHANNELS 
        };
    }
}

function loadVault() {
    if (!fs.existsSync(config.DATABASE.VAULT)) return {};
    try {
        return JSON.parse(fs.readFileSync(config.DATABASE.VAULT));
    } catch (e) {
        return {};
    }
}

function loadStats() {
    if (!fs.existsSync(config.DATABASE.STATS)) {
        return {
            totalSearches: 0,
            totalCommands: 0,
            totalVaultSaves: 0,
            totalObfuscates: 0,
            totalServerSearches: 0,
            totalScriptReleases: 0,
            totalCopies: 0, // Tambahkan statistik copy
            userActivity: {},
            startTime: Date.now(),
            premiumSubscriptions: 0,
            premiumRevenue: 0
        };
    }
    try {
        const stats = JSON.parse(fs.readFileSync(config.DATABASE.STATS));
        return {
            totalSearches: stats.totalSearches || 0,
            totalCommands: stats.totalCommands || 0,
            totalVaultSaves: stats.totalVaultSaves || 0,
            totalObfuscates: stats.totalObfuscates || 0,
            totalServerSearches: stats.totalServerSearches || 0,
            totalScriptReleases: stats.totalScriptReleases || 0,
            totalCopies: stats.totalCopies || 0, // Tambahkan statistik copy
            userActivity: stats.userActivity || {},
            startTime: stats.startTime || Date.now(),
            premiumSubscriptions: stats.premiumSubscriptions || 0,
            premiumRevenue: stats.premiumRevenue || 0
        };
    } catch (e) {
        return {
            totalSearches: 0,
            totalCommands: 0,
            totalVaultSaves: 0,
            totalObfuscates: 0,
            totalServerSearches: 0,
            totalScriptReleases: 0,
            totalCopies: 0,
            userActivity: {},
            startTime: Date.now(),
            premiumSubscriptions: 0,
            premiumRevenue: 0
        };
    }
}

function loadPremiumUsers() {
    if (!fs.existsSync(config.DATABASE.PREMIUM)) return {};
    try {
        return JSON.parse(fs.readFileSync(config.DATABASE.PREMIUM));
    } catch (e) {
        return {};
    }
}

function saveData(data) {
    data.allowedChannels = config.TARGET_CHANNELS;
    fs.writeFileSync(config.DATABASE.DATA, JSON.stringify(data, null, 2));
}

function saveVault(vault) {
    fs.writeFileSync(config.DATABASE.VAULT, JSON.stringify(vault, null, 2));
}

function saveStats(stats) {
    fs.writeFileSync(config.DATABASE.STATS, JSON.stringify(stats, null, 2));
}

function savePremiumUsers(premiumUsers) {
    fs.writeFileSync(config.DATABASE.PREMIUM, JSON.stringify(premiumUsers, null, 2));
}

// Initialize databases
let db = loadData();
let vault = loadVault();
let botStats = loadStats();
let premiumUsers = loadPremiumUsers();

// Utility Functions
function isOwner(userId) {
    return config.OWNER_IDS.includes(userId);
}

function isPremiumUser(userId) {
    const user = premiumUsers[userId];
    if (!user) return false;
    
    const now = Date.now();
    if (now > user.expiryDate) {
        delete premiumUsers[userId];
        savePremiumUsers(premiumUsers);
        return false;
    }
    return true;
}

function getPremiumInfo(userId) {
    const user = premiumUsers[userId];
    if (!user) return null;
    
    const now = Date.now();
    const daysLeft = Math.max(0, Math.ceil((user.expiryDate - now) / (1000 * 60 * 60 * 24)));
    
    return {
        ...user,
        daysLeft,
        isActive: now <= user.expiryDate
    };
}

function addPremiumUser(userId, durationDays = 30) {
    const now = Date.now();
    const expiryDate = now + (durationDays * 24 * 60 * 60 * 1000);
    
    premiumUsers[userId] = {
        userId,
        startDate: now,
        expiryDate: expiryDate,
        durationDays,
        tier: "PREMIUM"
    };
    
    savePremiumUsers(premiumUsers);
    botStats.premiumRevenue += config.PREMIUM_PRICE;
    saveStats(botStats);
    
    return premiumUsers[userId];
}

function updateStats(command, userId) {
    botStats.totalCommands++;
    
    if (command === 'search' || command === 'vsearch') {
        botStats.totalSearches++;
    } else if (command === 'save') {
        botStats.totalVaultSaves++;
    } else if (command === 'obfuscate' || command === 'obflong') {
        botStats.totalObfuscates++;
    } else if (command === 'serv') {
        botStats.totalServerSearches++;
    } else if (command === 'premium') {
        botStats.premiumSubscriptions++;
    } else if (command === 'copy') {
        botStats.totalCopies++;
    }
    
    if (!botStats.userActivity[userId]) {
        botStats.userActivity[userId] = { commandCount: 0, lastActive: Date.now() };
    }
    botStats.userActivity[userId].commandCount++;
    botStats.userActivity[userId].lastActive = Date.now();
    
    saveStats(botStats);
}

function getUptime() {
    const uptime = Date.now() - botStats.startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function checkCooldown(userId, isPremium = false) {
    const now = Date.now();
    const rateLimit = isPremium ? config.PREMIUM_RATE_LIMIT : config.FREE_RATE_LIMIT;
    const cooldownMap = isPremium ? client.premiumCooldowns : client.cooldowns;
    
    if (!cooldownMap.has(userId)) {
        cooldownMap.set(userId, { count: 1, timestamp: now });
        return { hasCooldown: false, timeLeft: 0 };
    }
    
    const userCooldown = cooldownMap.get(userId);
    const timeSinceFirstRequest = now - userCooldown.timestamp;
    
    if (timeSinceFirstRequest > 60000) {
        cooldownMap.set(userId, { count: 1, timestamp: now });
        return { hasCooldown: false, timeLeft: 0 };
    }
    
    if (userCooldown.count >= rateLimit) {
        const timeLeft = Math.ceil((60000 - timeSinceFirstRequest) / 1000);
        return { hasCooldown: true, timeLeft };
    }
    
    userCooldown.count++;
    cooldownMap.set(userId, userCooldown);
    return { hasCooldown: false, timeLeft: 0 };
}

// ========== FUNGSI COPY SCRIPT ==========

function createScriptButtons(scriptIndex, scriptId, isPremium = false) {
    const row = new ActionRowBuilder();
    
    // Tombol Copy Script
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`copy_script_${scriptId}`)
            .setLabel('📋 Copy Script')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋')
    );
    
    // Tombol Show Raw
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`raw_script_${scriptId}`)
            .setLabel('📄 Show Raw')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📄')
    );
    
    // Untuk free user, tampilkan tombol premium
    if (!isPremium) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('get_premium')
                .setLabel('💎 Premium')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💎')
        );
    }
    
    // Tombol Save ke Vault (untuk semua user)
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`save_vault_${scriptId}`)
            .setLabel('💾 Save')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💾')
    );
    
    return row;
}

function generateScriptId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ========== ROBLOX API FUNCTIONS ==========

async function searchRobloxGame(query) {
    try {
        const cacheKey = `search_${query.toLowerCase()}`;
        const cached = client.gameSearchCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < config.CACHE_DURATION) {
            console.log(`🎮 [CACHE] Found cached game search for: ${query}`);
            return cached.data;
        }

        console.log(`🔍 Searching Roblox game: ${query}`);
        
        if (/^\d+$/.test(query)) {
            console.log(`🔢 Treating as place ID: ${query}`);
            try {
                const gameDetails = await getGameDetailsByPlaceId(query);
                if (gameDetails) {
                    const result = {
                        games: [{
                            id: query,
                            name: gameDetails.name || `Game ${query}`,
                            description: gameDetails.description || '',
                            creator: gameDetails.creator || { name: 'Unknown' },
                            price: gameDetails.price || 0,
                            playerCount: gameDetails.playerCount || 0
                        }],
                        isPlaceId: true
                    };
                    client.gameSearchCache.set(cacheKey, { data: result, timestamp: Date.now() });
                    return result;
                }
            } catch (error) {
                console.log(`❌ Failed to get details for place ID ${query}:`, error.message);
                throw new Error(`Place ID ${query} not found or invalid`);
            }
        }
        
        const searchResponse = await axios({
            method: 'GET',
            url: `https://rscripts.net/api/v2/scripts?q=${encodeURIComponent(query)}&page=1&limit=20`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        if (!searchResponse.data?.scripts || searchResponse.data.scripts.length === 0) {
            throw new Error(`Game "${query}" not found on Roblox`);
        }

        const gamesMap = new Map();
        searchResponse.data.scripts.forEach(script => {
            if (script.game && script.game.placeId) {
                if (!gamesMap.has(script.game.placeId)) {
                    gamesMap.set(script.game.placeId, {
                        id: script.game.placeId,
                        name: script.game.title || `Game ${script.game.placeId}`,
                        description: '',
                        creator: { name: 'Unknown' },
                        price: 0,
                        playerCount: 0,
                        image: script.image || ''
                    });
                }
            }
        });

        const games = Array.from(gamesMap.values());
        const result = {
            games: games.slice(0, 10),
            isPlaceId: false
        };

        client.gameSearchCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('Game search error:', error);
        throw new Error(`Failed to search game: ${error.message}`);
    }
}

async function getGameDetailsByPlaceId(placeId) {
    try {
        try {
            const response = await axios({
                method: 'GET',
                url: `https://rscripts.net/api/v2/scripts?page=1&limit=5`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.data?.scripts) {
                const gameScript = response.data.scripts.find(script => 
                    script.game && script.game.placeId === placeId
                );
                if (gameScript?.game) {
                    return {
                        name: gameScript.game.title,
                        description: '',
                        creator: { name: 'Unknown' },
                        price: 0,
                        playerCount: 0
                    };
                }
            }
        } catch (e) {
            console.log('Rscripts API failed, trying alternative...');
        }

        const universeResponse = await axios({
            method: 'GET',
            url: `https://apis.roblox.com/universes/v1/places/${placeId}/universe`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (universeResponse.data?.universeId) {
            const gameDetails = await getGameDetailsByUniverseId(universeResponse.data.universeId);
            if (gameDetails) return gameDetails;
        }
        
        return null;
    } catch (error) {
        console.error('Get game details by place ID error:', error);
        return null;
    }
}

async function getGameDetailsByUniverseId(universeId) {
    try {
        const response = await axios({
            method: 'GET',
            url: `https://games.roblox.com/v1/games?universeIds=${universeId}`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        if (response.data?.data?.[0]) {
            return response.data.data[0];
        }
        return null;
    } catch (error) {
        console.error('Get game details by universe ID error:', error);
        return null;
    }
}

async function findEmptyServersUniversal(placeId, gameName = '') {
    try {
        console.log(`🔍 Searching empty servers for Place ID: ${placeId} (${gameName})`);
        
        if (!placeId || !/^\d+$/.test(placeId)) {
            throw new Error('Invalid Place ID. Must be numbers only.');
        }

        let servers = [];
        
        try {
            const response = await axios({
                method: 'GET',
                url: `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&sortOrder=Asc`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                timeout: 20000
            });

            if (response.data?.data) {
                servers = response.data.data;
            }
        } catch (apiError) {
            console.log('Primary API failed, trying alternative...');
            
            try {
                const altResponse = await axios({
                    method: 'GET',
                    url: `https://www.roblox.com/games/getgameinstancesjson?placeId=${placeId}&startindex=0`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 20000
                });

                if (altResponse.data?.Collection) {
                    servers = altResponse.data.Collection.map(server => ({
                        id: server.Guid,
                        playing: server.CurrentPlayers || 0,
                        maxPlayers: server.MaxPlayers || 20,
                        fps: server.FPS || 0,
                        ping: server.Ping || 0
                    }));
                }
            } catch (altError) {
                console.log('Alternative API also failed:', altError.message);
            }
        }

        console.log(`📊 Total servers found: ${servers.length}`);
        
        if (servers.length === 0) {
            try {
                const gameCheck = await axios({
                    method: 'GET',
                    url: `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });

                if (!gameCheck.data || gameCheck.data.length === 0) {
                    throw new Error('Game not found or private. Place ID may be invalid.');
                }
                
                throw new Error('Game found but no public servers available.');
            } catch (checkError) {
                throw new Error('Invalid Place ID or game not found.');
            }
        }

        const emptyServers = servers
            .filter(server => {
                const playerCount = server.playing || 0;
                const maxPlayers = server.maxPlayers || 20;
                const playerPercentage = (playerCount / maxPlayers) * 100;
                const isVip = server.vip || false;
                const isFull = playerCount >= maxPlayers;
                
                return !isVip && !isFull && ((playerCount >= 1 && playerCount <= 5) || playerPercentage < 30);
            })
            .sort((a, b) => (a.playing || 0) - (b.playing || 0))
            .slice(0, 10);

        console.log(`🎯 Empty servers found: ${emptyServers.length}`);
        
        if (emptyServers.length === 0) {
            const leastPopulated = servers
                .filter(server => !server.vip && (server.playing || 0) < (server.maxPlayers || 20))
                .sort((a, b) => (a.playing || 0) - (b.playing || 0))
                .slice(0, 5);
            
            if (leastPopulated.length === 0) {
                throw new Error('No suitable servers found. All servers are full or VIP.');
            }
            
            return leastPopulated.map(server => processServerData(server, placeId, gameName));
        }

        return emptyServers.map(server => processServerData(server, placeId, gameName));
    } catch (error) {
        console.error('Universal server search error:', error);
        throw error;
    }
}

function processServerData(server, placeId, gameName) {
    const playerCount = server.playing || 0;
    const maxPlayers = server.maxPlayers || 20;
    const fillPercentage = Math.round((playerCount / maxPlayers) * 100);
    const serverId = server.id || Math.random().toString(36).substring(7);
    const shortId = serverId.substring(0, 8).toUpperCase();
    
    let prediction = 'STABLE';
    let stabilityMinutes = '15-30';
    
    if (playerCount === 1) {
        prediction = 'VERY EMPTY';
        stabilityMinutes = '20-40';
    } else if (playerCount === 2) {
        prediction = 'EMPTY';
        stabilityMinutes = '15-30';
    } else if (playerCount === 3) {
        prediction = 'MEDIUM';
        stabilityMinutes = '10-20';
    } else if (playerCount === 4) {
        prediction = 'SOMEWHAT BUSY';
        stabilityMinutes = '5-15';
    } else if (playerCount === 5) {
        prediction = 'BUSY';
        stabilityMinutes = '3-10';
    } else if (fillPercentage >= 50) {
        prediction = 'ALMOST FULL';
        stabilityMinutes = '1-5';
    } else if (fillPercentage >= 30) {
        prediction = 'MODERATELY BUSY';
        stabilityMinutes = '3-8';
    }
    
    const robloxLink = `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
    const robloxLaunchLink = `roblox://placeId=${placeId}&gameInstanceId=${serverId}`;
    
    return {
        ...server,
        placeId: placeId,
        shortId: shortId,
        fillPercentage,
        prediction: `${prediction} - Stable ${stabilityMinutes} minutes`,
        stabilityMinutes,
        gameName: gameName || `Game ${placeId}`,
        robloxLink: robloxLink,
        robloxLaunchLink: robloxLaunchLink,
        playerCount: playerCount,
        maxPlayers: maxPlayers
    };
}

async function searchScriptsEnhanced(query, typeFilter = null, isPremium = false) {
    try {
        console.log(`🔍 ${isPremium ? 'PREMIUM' : 'FREE'} SEARCH FOR: "${query}"`);
        
        const normalizedQuery = query.toLowerCase().trim();
        const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 2);
        
        const apiUrls = [
            `https://rscripts.net/api/v2/scripts?q=${encodeURIComponent(query)}&page=1&limit=${isPremium ? 40 : 25}`,
            `https://scriptblox.com/api/script/search?q=${encodeURIComponent(query)}&max=${isPremium ? 50 : 30}`
        ];
        
        if (isPremium) {
            apiUrls.push(`https://wearedevs.net/api/scripts/search?s=${encodeURIComponent(query)}`);
        }
        
        const promises = apiUrls.map(url => 
            axios.get(url, { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
                }, 
                timeout: 20000 
            }).catch(err => ({ status: 'rejected', error: err }))
        );
        
        const responses = await Promise.allSettled(promises);
        
        function calculateRelevanceScore(scriptTitle, scriptGame, searchQuery, queryWords) {
            let score = 0;
            const title = scriptTitle.toLowerCase();
            const game = scriptGame.toLowerCase();
            const query = searchQuery.toLowerCase();
            
            if (title === query || game === query) score += 100;
            if (title.includes(query) || game.includes(query)) score += 50;
            
            queryWords.forEach(word => {
                if (title.includes(word)) score += 20;
                if (game.includes(word)) score += 15;
            });
            
            return score;
        }
        
        let allScripts = [];
        
        // Process Rscripts results
        if (responses[0]?.status === 'fulfilled' && responses[0].value?.data?.scripts) {
            const rscripts = responses[0].value.data.scripts.map(script => {
                let cleanTitle = (script.title || 'NO TITLE').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/(scriptblox|rscripts|wearedevs|universal|best|free|working|202\d)/gi, '').trim();
                let gameTitle = (script.game?.title || 'UNKNOWN GAME').replace(/(scriptblox|rscripts|wearedevs|universal)/gi, '').trim();
                
                const relevanceScore = calculateRelevanceScore(cleanTitle, gameTitle, query, queryWords);
                
                let imageUrl = config.THUMBNAILS.HELP;
                if (script.image) {
                    if (script.image.startsWith('http')) {
                        imageUrl = script.image;
                    } else if (script.image.startsWith('/')) {
                        imageUrl = `https://rscripts.net${script.image}`;
                    }
                }
                
                let loadstring = '';
                if (script.rawScript) {
                    if (script.rawScript.startsWith('http')) {
                        loadstring = `loadstring(game:HttpGet("${script.rawScript}"))()`;
                    } else if (script.rawScript.startsWith('/raw/')) {
                        loadstring = `loadstring(game:HttpGet("https://rscripts.net${script.rawScript}"))()`;
                    } else {
                        loadstring = script.rawScript;
                    }
                } else if (script.script) {
                    loadstring = script.script;
                } else {
                    loadstring = `loadstring(game:HttpGet("https://rscripts.net"))()`;
                }
                
                return {
                    title: cleanTitle,
                    game: gameTitle,
                    placeId: script.game?.placeId || 'N/A',
                    keySystem: script.keySystem || false,
                    mobileReady: script.mobileReady || false,
                    views: script.views || 0,
                    likes: script.likes || 0,
                    dislikes: script.dislikes || 0,
                    description: (script.description || '').replace(/(scriptblox|rscripts|wearedevs|universal)/gi, '').trim(),
                    image: imageUrl,
                    script: loadstring,
                    verified: script.user?.verified || false,
                    creator: script.user?.username || 'UNKNOWN',
                    lastUpdated: script.lastUpdated || new Date().toISOString(),
                    executors: script.testedExecutors || [],
                    isUniversal: script.mobileReady || false,
                    source: 'rscripts',
                    relevanceScore: relevanceScore
                };
            });
            allScripts = [...allScripts, ...rscripts];
        }
        
        // Process Scriptblox results
        if (responses[1]?.status === 'fulfilled' && responses[1].value?.data?.result?.scripts) {
            const scriptblox = responses[1].value.data.result.scripts.map(script => {
                let cleanTitle = (script.title || 'NO TITLE').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/(scriptblox|rscripts|wearedevs|universal|best|free|working|202\d)/gi, '').trim();
                let gameTitle = (script.game?.name || 'UNKNOWN GAME').replace(/(scriptblox|rscripts|wearedevs|universal)/gi, '').trim();
                
                const relevanceScore = calculateRelevanceScore(cleanTitle, gameTitle, query, queryWords);
                
                let imageUrl = config.THUMBNAILS.HELP;
                if (script.image) {
                    if (script.image.startsWith('http')) {
                        imageUrl = script.image;
                    } else if (script.image.startsWith('/')) {
                        imageUrl = `https://scriptblox.com${script.image}`;
                    }
                }
                
                let loadstring = script.script || script.scriptContent || 'loadstring(game:HttpGet("https://scriptblox.com"))()';
                
                return {
                    title: cleanTitle,
                    game: gameTitle,
                    placeId: 'N/A',
                    keySystem: script.key || false,
                    mobileReady: script.isUniversal || false,
                    views: script.views || 0,
                    likes: 0,
                    dislikes: 0,
                    description: '',
                    image: imageUrl,
                    script: loadstring,
                    verified: script.verified || false,
                    creator: script.owner?.username || 'UNKNOWN',
                    lastUpdated: script.createdAt || new Date().toISOString(),
                    executors: [],
                    isUniversal: script.isUniversal || false,
                    source: 'scriptblox',
                    relevanceScore: relevanceScore
                };
            });
            allScripts = [...allScripts, ...scriptblox];
        }
        
        // Filter based on typeFilter
        let filtered = allScripts;
        if (typeFilter === 'key') {
            filtered = filtered.filter(s => s.keySystem === true);
        } else if (typeFilter === 'keyless') {
            filtered = filtered.filter(s => s.keySystem === false);
        }
        
        // Remove duplicates
        const uniqueScripts = [];
        const seenKeys = new Set();
        for (const script of filtered) {
            const key = `${script.title.toLowerCase()}-${script.game.toLowerCase()}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueScripts.push(script);
            }
        }
        
        // Sort by relevance score
        const sorted = uniqueScripts.sort((a, b) => {
            if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
            if (a.verified && !b.verified) return -1;
            if (!a.verified && b.verified) return 1;
            return (b.views || 0) - (a.views || 0);
        });
        
        const relevantScripts = sorted.filter(script => script.relevanceScore > 5);
        if (relevantScripts.length === 0 && sorted.length > 0) {
            return isPremium ? sorted.slice(0, 15) : sorted.slice(0, 6);
        }
        
        return isPremium ? relevantScripts.slice(0, 15) : relevantScripts.slice(0, 6);
        
    } catch (error) {
        console.error('ENHANCED SEARCH ERROR:', error);
        throw error;
    }
}

async function getScriptRelease() {
    try {
        console.log('🚀 FETCHING SCRIPT RELEASE DATA...');
        
        const response = await axios.get('https://rscripts.net/api/v2/scripts?page=1&orderBy=date&sort=desc&limit=10', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        
        if (!response.data?.scripts || response.data.scripts.length === 0) {
            throw new Error('NO SCRIPTS FOUND');
        }
        
        return response.data.scripts.slice(0, 3).map(script => {
            let cleanTitle = (script.title || 'NO TITLE').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/(scriptblox|rscripts|wearedevs|universal|best|free|working|202\d)/gi, '').trim();
            let gameTitle = (script.game?.title || 'UNKNOWN GAME').replace(/(scriptblox|rscripts|wearedevs|universal)/gi, '').trim();
            
            let imageUrl = config.THUMBNAILS.HELP;
            if (script.image) {
                if (script.image.startsWith('http')) {
                    imageUrl = script.image;
                } else if (script.image.startsWith('/')) {
                    imageUrl = `https://rscripts.net${script.image}`;
                }
            }
            
            let loadstring = '';
            if (script.rawScript) {
                if (script.rawScript.startsWith('http')) {
                    loadstring = `loadstring(game:HttpGet("${script.rawScript}"))()`;
                } else if (script.rawScript.startsWith('/raw/')) {
                    loadstring = `loadstring(game:HttpGet("https://rscripts.net${script.rawScript}"))()`;
                } else {
                    loadstring = script.rawScript;
                }
            } else if (script.script) {
                loadstring = script.script;
            } else {
                loadstring = 'loadstring(game:HttpGet("https://rscripts.net"))()';
            }
            
            return {
                title: cleanTitle,
                game: gameTitle,
                placeId: script.game?.placeId || 'N/A',
                keySystem: script.keySystem || false,
                mobileReady: script.mobileReady || false,
                views: script.views || 0,
                likes: script.likes || 0,
                dislikes: script.dislikes || 0,
                description: (script.description || '').replace(/(scriptblox|rscripts|wearedevs|universal)/gi, '').trim(),
                image: imageUrl,
                script: loadstring,
                verified: script.user?.verified || false,
                creator: script.user?.username || 'UNKNOWN',
                lastUpdated: script.lastUpdated || new Date().toISOString(),
                executors: script.testedExecutors || [],
                isUniversal: script.mobileReady || false,
                source: 'rscripts'
            };
        });
    } catch (error) {
        console.error('ERROR FETCHING SCRIPT RELEASE:', error);
        return [];
    }
}

async function sendServerListEmbed(channel, servers, query) {
    const firstServer = servers[0];
    const gameName = firstServer.gameName;
    const placeId = firstServer.placeId;
    
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`🎮 EMPTY SERVERS: ${gameName.toUpperCase()}`)
        .setDescription(`🆔 **PLACE ID:** ${placeId}\n🔍 **QUERY:** "${query}"\n📈 **FOUND:** ${servers.length} SERVERS`)
        .setThumbnail(config.THUMBNAILS.SERVER_SEARCH)
        .setFooter({ text: `XFOR Discord Bot • ${new Date().toLocaleString()}` });
    
    servers.slice(0, 5).forEach((server, index) => {
        embed.addFields({
            name: `${index + 1}. SERVER ${server.shortId} - ${server.prediction}`,
            value: `👥 **Players:** ${server.playerCount}/${server.maxPlayers} (${server.fillPercentage}%)\n🌐 **Web:** ${server.robloxLink}\n📱 **Mobile:** ${server.robloxLaunchLink}`,
            inline: false
        });
    });
    
    await channel.send({ embeds: [embed] });
    
    if (servers.length > 5) {
        const embed2 = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🎮 CONTINUED - ${gameName.toUpperCase()}`)
            .setThumbnail(config.THUMBNAILS.SERVER_SEARCH);
        
        servers.slice(5, 10).forEach((server, index) => {
            embed2.addFields({
                name: `${index + 6}. SERVER ${server.shortId} - ${server.prediction}`,
                value: `👥 **Players:** ${server.playerCount}/${server.maxPlayers} (${server.fillPercentage}%)\n📱 **Mobile:** ${server.robloxLaunchLink}`,
                inline: false
            });
        });
        
        await channel.send({ embeds: [embed2] });
    }
    
    const tutorialEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('💡 HOW TO JOIN TUTORIAL')
        .setDescription(
            '**📱 MOBILE (ANDROID/IOS):**\n' +
            '1. TAP "ROBLOX://" LINK\n' +
            '2. ALLOW ROBLOX TO OPEN\n' +
            '3. AUTO-JOINS THE SERVER\n\n' +
            '**💻 PC (WINDOWS):**\n' +
            '1. COPY WEB LINK (HTTPS://)\n' +
            '2. PASTE IN BROWSER\n' +
            '3. CLICK "PLAY" BUTTON\n\n' +
            '**⚡ PRO TIPS:**\n' +
            '• SERVERS WITH 1-2 PLAYERS = MOST STABLE\n' +
            '• JOIN WITHIN 1 MINUTE FOR BEST CHANCE'
        )
        .setFooter({ text: 'XFOR Discord Bot' });
    
    await channel.send({ embeds: [tutorialEmbed] });
}

// ========== DISCORD BOT EVENTS ==========

client.once('ready', () => {
    console.log('='.repeat(60));
    console.log('🍷 XFOR DISCORD BOT');
    console.log('🎮 ROBLOX SCRIPT & SERVER FINDER');
    console.log('='.repeat(60));
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`👤 User ID: ${client.user.id}`);
    console.log(`💰 Premium Users: ${Object.keys(premiumUsers).length}`);
    console.log(`⚡ Bot Ready to Receive Commands!`);
    console.log('='.repeat(60));
    
    // Set bot status
    client.user.setPresence({
        activities: [{ name: '.help | XFOR BOT', type: 3 }],
        status: 'online'
    });
    
    // Clean script cache every hour
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of client.scriptCache) {
            if (now - value.timestamp > 3600000) { // 1 hour
                client.scriptCache.delete(key);
            }
        }
    }, 3600000);
    
    // Start auto-release interval
    setInterval(async () => {
        try {
            const scripts = await getScriptRelease();
            if (scripts.length === 0) return;
            
            botStats.totalScriptReleases++;
            saveStats(botStats);
            
            for (const channelId of config.TARGET_CHANNELS) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) continue;
                
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🚀 XFOR SCRIPT RELEASE UPDATE')
                    .setDescription(`📅 **DATE:** ${new Date().toLocaleDateString()}\n🕒 **TIME:** ${new Date().toLocaleTimeString()}\n📊 **TOTAL SCRIPTS:** ${scripts.length}`)
                    .setThumbnail(config.THUMBNAILS.HELP)
                    .setFooter({ text: 'XFOR Discord Bot' });
                
                await channel.send({ embeds: [embed] });
                
                for (let i = 0; i < scripts.length; i++) {
                    const scriptId = generateScriptId();
                    client.scriptCache.set(scriptId, {
                        script: scripts[i].script,
                        title: scripts[i].title,
                        timestamp: Date.now()
                    });
                    
                    const scriptEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle(`📜 SCRIPT ${i + 1}/${scripts.length}: ${scripts[i].title}`)
                        .setDescription(
                            `🎮 **Game:** ${scripts[i].game}\n` +
                            `🔑 **Key System:** ${scripts[i].keySystem ? '✅ YES' : '❌ NO'}\n` +
                            `📱 **Mobile Ready:** ${scripts[i].mobileReady ? '✅ YES' : '❌ NO'}\n` +
                            `👁️ **Views:** ${scripts[i].views.toLocaleString()}\n` +
                            `👍 **Likes:** ${scripts[i].likes} | 👎 **Dislikes:** ${scripts[i].dislikes}\n` +
                            `🛡️ **Verified:** ${scripts[i].verified ? '✅ YES' : '❌ NO'}\n` +
                            `👤 **Creator:** ${scripts[i].creator}`
                        )
                        .setThumbnail(scripts[i].image || config.THUMBNAILS.HELP)
                        .setFooter({ text: `XFOR Discord Bot • Updated: ${new Date(scripts[i].lastUpdated).toLocaleDateString()}` });
                    
                    const isPremium = false; // Default untuk auto-release
                    const buttons = createScriptButtons(i, scriptId, isPremium);
                    
                    await channel.send({ 
                        embeds: [scriptEmbed], 
                        components: [buttons] 
                    });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        } catch (e) {
            console.error('Auto Release Error:', e.message);
        }
    }, config.AUTO_RELEASE_INTERVAL);
    
    // Premium expiry checker
    setInterval(() => {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const userId in premiumUsers) {
            if (premiumUsers[userId].expiryDate < now) {
                delete premiumUsers[userId];
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            savePremiumUsers(premiumUsers);
            console.log(`⏰ ${expiredCount} premium subscriptions expired`);
        }
    }, 3600000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('.')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;
    const isPremium = isPremiumUser(userId);
    const isOwnerUser = isOwner(userId);
    
    // Check blacklist
    if (db.blacklist.includes(userId)) return;
    
    // Update stats
    updateStats(command, userId);
    
    // Handle commands
    switch (command) {
        case 'help':
        case 'menu': {
            const embed = new EmbedBuilder()
                .setColor(isPremium ? 0xFFD700 : 0x0099FF)
                .setTitle(`🍷 XFOR ${isPremium ? 'PREMIUM' : 'DISCORD'} BOT 🍷`)
                .setDescription(
                    `📅 **Date:** ${new Date().toLocaleDateString()}\n` +
                    `🕒 **Time:** ${new Date().toLocaleTimeString()}\n` +
                    (isPremium ? `💎 **Status:** PREMIUM (${getPremiumInfo(userId)?.daysLeft || 0} days left)\n\n` : '\n') +
                    '**🎮 SERVER FINDER**\n' +
                    '┣ `.serv <game/placeid>` - Find empty servers\n' +
                    '┗ Example: `.serv Blox Fruits`\n\n' +
                    '**🔍 SCRIPT SEARCH**\n' +
                    '┣ `.search <query>` - Search scripts\n' +
                    '┣ `.search <query>,key` - Key scripts only\n' +
                    '┣ `.search <query>,keyless` - Keyless scripts\n' +
                    '┣ `.vsearch <query>` - Verified only\n' +
                    '┣ `.stats` - Trending scripts\n' +
                    '┗ `.getid` - Extract loadstring (reply)\n\n' +
                    '**📋 COPY FEATURES**\n' +
                    '┣ Click buttons below scripts to copy\n' +
                    '┣ Premium users get unlimited copies\n' +
                    '┗ Free users: 5 copies/day\n\n' +
                    '**🔐 OBFUSCATOR**\n' +
                    '┣ `.obfuscate <level>` - Obfuscate script\n' +
                    '┣ `.obflong <level>` - For large scripts\n' +
                    '┗ Levels: low | medium | high\n\n' +
                    '**🧰 UTILITIES**\n' +
                    '┣ `.exme` - Executor status\n' +
                    '┣ `.botstats` - Bot statistics\n' +
                    '┣ `.save <name>` - Save to vault (reply)\n' +
                    '┣ `.vault` - View your vault\n' +
                    '┣ `.getvault <num>` - Get from vault\n' +
                    '┗ `.cekid` - Get channel info\n\n' +
                    (isPremium ? 
                        '**💎 PREMIUM FEATURES**\n' +
                        '┣ ⚡ No cooldown\n' +
                        '┣ 🔍 15+ results\n' +
                        '┣ 📋 Unlimited copies\n' +
                        '┣ 💾 Unlimited vault\n' +
                        '┗ 🚨 Priority support\n\n' : 
                        '**💰 UPGRADE**\n' +
                        '┣ Type `.premium` for info\n\n') +
                    (isOwnerUser ?
                        '**👑 OWNER ONLY**\n' +
                        '┣ `.unban <userid>`\n' +
                        '┣ `.addpremium <userid> <days>`\n' +
                        '┣ `.deletepremium <userid>`\n' +
                        '┣ `.listpremium`\n' +
                        '┗ `.premiumstats`\n\n' : '')
                )
                .setThumbnail(isPremium ? config.THUMBNAILS.PREMIUM_HELP : config.THUMBNAILS.HELP)
                .setFooter({ text: `XFOR Discord Bot • Uptime: ${getUptime()}` });
            
            await message.channel.send({ embeds: [embed] });
            break;
        }
        
        case 'serv': {
            const query = args.join(' ');
            if (!query) {
                return message.reply('❌ **Usage:** `.serv <game name or place id>`\nExample: `.serv Blox Fruits` or `.serv 2753915549`');
            }
            
            // Cooldown check for free users
            if (!isPremium && !isOwnerUser) {
                const cooldownCheck = checkCooldown(userId, false);
                if (cooldownCheck.hasCooldown) {
                    const cooldownEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(`⏳ Cooldown: ${cooldownCheck.timeLeft}s`)
                        .setDescription('Upgrade to premium for instant search!\nType `.premium` for info')
                        .setThumbnail(config.THUMBNAILS.COOLDOWN);
                    
                    return message.reply({ embeds: [cooldownEmbed] });
                }
            }
            
            const processingMsg = await message.reply('🔍 **Searching for empty servers...**');
            
            try {
                let placeId = null;
                let gameName = '';
                
                if (/^\d+$/.test(query)) {
                    placeId = query;
                    const gameDetails = await getGameDetailsByPlaceId(placeId);
                    gameName = gameDetails?.name || `Game ${placeId}`;
                } else {
                    const searchResult = await searchRobloxGame(query);
                    if (!searchResult.games || searchResult.games.length === 0) {
                        throw new Error('Game not found');
                    }
                    placeId = searchResult.games[0].id;
                    gameName = searchResult.games[0].name;
                }
                
                const emptyServers = await findEmptyServersUniversal(placeId, gameName);
                await processingMsg.delete();
                await sendServerListEmbed(message.channel, emptyServers, query);
                
            } catch (error) {
                await processingMsg.edit(`❌ **Error:** ${error.message}`);
            }
            break;
        }
        
        case 'search': {
            const searchQuery = args.join(' ');
            if (!searchQuery) {
                return message.reply('❌ **Usage:** `.search <query>`\nExample: `.search Arsenal`');
            }
            
            // Cooldown check for free users
            if (!isPremium && !isOwnerUser) {
                const cooldownCheck = checkCooldown(userId, false);
                if (cooldownCheck.hasCooldown) {
                    const cooldownEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(`⏳ Cooldown: ${cooldownCheck.timeLeft}s`)
                        .setDescription('Upgrade to premium for instant search!\nType `.premium` for info')
                        .setThumbnail(config.THUMBNAILS.COOLDOWN);
                    
                    return message.reply({ embeds: [cooldownEmbed] });
                }
            }
            
            const processingMsg = await message.reply(`🔍 **Searching for scripts: "${searchQuery}"**`);
            
            try {
                const results = await searchScriptsEnhanced(searchQuery, null, isPremium);
                
                if (results.length === 0) {
                    return processingMsg.edit('❌ **No scripts found.**');
                }
                
                await processingMsg.delete();
                
                const resultCount = isPremium ? Math.min(results.length, 15) : Math.min(results.length, 6);
                await message.reply(`🔎 **Found ${results.length} scripts. Showing ${resultCount} results.**`);
                
                for (let i = 0; i < resultCount; i++) {
                    const script = results[i];
                    const scriptId = generateScriptId();
                    
                    // Simpan script ke cache
                    client.scriptCache.set(scriptId, {
                        script: script.script,
                        title: script.title,
                        userId: userId,
                        timestamp: Date.now()
                    });
                    
                    const embed = new EmbedBuilder()
                        .setColor(script.verified ? 0x00FF00 : 0xFFA500)
                        .setTitle(`${i + 1}. ${script.title}`)
                        .setDescription(
                            `🎮 **Game:** ${script.game}\n` +
                            `🔑 **Key System:** ${script.keySystem ? '✅ YES' : '❌ NO'}\n` +
                            `📱 **Mobile Ready:** ${script.mobileReady ? '✅ YES' : '❌ NO'}\n` +
                            `👁️ **Views:** ${script.views.toLocaleString()}\n` +
                            `🛡️ **Verified:** ${script.verified ? '✅ YES' : '❌ NO'}\n` +
                            `👤 **Creator:** ${script.creator}\n` +
                            `📋 **Click buttons below to copy!**`
                        )
                        .setThumbnail(script.image)
                        .setFooter({ text: `Source: ${script.source} • ID: ${scriptId.substring(0, 8)}` });
                    
                    const buttons = createScriptButtons(i, scriptId, isPremium);
                    
                    await message.channel.send({ 
                        embeds: [embed], 
                        components: [buttons] 
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (error) {
                await processingMsg.edit(`❌ **Error:** ${error.message}`);
            }
            break;
        }
        
        case 'premium': {
            if (isPremium) {
                const info = getPremiumInfo(userId);
                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('💎 XFOR PREMIUM')
                    .setDescription(
                        `✅ **You are a premium member!**\n\n` +
                        `📅 **Expires:** ${new Date(info.expiryDate).toLocaleDateString()}\n` +
                        `⏳ **Days Left:** ${info.daysLeft}\n\n` +
                        `**✨ Premium Benefits:**\n` +
                        `• ⚡ No cooldown\n` +
                        `• 🔍 15+ search results\n` +
                        `• 📋 Unlimited script copies\n` +
                        `• 💾 Unlimited vault storage\n` +
                        `• 🚨 Priority support`
                    )
                    .setThumbnail(config.THUMBNAILS.PREMIUM_HELP);
                
                await message.reply({ embeds: [embed] });
                
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('💰 UPGRADE TO PREMIUM')
                    .setDescription(
                        `**Price:** Rp ${config.PREMIUM_PRICE.toLocaleString()} / month\n\n` +
                        `**✨ Premium Benefits:**\n` +
                        `• ⚡ No cooldown\n` +
                        `• 🔍 15+ search results (vs 6 free)\n` +
                        `• 📋 Unlimited script copies\n` +
                        `• 🌐 3 API sources\n` +
                        `• 💬 Private chat access\n` +
                        `• 💾 Unlimited vault (vs 5 free)\n` +
                        `• 🚨 Priority support\n\n` +
                        `**👇 Payment Methods:**`
                    )
                    .setThumbnail(config.THUMBNAILS.PREMIUM_HELP);
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('pay_dana')
                            .setLabel('DANA')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💳'),
                        new ButtonBuilder()
                            .setCustomId('pay_gopay')
                            .setLabel('GOPAY')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('📱'),
                        new ButtonBuilder()
                            .setCustomId('pay_qris')
                            .setLabel('QRIS')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📷')
                    );
                
                await message.reply({ embeds: [embed], components: [row] });
            }
            break;
        }
        
        case 'addpremium':
        case 'addprem': {
            if (!isOwnerUser) {
                return message.reply('🚫 **Owner only command**');
            }
            
            const targetId = args[0];
            const days = parseInt(args[1]) || 30;
            
            if (!targetId) {
                return message.reply('❌ **Usage:** `.addpremium <userid> <days>`');
            }
            
            const userInfo = addPremiumUser(targetId, days);
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Premium Added')
                .setDescription(
                    `**User:** ${targetId}\n` +
                    `**Days:** ${days}\n` +
                    `**Expires:** ${new Date(userInfo.expiryDate).toLocaleDateString()}`
                );
            
            await message.reply({ embeds: [embed] });
            break;
        }
        
        case 'listpremium': {
            if (!isOwnerUser) {
                return message.reply('🚫 **Owner only command**');
            }
            
            const now = Date.now();
            const activeUsers = Object.values(premiumUsers)
                .filter(u => u.expiryDate > now)
                .sort((a, b) => a.expiryDate - b.expiryDate);
            
            if (activeUsers.length === 0) {
                return message.reply('📋 **No active premium users**');
            }
            
            const list = activeUsers.map((u, i) => {
                const daysLeft = Math.ceil((u.expiryDate - now) / (1000 * 60 * 60 * 24));
                return `${i + 1}. <@${u.userId}> - ${daysLeft} days left`;
            }).join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('📋 Premium Users')
                .setDescription(list)
                .setFooter({ text: `Total: ${activeUsers.length} active users` });
            
            await message.reply({ embeds: [embed] });
            break;
        }
        
        case 'botstats': {
            const totalActiveUsers = Object.keys(botStats.userActivity).length;
            const uptime = getUptime();
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📊 Bot Statistics')
                .setDescription(
                    `**📈 General Stats**\n` +
                    `┣ Commands: ${botStats.totalCommands}\n` +
                    `┣ Searches: ${botStats.totalSearches}\n` +
                    `┣ Server Searches: ${botStats.totalServerSearches}\n` +
                    `┣ Vault Saves: ${botStats.totalVaultSaves}\n` +
                    `┣ Obfuscations: ${botStats.totalObfuscates}\n` +
                    `┣ Script Releases: ${botStats.totalScriptReleases}\n` +
                    `┣ Script Copies: ${botStats.totalCopies}\n` +
                    `┣ Premium Subs: ${botStats.premiumSubscriptions}\n` +
                    `┣ Premium Revenue: Rp ${(botStats.premiumRevenue || 0).toLocaleString()}\n` +
                    `┣ Active Users: ${totalActiveUsers}\n` +
                    `┣ Blacklisted: ${db.blacklist.length}\n\n` +
                    `**⏱️ System Info**\n` +
                    `┣ Uptime: ${uptime}\n` +
                    `┣ Premium Users: ${Object.keys(premiumUsers).length}\n` +
                    `┣ Start Time: ${new Date(botStats.startTime).toLocaleString()}`
                )
                .setFooter({ text: 'XFOR Discord Bot' });
            
            await message.reply({ embeds: [embed] });
            break;
        }
        
        case 'cekid': {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📊 Channel Information')
                .setDescription(
                    `**Channel ID:** \`${message.channel.id}\`\n` +
                    `**Channel Name:** ${message.channel.name}\n` +
                    `**Guild ID:** \`${message.guild?.id || 'DM'}\`\n` +
                    `**Guild Name:** ${message.guild?.name || 'Direct Message'}\n` +
                    `**User ID:** \`${userId}\`\n` +
                    `**User Tag:** ${message.author.tag}`
                );
            
            await message.reply({ embeds: [embed] });
            break;
        }
        
        case 'exme': {
            try {
                const res = await axios.get('https://scriptblox.com/api/executor/list');
                const executors = res.data;
                
                if (!Array.isArray(executors)) {
                    return message.reply('❌ Failed to fetch executor data');
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('🍷 Executor Status List')
                    .setDescription(
                        executors.slice(0, 10).map((ex, i) => {
                            const status = ex.patched ? '🔴 PATCHED' : '🟢 ACTIVE';
                            return `**${i + 1}. ${ex.name}** ${status}\n┣ Type: ${ex.type}\n┣ Platform: ${ex.platform}\n┗ ${ex.website}`;
                        }).join('\n\n')
                    )
                    .setFooter({ text: 'XFOR Discord Bot' });
                
                await message.reply({ embeds: [embed] });
                
            } catch (error) {
                await message.reply('❌ Failed to fetch executor data');
            }
            break;
        }
        
        default:
            // Command not found
            break;
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    const userId = interaction.user.id;
    const isPremium = isPremiumUser(userId);
    const customId = interaction.customId;
    
    // Handle payment buttons
    if (customId.startsWith('pay_')) {
        switch (customId) {
            case 'pay_dana':
                await interaction.reply({
                    content: 
                        `**💳 PAYMENT VIA DANA**\n\n` +
                        `📱 **Number:** ${config.PAYMENT_METHODS.DANA.number}\n` +
                        `👤 **Name:** ${config.PAYMENT_METHODS.DANA.name}\n\n` +
                        `💰 **Amount:** Rp ${config.PREMIUM_PRICE.toLocaleString()}\n` +
                        `📅 **Duration:** 30 days\n\n` +
                        `📞 **After Payment:**\n` +
                        `1. Transfer Rp ${config.PREMIUM_PRICE.toLocaleString()}\n` +
                        `2. Send proof to <@${config.OWNER_IDS[0]}>\n` +
                        `3. Premium will be activated within 15 minutes!`,
                    ephemeral: true
                });
                break;
                
            case 'pay_gopay':
                await interaction.reply({
                    content:
                        `**📱 PAYMENT VIA GOPAY**\n\n` +
                        `📱 **Number:** ${config.PAYMENT_METHODS.GOPAY.number}\n` +
                        `👤 **Name:** ${config.PAYMENT_METHODS.GOPAY.name}\n\n` +
                        `💰 **Amount:** Rp ${config.PREMIUM_PRICE.toLocaleString()}\n` +
                        `📅 **Duration:** 30 days\n\n` +
                        `📞 **After Payment:**\n` +
                        `1. Transfer Rp ${config.PREMIUM_PRICE.toLocaleString()}\n` +
                        `2. Send proof to <@${config.OWNER_IDS[0]}>\n` +
                        `3. Premium will be activated within 15 minutes!`,
                    ephemeral: true
                });
                break;
                
            case 'pay_qris':
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('📷 QRIS PAYMENT')
                            .setDescription(
                                `💰 **Amount:** Rp ${config.PREMIUM_PRICE.toLocaleString()}\n` +
                                `📅 **Duration:** 30 days\n\n` +
                                `📞 **After Payment:**\n` +
                                `1. Scan QR code\n` +
                                `2. Transfer Rp ${config.PREMIUM_PRICE.toLocaleString()}\n` +
                                `3. Send proof to <@${config.OWNER_IDS[0]}>\n` +
                                `4. Premium will be activated within 15 minutes!`
                            )
                            .setImage(config.PAYMENT_METHODS.QRIS.url)
                    ],
                    ephemeral: true
                });
                break;
        }
        return;
    }
    
    // Handle get premium button
    if (customId === 'get_premium') {
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('💰 UPGRADE TO PREMIUM')
            .setDescription(
                `**Price:** Rp ${config.PREMIUM_PRICE.toLocaleString()} / month\n\n` +
                `**✨ Premium Benefits:**\n` +
                `• ⚡ No cooldown\n` +
                `• 🔍 15+ search results\n` +
                `• 📋 Unlimited script copies\n` +
                `• 🌐 3 API sources\n` +
                `• 💾 Unlimited vault\n\n` +
                `Click the payment buttons below to upgrade!`
            );
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('pay_dana')
                    .setLabel('DANA')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💳'),
                new ButtonBuilder()
                    .setCustomId('pay_gopay')
                    .setLabel('GOPAY')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📱'),
                new ButtonBuilder()
                    .setCustomId('pay_qris')
                    .setLabel('QRIS')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📷')
            );
        
        await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            ephemeral: true 
        });
        return;
    }
    
    // Handle copy script button
    if (customId.startsWith('copy_script_')) {
        const scriptId = customId.replace('copy_script_', '');
        const cachedScript = client.scriptCache.get(scriptId);
        
        if (!cachedScript) {
            return interaction.reply({ 
                content: '❌ Script expired or not found! Please search again.', 
                ephemeral: true 
            });
        }
        
        // Cek limit untuk free user
        if (!isPremium) {
            const userCopyKey = `copy_${userId}_${new Date().toDateString()}`;
            const userCopies = client.scriptCache.get(userCopyKey) || 0;
            
            if (userCopies >= 5) {
                return interaction.reply({ 
                    content: '❌ You have reached your daily copy limit (5 scripts). Upgrade to premium for unlimited copies!', 
                    ephemeral: true 
                });
            }
            
            client.scriptCache.set(userCopyKey, userCopies + 1);
        }
        
        // Update stats
        botStats.totalCopies++;
        saveStats(botStats);
        
        // Kirim script via DM
        try {
            await interaction.user.send({
                content: `**📋 Script: ${cachedScript.title}**\n\n\`\`\`lua\n${cachedScript.script}\n\`\`\``
            });
            
            await interaction.reply({ 
                content: '✅ Script has been sent to your DM! Check your direct messages.', 
                ephemeral: true 
            });
        } catch (dmError) {
            // Jika DM terkunci, kirim di channel
            await interaction.reply({ 
                content: `**📋 Script: ${cachedScript.title}**\n\n\`\`\`lua\n${cachedScript.script}\n\`\`\``,
                ephemeral: true 
            });
        }
    }
    
    // Handle raw script button
    if (customId.startsWith('raw_script_')) {
        const scriptId = customId.replace('raw_script_', '');
        const cachedScript = client.scriptCache.get(scriptId);
        
        if (!cachedScript) {
            return interaction.reply({ 
                content: '❌ Script expired or not found! Please search again.', 
                ephemeral: true 
            });
        }
        
        // Buat file attachment
        const buffer = Buffer.from(cachedScript.script, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `script_${scriptId}.lua` });
        
        await interaction.reply({ 
            content: `**📄 Raw Script: ${cachedScript.title}**`,
            files: [attachment],
            ephemeral: true 
        });
    }
    
    // Handle save to vault button
    if (customId.startsWith('save_vault_')) {
        const scriptId = customId.replace('save_vault_', '');
        const cachedScript = client.scriptCache.get(scriptId);
        
        if (!cachedScript) {
            return interaction.reply({ 
                content: '❌ Script expired or not found! Please search again.', 
                ephemeral: true 
            });
        }
        
        const userVault = vault[userId] || [];
        
        // Cek limit vault untuk free user
        if (!isPremium && userVault.length >= 5) {
            return interaction.reply({ 
                content: '❌ Vault limit reached (5 scripts). Upgrade to premium for unlimited vault!', 
                ephemeral: true 
            });
        }
        
        // Simpan ke vault
        const vaultEntry = {
            id: Date.now(),
            title: cachedScript.title,
            script: cachedScript.script,
            savedAt: new Date().toISOString()
        };
        
        userVault.push(vaultEntry);
        vault[userId] = userVault;
        saveVault(vault);
        
        botStats.totalVaultSaves++;
        saveStats(botStats);
        
        await interaction.reply({ 
            content: `✅ Script "${cachedScript.title}" saved to your vault!`, 
            ephemeral: true 
        });
    }
});

// Login to Discord
client.login(config.TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});
