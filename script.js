// ================================================================
//  NAGI RL MANAGER LITE v1  –  MAIN SCRIPT
//  All core functionality: tournaments, teams, matches, stats, etc.
// ================================================================

// --- CONSTANTS ---
const DB_KEY = 'nagi_rl_manager_db';
const ROLES = [
    { label: 'Captain 🎖️', cls: 'role-captain' },
    { label: 'Starter 🌟', cls: 'role-starter' },
    { label: 'Starter 🌟', cls: 'role-starter' },
    { label: 'Sub 🔄', cls: 'role-sub' },
    { label: 'Sub 🔄', cls: 'role-sub' },
    { label: 'Sub 🔄', cls: 'role-sub' },
    { label: 'Reserve 💤', cls: 'role-reserve' },
    { label: 'Reserve 💤', cls: 'role-reserve' },
    { label: 'Reserve 💤', cls: 'role-reserve' },
    { label: 'Reserve 💤', cls: 'role-reserve' },
    { label: 'Reserve 💤', cls: 'role-reserve' },
    { label: 'Reserve 💤', cls: 'role-reserve' }
];

// --- UTILITIES ---
const Utils = {
    generateId: () => Math.random().toString(36).substr(2, 9),
    sanitize: (str) => {
        if (typeof str !== 'string') return str;
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
        return str.replace(/[&<>"'/]/g, (m) => map[m]);
    },
    handleImageUpload: (input, callback) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX = 150;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                callback(canvas.toDataURL('image/webp', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

// --- STORAGE (IndexedDB) ---
const IDB = {
    init: () => new Promise((res, rej) => {
        const req = indexedDB.open('NAGI_RL_DB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    }),
    get: async (key) => {
        const db = await IDB.init();
        return new Promise((res, rej) => {
            const tx = db.transaction('store', 'readonly');
            const req = tx.objectStore('store').get(key);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    },
    set: async (key, val) => {
        const db = await IDB.init();
        return new Promise((res, rej) => {
            const tx = db.transaction('store', 'readwrite');
            const req = tx.objectStore('store').put(val, key);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
        });
    }
};

const Storage = {
    load: async () => {
        let data = await IDB.get(DB_KEY);
        if (!data || !data.tournaments || data.tournaments.length === 0) {
            const old = JSON.parse(localStorage.getItem('magic_nexus_db'));
            if (old && old.tournaments) {
                old.tournaments.forEach(t => {
                    if (t.teams) t.teams.forEach(tm => {
                        if (!tm.players) tm.players = Array(12).fill({ id: Utils.generateId(), name: '' });
                        tm.players.forEach(p => { if (!p.id) p.id = Utils.generateId(); });
                        if (tm.penaltyPts === undefined) tm.penaltyPts = 0;
                        if (!tm.group) tm.group = 'A';
                        tm.egoAtk = tm.atk || 50;
                        tm.egoDef = tm.def || 50;
                        tm.egoGlb = tm.glb || 50;
                        delete tm.atk; delete tm.def; delete tm.glb;
                        if (tm.money === undefined) tm.money = 1000000;
                        if (tm.players) {
                            tm.players.forEach(p => {
                                if (p.value === undefined) p.value = 50000 + Math.floor(Math.random() * 100000);
                                if (p.loan === undefined) p.loan = null;
                                if (p.efectivity === undefined) p.efectivity = 0;
                            });
                        }
                    });
                    if (!t.tableConfig) t.tableConfig = { liguilla: 8, descenso: 2 };
                    if (!t.format) t.format = 'robin';
                });
                data = old;
                await IDB.set(DB_KEY, data);
            } else {
                data = { tournaments: [] };
            }
        }
        return data;
    },
    save: (data) => {
        const snap = JSON.parse(JSON.stringify(data));
        IDB.set(DB_KEY, snap).catch(console.error);
    }
};

// --- STATE ---
const State = {
    data: { tournaments: [] },
    currentTournamentId: null,
    currentRoundIdx: 0,
    showEGO: false,
    perfMetrics: { goals: true, assists: true, saves: true, ego: true },
    selectedPerfPlayer: null,
    perfChart: null,
    getT: () => State.data.tournaments.find(t => t.id === State.currentTournamentId),
    saveData: () => Storage.save(State.data)
};

// --- ENGINE ---
const Engine = {
    calcStandings: () => {
        const t = State.getT();
        if (!t) return;
        t.teams.forEach(tm => { tm.pj = 0; tm.pg = 0; tm.pe = 0; tm.pp = 0; tm.gf = 0; tm.gc = 0; tm.pts = 0; tm.pigAtk = 0; tm.pigDef = 0; tm.formAtk = 0; tm.formDef = 0; });
        const sumStats = (m) => {
            if (m.played && m.stats) {
                m.stats.forEach(st => {
                    let tm = t.teams.find(x => x.id === st.tId);
                    if (tm) { tm.pigAtk += (st.g * 2.0) + (st.a * 1.5); tm.pigDef += (st.s * 1.0); }
                });
            }
        };
        const processForm = (h, a, sH, sA) => {
            if (h) { h.formAtk += (sH - 3) * 1.5; h.formDef += (3 - sA) * 1.5; h.formAtk = Math.max(-20, Math.min(20, h.formAtk)); h.formDef = Math.max(-20, Math.min(20, h.formDef)); }
            if (a) { a.formAtk += (sA - 3) * 1.5; a.formDef += (3 - sH) * 1.5; a.formAtk = Math.max(-20, Math.min(20, a.formAtk)); a.formDef = Math.max(-20, Math.min(20, a.formDef)); }
        };
        if (t.rounds) {
            t.rounds.forEach(r => {
                if (r) r.forEach(m => {
                    if (m && m.played) {
                        let h = t.teams.find(x => x.id === m.h), a = t.teams.find(x => x.id === m.a);
                        if (h && a) {
                            h.pj++; a.pj++; h.gf += m.sH; h.gc += m.sA; a.gf += m.sA; a.gc += m.sH;
                            if (m.sH > m.sA) { h.pg++; h.pts += 3; a.pp++; } else if (m.sA > m.sH) { a.pg++; a.pts += 3; h.pp++; } else { h.pe++; a.pe++; h.pts++; a.pts++; }
                            processForm(h, a, m.sH, m.sA);
                        }
                        sumStats(m);
                    }
                });
            });
        }
        if (t.playoffs && t.playoffs.rounds) {
            t.playoffs.rounds.forEach(r => {
                if (r) r.forEach(m => {
                    let h = t.teams.find(x => x.id === m.h), a = t.teams.find(x => x.id === m.a);
                    if (m.played && h && a) processForm(h, a, m.sH, m.sA);
                    sumStats(m);
                });
            });
        }
        t.teams.forEach(tm => {
            tm.pts += (tm.penaltyPts || 0);
            let baseAtk = 50 + (3.5 * Math.sqrt(tm.pigAtk || 0));
            let baseDef = 50 + (5.5 * Math.sqrt(tm.pigDef || 0));
            let calcAtk = baseAtk + (tm.formAtk || 0);
            let calcDef = baseDef + (tm.formDef || 0);
            tm.egoAtk = Math.min(120, Math.max(10, Math.floor(calcAtk)));
            tm.egoDef = Math.min(120, Math.max(10, Math.floor(calcDef)));
            tm.egoGlb = Math.floor((tm.egoAtk + tm.egoDef) / 2);
        });
        t.teams.sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
        if (typeof Economy !== 'undefined') Economy.updatePlayerValues();
    },

    generateRoundRobin: () => {
        const t = State.getT();
        if (!t) {
            console.error('[Engine] No tournament found');
            return false;
        }
        
        const teams = t.teams;
        if (!teams || teams.length < 2) {
            console.error('[Engine] Not enough teams:', teams?.length || 0);
            alert('Se necesitan al menos 2 equipos para generar el fixture.');
            return false;
        }
        
        console.log('[Engine] Generando fixture para', teams.length, 'equipos');
        console.log('[Engine] Formato:', t.format);
        
        // Limpiar rondas anteriores
        t.rounds = [];
        
        // Si es formato grupos, asegurar grupos asignados
        if (t.format === 'groups') {
            const numGroups = t.numGroups || 2;
            const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, numGroups);
            
            // Asegurar que cada equipo tenga un grupo
            teams.forEach(tm => {
                if (!tm.group || !groupNames.includes(tm.group)) {
                    // Asignar al grupo con menos equipos
                    const counts = {};
                    groupNames.forEach(g => counts[g] = 0);
                    teams.forEach(t => { if (groupNames.includes(t.group)) counts[t.group]++; });
                    let minGroup = groupNames.reduce((a, b) => counts[a] <= counts[b] ? a : b);
                    tm.group = minGroup;
                    console.log('[Engine] Asignando equipo', tm.name, 'al grupo', minGroup);
                }
            });
        }

        // Generar fixture según formato
        if (t.format === 'groups') {
            const numGroups = t.numGroups || 2;
            const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, numGroups);
            let maxRounds = 0;
            let groupSchedules = {};

            for (let g = 0; g < numGroups; g++) {
                const gName = groupNames[g];
                let gTeams = teams.filter(x => x.group === gName).map(x => x.id);
                if (gTeams.length % 2 !== 0) gTeams.push(null);
                const n = gTeams.length;
                let gRounds = [];

                for (let i = 0; i < n - 1; i++) {
                    let matches = [];
                    for (let j = 0; j < n / 2; j++) {
                        if (gTeams[j] && gTeams[n - 1 - j]) {
                            matches.push({
                                id: Utils.generateId(),
                                group: gName,
                                h: gTeams[j],
                                a: gTeams[n - 1 - j],
                                sH: 0,
                                sA: 0,
                                played: false,
                                stats: []
                            });
                        }
                    }
                    gRounds.push(matches);
                    gTeams.splice(1, 0, gTeams.pop());
                }
                groupSchedules[gName] = gRounds;
                if (gRounds.length > maxRounds) maxRounds = gRounds.length;
            }

            // Combinar rondas de todos los grupos
            for (let r = 0; r < maxRounds; r++) {
                let roundMatches = [];
                for (let g = 0; g < numGroups; g++) {
                    const gName = groupNames[g];
                    if (groupSchedules[gName] && groupSchedules[gName][r]) {
                        roundMatches.push(...groupSchedules[gName][r]);
                    }
                }
                t.rounds.push(roundMatches);
            }

        } else {
            // Formato Liga (Round Robin)
            let tIds = teams.map(x => x.id);
            if (tIds.length % 2 !== 0) tIds.push(null);
            const n = tIds.length;

            for (let i = 0; i < n - 1; i++) {
                let matches = [];
                for (let j = 0; j < n / 2; j++) {
                    if (tIds[j] && tIds[n - 1 - j]) {
                        matches.push({
                            id: Utils.generateId(),
                            group: null,
                            h: tIds[j],
                            a: tIds[n - 1 - j],
                            sH: 0,
                            sA: 0,
                            played: false,
                            stats: []
                        });
                    }
                }
                t.rounds.push(matches);
                tIds.splice(1, 0, tIds.pop());
            }

            // Si es doble vuelta, duplicar las rondas invirtiendo localías
            if (t.doubleRound) {
                const secondHalf = t.rounds.map(round => round.map(m => ({
                    id: Utils.generateId(),
                    group: null,
                    h: m.a,
                    a: m.h,
                    sH: 0,
                    sA: 0,
                    played: false,
                    stats: []
                })));
                t.rounds.push(...secondHalf);
            }
        }
        
        console.log('[Engine] Rondas generadas:', t.rounds.length);
        if (t.rounds.length > 0) {
            console.log('[Engine] Primera ronda:', t.rounds[0]?.length || 0, 'partidos');
        }
        
        // Resetear índice de ronda actual
        State.currentRoundIdx = 0;
        return t.rounds.length > 0;
    },

    processMatchStats: (mId, isPlayoff, playoffPath) => {
        const t = State.getT();
        let m = null;
        if (isPlayoff) m = t.playoffs.rounds[playoffPath.r][playoffPath.i];
        else m = t.rounds[State.currentRoundIdx].find(x => x.id === mId);
        if (!m) return { error: 'Match not found.' };
        let newStats = [], sH = 0, sA = 0;
        const procTeam = (tId, isHome) => {
            let tm = t.teams.find(x => x.id === tId);
            if (!tm) return;
            tm.players.forEach(p => {
                if (!p || !p.name) return;
                let gEl = document.getElementById(`pg-${m.id}-${p.id}`);
                let aEl = document.getElementById(`pa-${m.id}-${p.id}`);
                let sEl = document.getElementById(`ps-${m.id}-${p.id}`);
                let shotsEl = document.getElementById(`pshots-${m.id}-${p.id}`);
                let g = gEl ? (parseInt(gEl.value) || 0) : 0;
                let a = aEl ? (parseInt(aEl.value) || 0) : 0;
                let s = sEl ? (parseInt(sEl.value) || 0) : 0;
                let shots = shotsEl ? (parseInt(shotsEl.value) || 0) : 0;
                if (g > 0 || a > 0 || s > 0 || shots > 0) newStats.push({ pId: p.id, tId: tm.id, g, a, s, shots });
                if (isHome) sH += g; else sA += g;
            });
        };
        procTeam(m.h, true);
        procTeam(m.a, false);
        if (isPlayoff && sH === sA) return { error: 'Playoff matches must have a winner.' };
        m.stats = newStats; m.sH = sH; m.sA = sA; m.played = true;
        newStats.forEach(st => {
            const player = t.teams.flatMap(tm => tm.players).find(p => p.id === st.pId);
            if (player) {
                const efectivity = st.shots > 0 ? (st.g / st.shots) * 100 : 0;
                st.efectivity = efectivity;
                player.efectivity = efectivity;
                if (typeof Economy !== 'undefined') Economy.updatePlayerValue(player);
            }
        });
        if (isPlayoff && m.nextR !== undefined) {
            const winId = m.sH > m.sA ? m.h : m.a;
            t.playoffs.rounds[m.nextR][Math.floor(playoffPath.i / 2)][m.nextSide] = winId;
        }
        return { success: true };
    },

    getGlobalPlayerStats: () => {
        const t = State.getT();
        let playersMap = {};
        if (!t || !t.teams) return [];
        t.teams.forEach(tm => {
            if (tm.players) {
                tm.players.forEach(p => {
                    if (p && p.name && p.name.trim() !== '') {
                        playersMap[p.id] = { id: p.id, name: p.name, tId: tm.id, g: 0, a: 0, s: 0, shots: 0, efectivity: 0, imp: 0 };
                    }
                });
            }
        });
        const processRounds = (roundsArray) => {
            if (roundsArray) roundsArray.forEach(r => {
                if (r) r.forEach(m => {
                    if (m && m.played && m.stats) m.stats.forEach(st => {
                        if (st && playersMap[st.pId]) {
                            playersMap[st.pId].g += (st.g || 0);
                            playersMap[st.pId].a += (st.a || 0);
                            playersMap[st.pId].s += (st.s || 0);
                            playersMap[st.pId].shots += (st.shots || 0);
                            playersMap[st.pId].efectivity = st.efectivity || 0;
                            playersMap[st.pId].imp += ((st.g || 0) * 2.0) + ((st.a || 0) * 1.5) + ((st.s || 0) * 1.0);
                        }
                    });
                });
            });
        };
        processRounds(t.rounds);
        if (t.playoffs && t.playoffs.rounds) processRounds(t.playoffs.rounds);
        return Object.values(playersMap);
    },

    getPlayerRoundStats: (playerId) => {
        const t = State.getT();
        if (!t || !t.rounds) return [];
        const rounds = t.rounds;
        const result = [];
        rounds.forEach((round, idx) => {
            let g = 0, a = 0, s = 0, shots = 0, imp = 0;
            round.forEach(m => {
                if (m && m.played && m.stats) {
                    m.stats.forEach(st => {
                        if (st.pId === playerId) {
                            g += st.g || 0; a += st.a || 0; s += st.s || 0; shots += st.shots || 0;
                            imp += ((st.g || 0) * 2.0) + ((st.a || 0) * 1.5) + ((st.s || 0) * 1.0);
                        }
                    });
                }
            });
            result.push({ round: idx + 1, g, a, s, shots, ego: imp });
        });
        return result;
    },

    simulateMatchStats: (hId, aId, hStance = 'balanced', aStance = 'balanced') => {
        const t = State.getT();
        const h = t.teams.find(x => x.id === hId) || { egoAtk: 50, egoDef: 50, egoGlb: 50, players: [] };
        const a = t.teams.find(x => x.id === aId) || { egoAtk: 50, egoDef: 50, egoGlb: 50, players: [] };
        const applyStance = (val, stance, isAtk) => {
            if (stance === 'offensive') return isAtk ? val * 1.15 : val * 0.85;
            if (stance === 'defensive') return isAtk ? val * 0.85 : val * 1.15;
            return val;
        };
        const hAtk = applyStance(h.egoAtk || 50, hStance, true);
        const hDef = applyStance(h.egoDef || 50, hStance, false);
        const aAtk = applyStance(a.egoAtk || 50, aStance, true);
        const aDef = applyStance(a.egoDef || 50, aStance, false);
        const globalStats = Engine.getGlobalPlayerStats();
        const getTeamMomentum = (team) => {
            if (!team || !team.players) return 0;
            let totalG = 0;
            team.players.forEach(p => {
                let pStat = globalStats.find(x => x.id === p.id);
                if (pStat) totalG += pStat.g;
            });
            return Math.min(4, totalG / 8);
        };
        const hMom = getTeamMomentum(h);
        const aMom = getTeamMomentum(a);
        let baseH = 1.5 + (Math.random() * 3.5) + hMom;
        let baseA = 1.5 + (Math.random() * 3.5) + aMom;
        let sH = Math.floor(baseH * Math.pow(hAtk / Math.max(10, aDef), 1.4));
        let sA = Math.floor(baseA * Math.pow(aAtk / Math.max(10, hDef), 1.4));
        if (Math.random() > 0.85) sH += Math.floor(Math.random() * 4) + 1;
        if (Math.random() > 0.85) sA += Math.floor(Math.random() * 4) + 1;
        sH = Math.min(20, Math.max(0, sH));
        sA = Math.min(20, Math.max(0, sA));
        let stats = [];
        const pickWeightedPlayer = (team, roleType) => {
            if (!team || !team.players) return null;
            const valid = team.players.filter(p => p && p.name && p.name.trim() !== '');
            if (valid.length === 0) return null;
            let weighted = valid.map((p, idx) => {
                let weight = 1;
                if (roleType === 'atk') {
                    if (idx === 0) weight = 6;
                    else if (idx >= 1 && idx <= 2) weight = 5;
                    else if (idx >= 3 && idx <= 5) weight = 2;
                } else {
                    if (idx === 0 || idx === 1 || idx === 2) weight = 5;
                }
                const pGlob = globalStats.find(x => x.id === p.id);
                if (pGlob) {
                    if (roleType === 'atk') weight += (pGlob.g * 2.5) + (pGlob.a * 1.5);
                    else weight += (pGlob.s * 2.5);
                }
                return { p, w: weight };
            });
            let totalW = weighted.reduce((acc, curr) => acc + curr.w, 0);
            let rand = Math.random() * totalW;
            let sum = 0;
            for (let item of weighted) { sum += item.w; if (rand <= sum) return item.p; }
            return valid[0];
        };
        // Simulate shots too
        for (let i = 0; i < sH; i++) {
            let scorer = pickWeightedPlayer(h, 'atk');
            if (scorer) {
                let existing = stats.find(x => x.pId === scorer.id);
                if (existing) { existing.g++; existing.shots = (existing.shots || 0) + 1 + Math.floor(Math.random() * 3); }
                else stats.push({ pId: scorer.id, tId: h.id || hId, g: 1, a: 0, s: 0, shots: 1 + Math.floor(Math.random() * 3) });
                if (Math.random() < 0.8) {
                    let asister = pickWeightedPlayer(h, 'atk');
                    if (asister && asister.id !== scorer.id) {
                        let exAs = stats.find(x => x.pId === asister.id);
                        if (exAs) exAs.a++;
                        else stats.push({ pId: asister.id, tId: h.id || hId, g: 0, a: 1, s: 0, shots: 0 });
                    }
                }
            }
        }
        for (let i = 0; i < sA; i++) {
            let scorer = pickWeightedPlayer(a, 'atk');
            if (scorer) {
                let existing = stats.find(x => x.pId === scorer.id);
                if (existing) { existing.g++; existing.shots = (existing.shots || 0) + 1 + Math.floor(Math.random() * 3); }
                else stats.push({ pId: scorer.id, tId: a.id || aId, g: 1, a: 0, s: 0, shots: 1 + Math.floor(Math.random() * 3) });
                if (Math.random() < 0.8) {
                    let asister = pickWeightedPlayer(a, 'atk');
                    if (asister && asister.id !== scorer.id) {
                        let exAs = stats.find(x => x.pId === asister.id);
                        if (exAs) exAs.a++;
                        else stats.push({ pId: asister.id, tId: a.id || aId, g: 0, a: 1, s: 0, shots: 0 });
                    }
                }
            }
        }
        let numSavesH = Math.floor(Math.random() * 4) + sA;
        let numSavesA = Math.floor(Math.random() * 4) + sH;
        for (let i = 0; i < numSavesH; i++) {
            let saver = pickWeightedPlayer(h, 'def');
            if (saver) {
                let existing = stats.find(x => x.pId === saver.id);
                if (existing) existing.s++;
                else stats.push({ pId: saver.id, tId: h.id || hId, g: 0, a: 0, s: 1, shots: 0 });
            }
        }
        for (let i = 0; i < numSavesA; i++) {
            let saver = pickWeightedPlayer(a, 'def');
            if (saver) {
                let existing = stats.find(x => x.pId === saver.id);
                if (existing) existing.s++;
                else stats.push({ pId: saver.id, tId: a.id || aId, g: 0, a: 0, s: 1, shots: 0 });
            }
        }
        return { sH, sA, stats };
    }
};

// --- UI CONTROLLER ---
const UIController = {
    statsLimit: 10,
    leaderboardLimit: 10,
    currentStatsTab: 'goals',
    activeSortable: null,
    activeGroupSortables: [],
    activeModalSortables: [],

    init: () => {
        UIController.buildNav();
        UIController.renderDashboard();
        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', (e) => {
            App.importTournament(e.target);
        });
        document.querySelectorAll('.stats-tab').forEach(el => {
            el.addEventListener('click', () => {
                const tab = el.dataset.tab;
                if (tab) UIController.renderStatsTab(tab);
            });
        });
        document.querySelectorAll('.perf-toggles .toggle-btn').forEach(el => {
            el.addEventListener('click', () => {
                const metric = el.dataset.metric;
                if (metric) {
                    State.perfMetrics[metric] = !State.perfMetrics[metric];
                    el.classList.toggle('active');
                    App.updatePerfChart();
                }
            });
        });
        document.getElementById('btn-exit').addEventListener('click', () => App.exitTournament());
        // Asegurar que el botón generate esté conectado
        const genBtn = document.getElementById('btn-generate-fixture');
        if (genBtn) {
            genBtn.onclick = () => App.generateFixture();
        }
    },

    buildNav: () => {
        const nav = document.getElementById('main-nav');
        nav.innerHTML = '';
        UIController.updateNav();
    },

    updateNav: () => {
        const nav = document.getElementById('main-nav');
        const hasTournament = !!State.currentTournamentId;
        nav.innerHTML = '';
        if (!hasTournament) {
            const link = document.createElement('span');
            link.className = 'nav-link active';
            link.dataset.view = 'dashboard';
            link.textContent = 'Dashboard';
            link.addEventListener('click', () => UIController.switchView('dashboard'));
            nav.appendChild(link);
            return;
        }
        const views = [
            { id: 'performance', label: 'Performance', icon: 'fa-chart-line' },
            { id: 'clubs', label: 'Clubs', icon: 'fa-shield-halved' },
            { id: 'schedule', label: 'Schedule', icon: 'fa-calendar-day' },
            { id: 'playoffs', label: 'Playoffs', icon: 'fa-sitemap' },
            { id: 'stats', label: 'Stats', icon: 'fa-chart-simple' },
            { id: 'leaderboard', label: 'Elite', icon: 'fa-trophy' },
            { id: 'economy', label: 'Economy', icon: 'fa-coins' }
        ];
        views.forEach(v => {
            const link = document.createElement('span');
            link.className = 'nav-link';
            if (v.id === 'performance') link.classList.add('active');
            link.dataset.view = v.id;
            link.innerHTML = `<i class="fa-solid ${v.icon} mr-1.5 text-[0.55rem]"></i> ${v.label}`;
            link.addEventListener('click', () => UIController.switchView(v.id));
            nav.appendChild(link);
        });
    },

    switchView: (viewId) => {
        const t = State.getT();
        if (!t && viewId !== 'dashboard') return;
        if (UIController.activeSortable) { UIController.activeSortable.destroy(); UIController.activeSortable = null; }
        if (UIController.activeGroupSortables) { UIController.activeGroupSortables.forEach(s => s.destroy()); UIController.activeGroupSortables = []; }
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const activeView = document.getElementById(`view-${viewId}`);
        if (activeView) activeView.classList.add('active');
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        const navLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
        if (navLink) navLink.classList.add('active');

        if (viewId === 'performance') App.renderPerformance();
        if (viewId === 'clubs') { Engine.calcStandings(); UIController.renderClubs(); }
        if (viewId === 'schedule') UIController.renderSchedule();
        if (viewId === 'playoffs') UIController.renderPlayoffs();
        if (viewId === 'stats') UIController.renderStatsTab('goals');
        if (viewId === 'leaderboard') UIController.renderLeaderboard();
        if (viewId === 'economy') { if (typeof Economy !== 'undefined') Economy.render(); }
    },

    renderDashboard: () => {
        UIController.switchView('dashboard');
        document.getElementById('header-info').style.display = 'none';
        document.getElementById('btn-export').style.display = 'none';
        document.getElementById('btn-exit').style.display = 'none';
        document.getElementById('btn-toggle-ego').style.display = 'none';

        let html = `
            <div onclick="UIController.showModal('mod-tour')" class="dashboard-card border-dashed border-2 border-[#1A2335] hover:border-[#3B82F6]">
                <div class="icon"><i class="fa-solid fa-plus-circle"></i></div>
                <h3>New Tournament</h3>
                <p>Create a new season</p>
            </div>
        `;
        html += State.data.tournaments.map(t => `
            <div class="dashboard-card" onclick="App.enterTournament('${t.id}')">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <img src="${t.logo}" class="w-12 h-12 rounded-full bg-[#0F1624] border border-[#1A2335] object-contain" />
                </div>
                <h3 class="text-base">${t.name}</h3>
                <p>${t.teams.length} clubs • ${t.format === 'groups' ? 'Groups' : 'League'}</p>
                <div class="actions">
                    <button onclick="event.stopPropagation(); UIController.showModal('mod-tour','${t.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="delete" onclick="event.stopPropagation(); App.deleteTournament('${t.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('');
        document.getElementById('dashboard-grid').innerHTML = html;
        UIController.updateNav();
    },

    renderClubs: () => {
        const t = State.getT();
        if (!t) return;
        const container = document.getElementById('standings-container');
        const ligCount = t.tableConfig?.liguilla !== undefined ? t.tableConfig.liguilla : 8;
        const desCount = t.tableConfig?.descenso !== undefined ? t.tableConfig.descenso : 2;

        const buildTable = (teams, title, isGroup) => {
            let rows = teams.map((tm, i) => {
                let rowClass = '';
                if (!isGroup) {
                    if (i < ligCount) rowClass = 'qual-row';
                    else if (i >= teams.length - desCount && desCount > 0) rowClass = 'rel-row';
                } else {
                    if (i < 2 && t.rounds && t.rounds.length > 0) rowClass = 'qual-row';
                    else if (i >= teams.length - 1 && t.rounds && t.rounds.length > 0) rowClass = 'rel-row';
                }
                let egoHtml = '';
                if (State.showEGO) {
                    let arrowAtk = (tm.formAtk > 0) ? '▲' : ((tm.formAtk < 0) ? '▼' : '');
                    let arrowDef = (tm.formDef > 0) ? '▲' : ((tm.formDef < 0) ? '▼' : '');
                    let formGlb = (tm.formAtk || 0) + (tm.formDef || 0);
                    let arrowGlb = (formGlb > 0) ? '▲' : ((formGlb < 0) ? '▼' : '');
                    egoHtml = `
                        <div class="ego-badges">
                            <span class="ego-badge atk">ATK ${tm.egoAtk||50}${arrowAtk}</span>
                            <span class="ego-badge def">DEF ${tm.egoDef||50}${arrowDef}</span>
                            <span class="ego-badge glb">GLB ${tm.egoGlb||50}${arrowGlb}</span>
                        </div>
                    `;
                }
                let adjHtml = tm.penaltyPts ? `<span class="text-[0.5rem] text-[#F97316] block">Adj: ${tm.penaltyPts>0?'+'+tm.penaltyPts:tm.penaltyPts}</span>` : '';
                return `
                    <tr class="${rowClass}">
                        <td class="text-center font-black text-[#94A3B8]">${i+1}</td>
                        <td>
                            <div class="club-cell">
                                <img src="${tm.shield||''}" />
                                <div>
                                    <div class="name">${tm.name||'Unknown'}</div>
                                    ${egoHtml}
                                </div>
                            </div>
                        </td>
                        <td class="text-center pts">${tm.pts}${adjHtml}</td>
                        <td class="text-center">${tm.pj}</td>
                        <td class="text-center text-[#3B82F6] font-bold">${tm.pg}</td>
                        <td class="text-center text-[#F97316] font-bold">${tm.pe}</td>
                        <td class="text-center text-[#F97316] font-bold">${tm.pp}</td>
                        <td class="text-center gd">${tm.gf-tm.gc}</td>
                        <td class="text-right">
                            <button class="edit-btn" onclick="UIController.showModal('mod-team','${tm.id}')"><i class="fa-solid fa-gear"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');

            let titleHtml = title ? `<h3 class="text-xl font-black text-[#3B82F6] mb-3">${title}</h3>` : '';
            return `
                <div class="mb-6">
                    ${titleHtml}
                    <div class="standings-table-wrap">
                        <table class="standings-table">
                            <thead>
                                <tr>
                                    <th class="center">Pos</th>
                                    <th>Club</th>
                                    <th class="center">Pts</th>
                                    <th class="center">PJ</th>
                                    <th class="center">W</th>
                                    <th class="center">D</th>
                                    <th class="center">L</th>
                                    <th class="center">GD</th>
                                    <th class="right">⚙️</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        };

        if (t.format === 'groups') {
            const numGroups = t.numGroups || 2;
            const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, numGroups);
            t.teams.forEach(tm => { if (!tm.group || !groupNames.includes(tm.group)) tm.group = groupNames[0]; });

            if (!t.rounds || t.rounds.length === 0) {
                let html = `
                    <div class="bg-[#0F1624] border border-[#1A2335] rounded-xl p-4 mb-5 text-center">
                        <p class="text-[#3B82F6] font-bold uppercase tracking-widest text-xs"><i class="fa-solid fa-hand-pointer mr-2"></i> Pre‑season: Drag clubs to their final groups</p>
                        <p class="text-[#94A3B8] text-[0.45rem] font-bold mt-1 uppercase">Once you generate the schedule, positions lock.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
                `;
                groupNames.forEach(g => {
                    let gTeams = t.teams.filter(x => x.group === g);
                    html += `
                        <div class="glass-card flex flex-col overflow-hidden">
                            <h3 class="font-black text-lg text-[#3B82F6] p-4 bg-[#0F1624] border-b border-[#1A2335] flex items-center justify-between">
                                GROUP ${g}
                                <button onclick="UIController.showModal('mod-group','${g}')" class="text-[#94A3B8] hover:text-white text-sm"><i class="fa-solid fa-cog"></i></button>
                            </h3>
                            <div class="flex-1 p-4 bg-[#080C14] min-h-[100px] space-y-2 group-sortable" data-group="${g}">
                                ${gTeams.map(tm => `
                                    <div class="bg-[#0F1624] border border-[#1A2335] p-3 rounded-xl flex items-center justify-between cursor-grab hover:border-[#3B82F6] transition-colors" data-id="${tm.id}">
                                        <div class="flex items-center gap-3">
                                            <img src="${tm.shield||''}" class="w-8 h-8 rounded bg-[#080C14] object-contain" />
                                            <span class="font-bold text-white uppercase text-sm">${tm.name||'Unknown'}</span>
                                        </div>
                                        <i class="fa-solid fa-grip-lines text-[#94A3B8]"></i>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                container.innerHTML = html;
                if (UIController.activeGroupSortables) { UIController.activeGroupSortables.forEach(s => s.destroy()); UIController.activeGroupSortables = []; }
                document.querySelectorAll('.group-sortable').forEach(el => {
                    let s = new Sortable(el, {
                        group: 'shared-groups',
                        animation: 150,
                        onEnd: (e) => {
                            const teamId = e.item.dataset.id;
                            const newGroup = e.to.dataset.group;
                            const tm = t.teams.find(x => x.id === teamId);
                            if (tm && tm.group !== newGroup) {
                                tm.group = newGroup;
                                State.saveData();
                            }
                        }
                    });
                    UIController.activeGroupSortables.push(s);
                });
                return;
            } else {
                let grouped = {};
                groupNames.forEach(g => grouped[g] = []);
                t.teams.forEach(tm => { if (grouped[tm.group]) grouped[tm.group].push(tm); });
                let html = '';
                groupNames.forEach(g => { html += buildTable(grouped[g], `GROUP ${g}`, true); });
                container.innerHTML = html;
            }
        } else {
            container.innerHTML = buildTable(t.teams, null, false);
        }
    },

    renderSchedule: () => {
        const t = State.getT();
        if (!t) {
            console.warn('[UI] No tournament found for schedule');
            return;
        }
        
        const btn = document.getElementById('btn-generate-fixture');
        const cnt = document.getElementById('rounds-container');
        
        console.log('[UI] renderSchedule - rounds:', t.rounds?.length || 0);
        
        // Si no hay rondas, mostrar el botón y ocultar el contenedor
        if (!t.rounds || t.rounds.length === 0) {
            btn.style.display = 'inline-block';
            cnt.style.display = 'none';
            console.log('[UI] Mostrando botón Generate');
            return;
        }
        
        // Si hay rondas, ocultar el botón y mostrar el contenido
        btn.style.display = 'none';
        cnt.style.display = 'block';
        console.log('[UI] Mostrando rondas, ocultando botón');
        
        // Renderizar tabs de rondas
        const tabsContainer = document.getElementById('round-tabs');
        tabsContainer.innerHTML = '';
        t.rounds.forEach((_, idx) => {
            const tab = document.createElement('button');
            tab.className = `tab-btn ${idx === State.currentRoundIdx ? 'active' : ''}`;
            tab.textContent = `R${idx+1}`;
            tab.addEventListener('click', () => {
                if (idx !== State.currentRoundIdx) {
                    State.currentRoundIdx = idx;
                    UIController.renderSchedule();
                }
            });
            tabsContainer.appendChild(tab);
        });

        // Renderizar partidos de la ronda actual
        const list = document.getElementById('matches-list');
        const round = t.rounds[State.currentRoundIdx];
        if (!round) {
            list.innerHTML = '<p class="text-[#94A3B8]">No hay partidos en esta ronda.</p>';
            return;
        }
        
        let html = '';
        round.forEach(m => {
            const h = t.teams.find(x => x.id === m.h) || { name: 'Free', shield: '' };
            const a = t.teams.find(x => x.id === m.a) || { name: 'Free', shield: '' };
            let actions = '';
            if (m.played) {
                actions = `
                    <div class="match-actions">
                        <span class="score">${m.sH} <span class="sep">-</span> ${m.sA}</span>
                        <button class="btn-sm edit" onclick="UIController.showModal('mod-report','${m.id}')">Edit</button>
                    </div>
                `;
            } else {
                actions = `
                    <div class="match-actions">
                        <button class="btn-sm report" onclick="UIController.showModal('mod-report','${m.id}')">Report</button>
                        <button class="btn-sm pred" onclick="UIController.simulatePredictionPopup('${m.id}',false,null)"><i class="fa-solid fa-bolt"></i></button>
                    </div>
                `;
            }
            html += `
                <div class="match-card" data-id="${m.id}">
                    <div class="team home" draggable="true" ondragstart="App.dragTeam(event,'${m.id}','h')" ondragover="event.preventDefault();event.currentTarget.classList.add('drag-over')" ondragleave="event.currentTarget.classList.remove('drag-over')" ondrop="App.dropTeam(event,'${m.id}','h')">
                        <span>${h.name}</span>
                        <img src="${h.shield}" />
                    </div>
                    <div class="match-center">
                        ${m.played ? `<div class="score">${m.sH} <span class="sep">-</span> ${m.sA}</div>` : `<div class="vs">VS</div>`}
                    </div>
                    <div class="team away" draggable="true" ondragstart="App.dragTeam(event,'${m.id}','a')" ondragover="event.preventDefault();event.currentTarget.classList.add('drag-over')" ondragleave="event.currentTarget.classList.remove('drag-over')" ondrop="App.dropTeam(event,'${m.id}','a')">
                        <img src="${a.shield}" />
                        <span>${a.name}</span>
                        <span class="drag-handle"><i class="fa-solid fa-grip-lines"></i></span>
                    </div>
                    ${actions}
                </div>
            `;
        });
        list.innerHTML = html;

        // Activar sortable
        if (UIController.activeSortable) UIController.activeSortable.destroy();
        UIController.activeSortable = new Sortable(list, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: () => {
                const roundData = t.rounds[State.currentRoundIdx];
                const items = list.querySelectorAll('.match-card');
                const newOrder = [];
                items.forEach(el => {
                    const id = el.dataset.id;
                    const m = roundData.find(x => x.id === id);
                    if (m) newOrder.push(m);
                });
                t.rounds[State.currentRoundIdx] = newOrder;
                State.saveData();
            }
        });
    },

    renderPlayoffs: () => {
        const t = State.getT();
        if (!t) return;
        const cnt = document.getElementById('playoffs-container');
        if (!t.playoffs) {
            cnt.innerHTML = '<p class="text-[#94A3B8] text-sm font-medium">Select format and generate bracket</p>';
            return;
        }
        const drawMatch = (r, i, roundClass) => {
            const m = t.playoffs.rounds[r][i];
            const h = t.teams.find(x => x.id === m.h);
            const a = t.teams.find(x => x.id === m.a);
            let actions = '';
            if (m.played) {
                actions = `<div class="match-actions"><button class="btn-xs edit" onclick="UIController.showModal('mod-report',{mId:'${m.id}',isPlayoff:true,r:${r},i:${i}})">${m.sH}-${m.sA}</button></div>`;
            } else {
                actions = `
                    <div class="match-actions">
                        <button class="btn-xs report" onclick="UIController.showModal('mod-report',{mId:'${m.id}',isPlayoff:true,r:${r},i:${i}})">Report</button>
                        <button class="btn-xs pred" onclick="UIController.simulatePredictionPopup('${m.id}',true,{r:${r},i:${i}})"><i class="fa-solid fa-bolt"></i></button>
                    </div>
                `;
            }
            return `
                <div class="bracket-match ${roundClass}">
                    <div class="team-row"><span class="name"><img src="${h?h.shield:''}" />${h?h.name:'TBD'}</span><span class="score">${m.played?m.sH:'-'}</span></div>
                    <div class="team-row"><span class="name"><img src="${a?a.shield:''}" />${a?a.name:'TBD'}</span><span class="score">${m.played?m.sA:'-'}</span></div>
                    ${(h&&a)?actions:''}
                </div>
            `;
        };

        let html = '<div class="bracket-container">';
        const format = t.playoffs.format;
        if (format === 8) {
            html += `<div class="bracket-round bracket-round-quarter">${drawMatch(0,0,'')}${drawMatch(0,1,'')}</div>`;
            html += `<div class="bracket-round bracket-round-semi">${drawMatch(1,0,'')}</div>`;
            html += `<div class="bracket-round bracket-round-final"><div class="text-[#FBBF24] text-[0.5rem] font-black uppercase mb-2 text-center">Final</div>${drawMatch(2,0,'')}</div>`;
            html += `<div class="bracket-round bracket-round-semi">${drawMatch(1,1,'')}</div>`;
            html += `<div class="bracket-round bracket-round-quarter">${drawMatch(0,2,'')}${drawMatch(0,3,'')}</div>`;
        } else if (format === 4) {
            html += `<div class="bracket-round bracket-round-semi">${drawMatch(0,0,'')}</div>`;
            html += `<div class="bracket-round bracket-round-final"><div class="text-[#FBBF24] text-[0.5rem] font-black uppercase mb-2 text-center">Final</div>${drawMatch(1,0,'')}</div>`;
            html += `<div class="bracket-round bracket-round-semi">${drawMatch(0,1,'')}</div>`;
        } else {
            html += `<div class="bracket-round bracket-round-final"><div class="text-[#FBBF24] text-[0.5rem] font-black uppercase mb-2 text-center">Final</div>${drawMatch(0,0,'')}</div>`;
        }
        html += '</div>';
        cnt.innerHTML = html;
    },

    renderStatsTab: (tab, loadMore = false) => {
        const t = State.getT();
        if (!t) return;
        if (!loadMore) { UIController.statsLimit = 10; UIController.currentStatsTab = tab; } else UIController.statsLimit += 10;

        document.querySelectorAll('.stats-tab').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`.stats-tab[data-tab="${tab}"]`);
        if (activeEl) activeEl.classList.add('active');

        const roundSelector = document.getElementById('stats-round-selector');
        const listContainer = document.getElementById('stats-list-container');

        if (tab === 'round') {
            roundSelector.style.display = 'block';
            if (t.rounds && t.rounds.length > 0) {
                const currentRound = State.currentRoundIdx || 0;
                let html = `<div class="round-selector-wrap">`;
                t.rounds.forEach((_, idx) => {
                    const active = idx === currentRound ? 'active' : '';
                    html += `<button class="round-btn ${active}" data-round="${idx}">R${idx+1}</button>`;
                });
                html += `</div>`;
                roundSelector.innerHTML = html;
                roundSelector.querySelectorAll('.round-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const round = parseInt(btn.dataset.round);
                        if (!isNaN(round) && round !== State.currentRoundIdx) {
                            State.currentRoundIdx = round;
                            UIController.renderRoundStats();
                            roundSelector.querySelectorAll('.round-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                        }
                    });
                });
                UIController.renderRoundStats();
            } else {
                listContainer.innerHTML = '<div class="glass-card p-6 text-center"><p class="text-[#94A3B8] font-bold uppercase tracking-widest">No rounds generated.</p></div>';
            }
            return;
        }
        roundSelector.style.display = 'none';

        if (tab === 'ego') {
            const sortedTeams = [...(t.teams || [])].sort((a, b) => (b.egoGlb || 50) - (a.egoGlb || 50));
            const tiers = [];
            for (let i = 0; i < sortedTeams.length; i += 10) {
                tiers.push(sortedTeams.slice(i, i + 10));
            }
            let html = '';
            tiers.forEach((tier, idx) => {
                const start = idx * 10 + 1;
                const end = start + tier.length - 1;
                html += `<div class="tier-section"><div class="tier-header">Tier ${idx+1} (Positions ${start}-${end})</div><div class="tier-list">`;
                tier.forEach((tm, i) => {
                    const rank = start + i;
                    const pct = Math.min(100, ((tm.egoGlb||50)/120)*100);
                    html += `
                        <div class="tier-item">
                            <div class="rank">#${rank}</div>
                            <img src="${tm.shield||''}" class="avatar" />
                            <div class="info"><div class="name">${tm.name}</div><div class="team">ATK ${tm.egoAtk||50} | DEF ${tm.egoDef||50}</div></div>
                            <div class="stat-value">${tm.egoGlb||50}</div>
                            <div class="ego-bar"><div class="fill" style="width:${pct}%"></div></div>
                        </div>
                    `;
                });
                html += `</div></div>`;
            });
            listContainer.innerHTML = html;
            return;
        }

        const stats = Engine.getGlobalPlayerStats();
        const key = tab === 'goals' ? 'g' : (tab === 'assists' ? 'a' : 's');
        const sorted = [...stats].sort((a, b) => (b[key] || 0) - (a[key] || 0) || (b.imp || 0) - (a.imp || 0));
        const total = sorted.length;
        const limit = Math.min(UIController.statsLimit, total);
        const visible = sorted.slice(0, limit);
        const hasMore = limit < total;

        const tiers = [];
        for (let i = 0; i < visible.length; i += 10) {
            tiers.push(visible.slice(i, i + 10));
        }

        let html = '';
        tiers.forEach((tier, idx) => {
            const start = idx * 10 + 1;
            const end = start + tier.length - 1;
            html += `<div class="tier-section"><div class="tier-header">Tier ${idx+1} (Positions ${start}-${end})</div><div class="tier-list">`;
            tier.forEach((p, i) => {
                const rank = start + i;
                const tm = t.teams.find(x => x.id === p.tId) || { shield: '', name: 'Free' };
                let rankClass = '';
                if (rank === 1) rankClass = 'gold';
                else if (rank === 2) rankClass = 'silver';
                else if (rank === 3) rankClass = 'bronze';
                html += `
                    <div class="tier-item">
                        <div class="rank ${rankClass}">#${rank}</div>
                        <img src="${tm.shield||''}" class="avatar" />
                        <div class="info"><div class="name">${p.name||'Player'}</div><div class="team">${tm.name}</div></div>
                        <div class="stat-value">${p[key]||0}</div>
                    </div>
                `;
            });
            html += `</div></div>`;
        });

        if (hasMore) {
            html += `<div class="flex justify-center mt-4"><button class="btn-secondary" onclick="UIController.renderStatsTab('${UIController.currentStatsTab}',true)"><i class="fa-solid fa-chevron-down mr-1"></i> Load more</button></div>`;
        }
        listContainer.innerHTML = html;
    },

    renderRoundStats: () => {
        const t = State.getT();
        if (!t) return;
        const rIdx = State.currentRoundIdx || 0;
        const area = document.getElementById('stats-list-container');
        if (!t.rounds || !t.rounds[rIdx]) {
            area.innerHTML = '<div class="glass-card p-6 text-center"><p class="text-[#94A3B8] font-bold uppercase tracking-widest">No data for this round.</p></div>';
            return;
        }
        const round = t.rounds[rIdx];
        let pStats = {};
        let tStats = {};
        t.teams.forEach(tm => {
            tStats[tm.id] = { id: tm.id, name: tm.name, shield: tm.shield, pts: 0, matchPts: 0, g: 0, a: 0, s: 0 };
            tm.players.forEach(p => {
                if (p.name) pStats[p.id] = { id: p.id, name: p.name, tId: tm.id, g: 0, a: 0, s: 0, imp: 0 };
            });
        });
        round.forEach(m => {
            if (m && m.played && m.stats) {
                let hPts = 0, aPts = 0;
                if (m.sH > m.sA) hPts = 3;
                else if (m.sA > m.sH) aPts = 3;
                else { hPts = 1; aPts = 1; }
                if (tStats[m.h]) tStats[m.h].matchPts += hPts;
                if (tStats[m.a]) tStats[m.a].matchPts += aPts;
                m.stats.forEach(st => {
                    if (pStats[st.pId]) {
                        pStats[st.pId].g += (st.g || 0);
                        pStats[st.pId].a += (st.a || 0);
                        pStats[st.pId].s += (st.s || 0);
                        pStats[st.pId].imp += ((st.g || 0) * 2.0) + ((st.a || 0) * 1.5) + ((st.s || 0) * 1.0);
                    }
                    if (tStats[st.tId]) {
                        tStats[st.tId].g += (st.g || 0);
                        tStats[st.tId].a += (st.a || 0);
                        tStats[st.tId].s += (st.s || 0);
                    }
                });
            }
        });
        Object.values(tStats).forEach(tm => {
            tm.score = (tm.matchPts * 10) + (tm.g * 2.0) + (tm.a * 1.5) + (tm.s * 1.0);
        });
        const bestPlayers = Object.values(pStats).sort((a, b) => b.imp - a.imp).filter(p => p.imp > 0);
        const bestTeams = Object.values(tStats).sort((a, b) => b.score - a.score).filter(tm => tm.score > 0);
        let perfs = [];
        Object.values(pStats).forEach(p => {
            if (p.g > 0) perfs.push({ p, role: 'g', val: p.g });
            if (p.a > 0) perfs.push({ p, role: 'a', val: p.a });
            if (p.s > 0) perfs.push({ p, role: 's', val: p.s });
        });
        perfs.sort((a, b) => b.val - a.val || b.p.imp - a.p.imp);
        let tridente = { g: null, a: null, s: null };
        let used = new Set();
        for (let perf of perfs) {
            if (!tridente[perf.role] && !used.has(perf.p.id)) {
                tridente[perf.role] = perf;
                used.add(perf.p.id);
            }
            if (tridente.g && tridente.a && tridente.s) break;
        }

        const drawTeamPodium = (tm, pos) => {
            if (!tm) return `<div class="w-20 h-20 bg-[#0F1624] rounded-t-2xl border-b border-[#1A2335] flex items-center justify-center text-[0.45rem] text-[#94A3B8] uppercase font-bold">Empty</div>`;
            const h = pos === 1 ? 'h-44' : 'h-36';
            const c = pos === 1 ? 'border-[#F97316]/50 bg-gradient-to-t from-[#F97316]/20' : (pos === 2 ? 'border-[#94A3B8]/50 bg-gradient-to-t from-[#94A3B8]/20' : 'border-[#3B82F6]/50 bg-gradient-to-t from-[#3B82F6]/20');
            return `
                <div class="w-24 sm:w-28 ${h} ${c} rounded-t-2xl flex flex-col items-center p-3 relative shadow-2xl border-t border-x bg-[#0F1624]">
                    ${pos===1?'<i class="fa-solid fa-crown absolute -top-5 text-[#F97316] text-xl drop-shadow-lg"></i>':''}
                    <div class="absolute -top-2.5 bg-[#080C14] border border-[#1A2335] w-5 h-5 rounded-full flex items-center justify-center font-black text-[0.45rem] z-10 text-white">${pos}</div>
                    <img src="${tm.shield||''}" class="w-10 h-10 mt-3 rounded bg-[#080C14] object-contain border border-[#1A2335] shadow">
                    <span class="font-bold text-[0.55rem] text-center w-full truncate mt-2 text-white">${tm.name||'Unknown'}</span>
                    <span class="text-xl font-black mt-auto text-white">${(tm.score||0).toFixed(1)} <span class="text-[0.45rem] text-[#94A3B8] font-normal uppercase">pts</span></span>
                </div>
            `;
        };

        const drawTridente = (perf, title, colorClass) => {
            if (!perf) return `<div class="w-full sm:w-40 h-28 rounded-2xl border border-dashed border-[#1A2335] flex items-center justify-center text-[0.45rem] font-bold text-[#94A3B8]">No data</div>`;
            const tm = t.teams.find(x => x.id === perf.p.tId) || { shield: '', name: 'Free' };
            return `
                <div class="w-full sm:w-40 bg-[#0F1624] border border-[#1A2335] rounded-2xl p-3 flex flex-col items-center relative overflow-hidden group hover:border-[#3B82F6] transition-colors">
                    <div class="absolute top-0 left-0 w-full h-1 ${colorClass} shadow-lg"></div>
                    <span class="text-[0.4rem] font-black text-[#94A3B8] uppercase tracking-widest mb-2">${title}</span>
                    <img src="${tm.shield||''}" class="w-8 h-8 rounded bg-[#080C14] object-contain border border-[#1A2335] mb-1 shadow">
                    <span class="font-bold text-xs text-white truncate w-full text-center">${perf.p.name||'Player'}</span>
                    <span class="text-2xl font-black ${colorClass} mt-0.5 drop-shadow-lg">${perf.val||0}</span>
                </div>
            `;
        };

        area.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <div class="glass-card p-4 rounded-3xl shadow-xl">
                    <h4 class="text-center text-[0.45rem] font-black text-[#F97316] uppercase tracking-widest mb-4">MVP of the Round ⭐</h4>
                    <div class="flex justify-center items-end gap-2 sm:gap-4 h-48">${UIController.buildPodium(bestPlayers,'imp','PTS')}</div>
                </div>
                <div class="glass-card p-4 rounded-3xl shadow-xl">
                    <h4 class="text-center text-[0.45rem] font-black text-[#3B82F6] uppercase tracking-widest mb-4">Team of the Round 🛡️</h4>
                    <div class="flex justify-center items-end gap-2 sm:gap-4 h-48">${drawTeamPodium(bestTeams[1],2)}${drawTeamPodium(bestTeams[0],1)}${drawTeamPodium(bestTeams[2],3)}</div>
                </div>
            </div>
            <div class="glass-card p-6 rounded-3xl shadow-xl">
                <h4 class="text-center text-xs font-black text-[#F97316] uppercase tracking-widest mb-5">The Dream Team 🔱</h4>
                <div class="flex flex-col md:flex-row justify-center items-center gap-4">
                    ${drawTridente(tridente.a,'VISION / ASSIST 🎯','text-[#8B5CF6]')}
                    ${drawTridente(tridente.g,'GOLDEN BOOT ⚽','text-[#3B82F6]')}
                    ${drawTridente(tridente.s,'WALL 🧤','text-[#F97316]')}
                </div>
            </div>
        `;
    },

    renderLeaderboard: (loadMore = false) => {
        const t = State.getT();
        if (!t) return;
        if (!loadMore) { UIController.leaderboardLimit = 10; } else UIController.leaderboardLimit += 10;
        const stats = Engine.getGlobalPlayerStats();
        const sorted = [...stats].sort((a, b) => (b.imp || 0) - (a.imp || 0));

        document.getElementById('leaderboard-podium').innerHTML = UIController.buildPodiumElite(sorted);

        const total = sorted.length;
        const limit = Math.min(UIController.leaderboardLimit, total);
        const visible = sorted.slice(3, limit);
        const hasMore = limit < total;

        const tiers = [];
        for (let i = 0; i < visible.length; i += 10) {
            tiers.push(visible.slice(i, i + 10));
        }

        let html = '';
        tiers.forEach((tier, idx) => {
            const start = idx * 10 + 4;
            const end = start + tier.length - 1;
            html += `<div class="tier-section"><div class="tier-header">Tier ${idx+1} (Positions ${start}-${end})</div><div class="tier-list">`;
            tier.forEach((p, i) => {
                const rank = start + i;
                const tm = t.teams.find(x => x.id === p.tId) || { shield: '', name: 'Free' };
                const pct = Math.min(100, ((p.imp || 0) / 100) * 100);
                let glow = rank <= 5 ? 'gold' : '';
                html += `
                    <div class="tier-item">
                        <div class="rank ${glow}">#${rank}</div>
                        <img src="${tm.shield||''}" class="avatar" />
                        <div class="info"><div class="name">${p.name||'Player'}</div><div class="team">${tm.name}</div></div>
                        <div class="stat-value">${(p.imp||0).toFixed(1)}</div>
                        <div class="ego-bar"><div class="fill" style="width:${pct}%"></div></div>
                    </div>
                `;
            });
            html += `</div></div>`;
        });

        if (hasMore) {
            html += `<div class="flex justify-center mt-4"><button class="btn-secondary" onclick="UIController.renderLeaderboard(true)"><i class="fa-solid fa-chevron-down mr-1"></i> Load more</button></div>`;
        }
        document.getElementById('leaderboard-list-container').innerHTML = html;
    },

    buildPodiumElite: (data) => {
        const drawP = (p, pos) => {
            if (!p) return `<div class="podium-item"><div class="avatar">?</div><div class="name">Empty</div><div class="score">0</div></div>`;
            const tm = State.getT().teams.find(x => x.id === p.tId) || { shield: '', name: 'Free' };
            const cls = pos === 1 ? 'first' : pos === 2 ? 'second' : 'third';
            return `
                <div class="podium-item ${cls}">
                    ${pos===1?'<div style="font-size:1.5rem;margin-bottom:0.25rem;">👑</div>':''}
                    <img src="${tm.shield||''}" class="avatar" />
                    <div class="name">${p.name||'Player'}</div>
                    <div class="score">${(p.imp||0).toFixed(1)}</div>
                </div>
            `;
        };
        return `${drawP(data[1],2)}${drawP(data[0],1)}${drawP(data[2],3)}`;
    },

    buildPodium: (data, key, suffix) => {
        const drawP = (p, pos) => {
            if (!p) return `<div class="w-20 h-20 bg-[#0F1624] rounded-t-2xl border-b border-[#1A2335] flex items-center justify-center text-[0.45rem] text-[#94A3B8] uppercase font-bold">Empty</div>`;
            const h = pos === 1 ? 'h-44' : 'h-36';
            const color = pos === 1 ? 'border-[#F97316]/50 bg-gradient-to-t from-[#F97316]/20' : (pos === 2 ? 'border-[#94A3B8]/50 bg-gradient-to-t from-[#94A3B8]/20' : 'border-[#3B82F6]/50 bg-gradient-to-t from-[#3B82F6]/20');
            const tm = State.getT().teams.find(x => x.id === p.tId) || { shield: '', name: 'Free' };
            return `
                <div class="w-24 sm:w-28 ${h} ${color} rounded-t-2xl flex flex-col items-center p-3 relative shadow-2xl border-t border-x bg-[#0F1624]">
                    ${pos===1?'<i class="fa-solid fa-crown absolute -top-5 text-[#F97316] text-xl drop-shadow-lg"></i>':''}
                    <div class="absolute -top-2.5 bg-[#080C14] border border-[#1A2335] w-5 h-5 rounded-full flex items-center justify-center font-black text-[0.45rem] z-10 text-white">${pos}</div>
                    <img src="${tm.shield||''}" class="w-10 h-10 mt-3 rounded bg-[#080C14] object-contain border border-[#1A2335] shadow">
                    <span class="font-bold text-[0.55rem] text-center w-full truncate mt-2 text-white">${p.name||'Player'}</span>
                    <span class="text-xl font-black mt-auto text-white">${key==='imp'?(p[key]||0).toFixed(1):(p[key]||0)} <span class="text-[0.45rem] text-[#94A3B8] font-normal uppercase">${suffix}</span></span>
                </div>
            `;
        };
        return `${drawP(data[1],2)}${drawP(data[0],1)}${drawP(data[2],3)}`;
    },

    // ===== MODALES COMPLETOS =====
    showModal: (type, param = null) => {
        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        let html = '';
        const t = State.getT();

        // ---- MODAL: CONFIG TABLE ----
        if (type === 'mod-config-table') {
            if (!t) return;
            const lig = t.tableConfig?.liguilla !== undefined ? t.tableConfig.liguilla : 8;
            const des = t.tableConfig?.descenso !== undefined ? t.tableConfig.descenso : 2;
            html = `
                <h3 class="text-2xl font-black mb-5 uppercase italic">Table <span class="text-[#3B82F6]">Settings</span></h3>
                <h4 class="text-[0.4rem] font-black text-[#3B82F6] mb-3 border-b border-[#1A2335] pb-2 uppercase tracking-widest">Manual Point Adjustment</h4>
                <p class="text-[0.45rem] text-[#94A3B8] mb-3 font-bold">Add/remove points (use negative numbers, e.g. -3).</p>
                <div class="space-y-1.5 mb-5 max-h-48 overflow-y-auto pr-2">
                    ${t.teams.map(tm => `
                        <div class="flex items-center justify-between bg-[#080C14] p-2 rounded border border-[#1A2335]">
                            <div class="flex items-center gap-3"><img src="${tm.shield}" class="w-6 h-6 rounded bg-[#080C14] object-contain"><span class="font-bold text-xs text-white uppercase">${tm.name}</span></div>
                            <div class="flex items-center gap-2"><span class="text-[0.35rem] text-[#94A3B8] font-bold uppercase">Adj:</span><input id="adj-pts-${tm.id}" type="number" value="${tm.penaltyPts||0}" class="w-16 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.45rem] py-1 font-bold outline-none focus:border-[#3B82F6] text-white"></div>
                        </div>
                    `).join('')}
                </div>
                <h4 class="text-[0.4rem] font-black text-[#3B82F6] mb-3 border-b border-[#1A2335] pb-2 uppercase tracking-widest">Status Lines (Visual Zones)</h4>
                <div class="flex gap-4 mb-5">
                    <div class="flex-1 bg-[#080C14] p-4 rounded-xl border border-[#1A2335]"><label class="text-[0.4rem] text-[#3B82F6] font-black uppercase tracking-widest block mb-1">Qualification (Blue)</label><input id="cfg-liguilla" type="number" min="0" value="${lig}" class="input-dark"></div>
                    <div class="flex-1 bg-[#080C14] p-4 rounded-xl border border-[#1A2335]"><label class="text-[0.4rem] text-[#F97316] font-black uppercase tracking-widest block mb-1">Relegation (Orange)</label><input id="cfg-descenso" type="number" min="0" value="${des}" class="input-dark"></div>
                </div>
                <div class="flex justify-end gap-3 pt-3 border-t border-[#1A2335]">
                    <button onclick="UIController.closeModal()" class="text-[0.55rem] font-bold text-[#94A3B8] hover:text-white transition-colors">Cancel</button>
                    <button onclick="App.saveTableConfig()" class="btn-primary text-[0.55rem]">Apply</button>
                </div>
            `;
            content.innerHTML = html;
            modal.style.display = 'flex';
            return;
        }

        // ---- MODAL: TEAM (ADD/EDIT) ----
        if (type === 'mod-team') {
            if (!t) return;
            const tm = param ? t.teams.find(x => x.id === param) : { name: '', shield: '', players: Array(12).fill({ id: Utils.generateId(), name: '' }) };
            html = `
                <h3 class="text-2xl font-black mb-5 uppercase italic">${param ? 'Manage' : 'Add'} <span class="text-[#3B82F6]">Club</span></h3>
                <div class="flex items-center gap-5 mb-5">
                    <div class="bg-[#080C14] p-3 rounded-xl border border-[#1A2335] text-center w-28 shrink-0">
                        <img id="prev-tm-shield" src="${tm.shield}" class="w-16 h-16 mx-auto rounded object-contain bg-[#080C14] border border-[#1A2335] mb-1">
                        <label class="cursor-pointer text-[0.4rem] font-bold text-[#94A3B8] hover:text-white block uppercase tracking-widest transition-colors">Upload Shield<input type="file" accept="image/*" onchange="Utils.handleImageUpload(this,(res)=>{document.getElementById('inp-tm-shield').value=res;document.getElementById('prev-tm-shield').src=res;})" class="hidden"></label>
                        <input type="hidden" id="inp-tm-shield" value="${tm.shield}">
                    </div>
                    <div class="flex-1"><input id="inp-tm-name" value="${tm.name}" placeholder="Club Name" type="text" class="input-dark text-xl font-black"></div>
                </div>
                <div class="mb-4 bg-[#0F1624] p-4 rounded-xl border border-[#1A2335]">
                    <h4 class="text-[0.4rem] font-black text-[#F97316] mb-3 border-b border-[#1A2335] pb-2 uppercase tracking-widest flex items-center gap-2"><i class="fa-solid fa-bolt"></i> Tactical DNA (Dynamic)</h4>
                    <div class="space-y-2.5">
                        <div><div class="flex justify-between text-[0.45rem] font-black"><span class="text-[#3B82F6]">Attack</span><span class="text-white">${tm.egoAtk||50} <span class="text-[#94A3B8]">/ 120</span></span></div><div class="w-full bg-[#080C14] rounded-full h-1.5 border border-[#1A2335] overflow-hidden"><div class="bg-[#3B82F6] h-1.5 rounded-full shadow-[0_0_8px_#3B82F6] transition-all duration-700" style="width:${Math.min(100,((tm.egoAtk||50)/120)*100)}%"></div></div></div>
                        <div><div class="flex justify-between text-[0.45rem] font-black"><span class="text-[#F97316]">Defense</span><span class="text-white">${tm.egoDef||50} <span class="text-[#94A3B8]">/ 120</span></span></div><div class="w-full bg-[#080C14] rounded-full h-1.5 border border-[#1A2335] overflow-hidden"><div class="bg-[#F97316] h-1.5 rounded-full shadow-[0_0_8px_#F97316] transition-all duration-700" style="width:${Math.min(100,((tm.egoDef||50)/120)*100)}%"></div></div></div>
                        <div><div class="flex justify-between text-[0.45rem] font-black"><span class="text-[#8B5CF6]">Global (GLB)</span><span class="text-white">${tm.egoGlb||50} <span class="text-[#94A3B8]">/ 120</span></span></div><div class="w-full bg-[#080C14] rounded-full h-1.5 border border-[#1A2335] overflow-hidden"><div class="bg-[#8B5CF6] h-1.5 rounded-full shadow-[0_0_8px_#8B5CF6] transition-all duration-700" style="width:${Math.min(100,((tm.egoGlb||50)/120)*100)}%"></div></div></div>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-[35vh] overflow-y-auto pr-2 mb-4" id="team-roster-container">
                    ${[0,6].map(offset => `
                        <div>
                            <h4 class="text-[0.4rem] font-black ${offset===0?'text-[#3B82F6]':'text-[#94A3B8]'} border-b border-[#1A2335] pb-2 mb-3 uppercase tracking-widest">${offset===0?'STARTERS & SUBS (1-6)':'DEEP RESERVES (7-12)'}</h4>
                            <div class="space-y-1.5 roster-sortable" data-offset="${offset}">
                                ${ROLES.slice(offset, offset+6).map((role,i)=>{
                                    const pIdx = offset+i;
                                    const p = tm.players[pIdx]||{id:Utils.generateId(),name:''};
                                    return `
                                        <div class="player-card group">
                                            <i class="fa-solid fa-grip-lines text-[#94A3B8] cursor-grab hover:text-white pl-0.5"></i>
                                            <span class="role-badge ${role.cls} text-[0.4rem]">${role.label}</span>
                                            <input type="hidden" class="p-id" id="p-id-${pIdx}" value="${p.id||Utils.generateId()}">
                                            <input type="text" class="p-name flex-1 bg-[#080C14] border border-[#1A2335] rounded p-1 text-[0.55rem] font-bold outline-none focus:border-[#3B82F6] text-white" id="p-name-${pIdx}" value="${p.name}" placeholder="Name...">
                                            <button onclick="if(confirm('Delete this player? Stats will be lost.')){document.getElementById('p-name-${pIdx}').value='';document.getElementById('p-id-${pIdx}').value=Utils.generateId();}" class="w-5 h-5 flex items-center justify-center text-[#94A3B8] hover:text-[#F97316] bg-[#1A2335] rounded opacity-0 group-hover:opacity-100 transition-all"><i class="fa-solid fa-xmark"></i></button>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="flex justify-between items-center pt-3 border-t border-[#1A2335]">
                    ${param?`<button onclick="App.deleteTeam('${param}')" class="text-[0.45rem] font-bold text-[#F97316] hover:text-[#EA580C] bg-[#F97316]/10 px-3 py-1.5 rounded transition-colors"><i class="fa-solid fa-trash mr-1"></i> Delete</button>`:'<div></div>'}
                    <div class="flex gap-3">
                        <button onclick="UIController.closeModal()" class="text-[0.55rem] font-bold text-[#94A3B8] hover:text-white transition-colors">Cancel</button>
                        <button onclick="App.saveTeam('${param||''}')" class="btn-primary text-[0.55rem]">Save DNA</button>
                    </div>
                </div>
            `;
            content.innerHTML = html;
            modal.style.display = 'flex';
            // Re-init sortable for roster
            if (document.querySelectorAll('.roster-sortable').length) {
                if (UIController.activeModalSortables) UIController.activeModalSortables.forEach(s => s.destroy());
                UIController.activeModalSortables = [];
                document.querySelectorAll('.roster-sortable').forEach(el => {
                    let s = new Sortable(el, {
                        group: 'shared-roster',
                        animation: 150,
                        handle: '.fa-grip-lines',
                        onEnd: () => {
                            const allSlots = document.querySelectorAll('.roster-slot');
                            allSlots.forEach((slot, idx) => {
                                const roleLabel = slot.querySelector('.role-badge');
                                roleLabel.className = `role-badge ${ROLES[idx].cls} text-[0.4rem]`;
                                roleLabel.innerText = ROLES[idx].label;
                                const inputId = slot.querySelector('.p-id');
                                const inputName = slot.querySelector('.p-name');
                                const btnX = slot.querySelector('button');
                                inputId.id = `p-id-${idx}`;
                                inputName.id = `p-name-${idx}`;
                                btnX.setAttribute('onclick', `if(confirm('Delete this player? Stats will be lost.')){document.getElementById('p-name-${idx}').value='';document.getElementById('p-id-${idx}').value=Utils.generateId();}`);
                            });
                        }
                    });
                    UIController.activeModalSortables.push(s);
                });
            }
            return;
        }

        // ---- MODAL: REPORT MATCH ----
        if (type === 'mod-report') {
            if (!t) return;
            let m;
            if (param && param.isPlayoff) {
                m = t.playoffs.rounds[param.r][param.i];
            } else {
                m = t.rounds[State.currentRoundIdx].find(x => x.id === (typeof param === 'string' ? param : param?.mId));
            }
            if (!m) { alert('Match not found.'); return; }
            const h = t.teams.find(x => x.id === m.h);
            const a = t.teams.find(x => x.id === m.a);
            if (!h || !a) { alert('Teams not found.'); return; }
            const getVal = (pId, k) => {
                const s = m.stats?.find(x => x.pId === pId);
                return s ? s[k] : '';
            };
            const renderTeamInputs = (tm, isHome) => `
                <div class="flex-1 bg-[#080C14] border border-[#1A2335] rounded-xl p-3">
                    <div class="flex items-center gap-3 mb-3 pb-2 border-b border-[#1A2335]">
                        <img src="${tm.shield}" class="w-8 h-8 rounded bg-[#080C14] object-contain">
                        <span class="font-black uppercase text-sm">${tm.name}</span>
                    </div>
                    <div class="grid grid-cols-12 gap-1 mb-1 px-1 text-[0.35rem] font-black text-[#94A3B8] tracking-widest">
                        <div class="col-span-6">PLAYER</div>
                        <div class="col-span-2 text-center text-[#3B82F6]">G</div>
                        <div class="col-span-2 text-center text-[#8B5CF6]">A</div>
                        <div class="col-span-2 text-center text-[#F97316]">S</div>
                    </div>
                    <div class="space-y-1 mb-2">
                        ${tm.players.slice(0,3).map((p,i)=>p.name?`
                        <div class="grid grid-cols-12 gap-1 items-center bg-[#0F1624] p-1 rounded border border-[#1A2335]">
                            <div class="col-span-6 truncate px-1 text-[0.45rem] font-bold text-white"><span class="text-[0.35rem] uppercase block ${ROLES[i].cls}">${ROLES[i].label}</span>${p.name}</div>
                            <input id="pg-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'g')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.45rem] py-1 font-bold outline-none focus:border-[#3B82F6] text-white">
                            <input id="pa-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'a')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.45rem] py-1 font-bold outline-none focus:border-[#8B5CF6] text-white">
                            <input id="ps-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'s')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.45rem] py-1 font-bold outline-none focus:border-[#F97316] text-white">
                        </div>`:'').join('')}
                    </div>
                    <button onclick="document.getElementById('bench-${tm.id}-${m.id}').classList.toggle('hidden')" class="w-full text-[0.4rem] font-black text-[#3B82F6] uppercase tracking-widest bg-[#1A2335] py-1 rounded hover:bg-[#334155] border border-[#1A2335] mb-1 transition-colors">↕ Expand Bench (3)</button>
                    <div id="bench-${tm.id}-${m.id}" class="space-y-1 mt-1 mb-2 hidden">
                        ${tm.players.slice(3,6).map((p,i)=>p.name?`
                        <div class="grid grid-cols-12 gap-1 items-center bg-[#080C14] p-1 rounded border border-[#1A2335]">
                            <div class="col-span-6 truncate px-1 text-[0.4rem] font-bold text-[#94A3B8]"><span class="text-[0.35rem] uppercase block ${ROLES[i+3].cls}">${ROLES[i+3].label}</span>${p.name}</div>
                            <input id="pg-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'g')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.4rem] py-1 font-bold outline-none focus:border-[#3B82F6] text-[#94A3B8]">
                            <input id="pa-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'a')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.4rem] py-1 font-bold outline-none focus:border-[#8B5CF6] text-[#94A3B8]">
                            <input id="ps-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'s')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.4rem] py-1 font-bold outline-none focus:border-[#F97316] text-[#94A3B8]">
                        </div>`:'').join('')}
                    </div>
                    <button onclick="document.getElementById('reserves-${tm.id}-${m.id}').classList.toggle('hidden')" class="w-full text-[0.4rem] font-black text-[#94A3B8] uppercase tracking-widest bg-[#080C14] py-1 rounded hover:bg-[#1A2335] border border-[#1A2335] transition-colors">↕ Expand Reserves (6)</button>
                    <div id="reserves-${tm.id}-${m.id}" class="space-y-1 mt-1 hidden">
                        ${tm.players.slice(6,12).map((p,i)=>p.name?`
                        <div class="grid grid-cols-12 gap-1 items-center bg-[#080C14] p-1 rounded border border-[#1A2335]">
                            <div class="col-span-6 truncate px-1 text-[0.4rem] font-bold text-[#94A3B8]"><span class="text-[0.35rem] uppercase block ${ROLES[i+6].cls}">${ROLES[i+6].label}</span>${p.name}</div>
                            <input id="pg-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'g')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.4rem] py-1 font-bold outline-none focus:border-[#3B82F6] text-[#94A3B8]">
                            <input id="pa-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'a')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.4rem] py-1 font-bold outline-none focus:border-[#8B5CF6] text-[#94A3B8]">
                            <input id="ps-${m.id}-${p.id}" type="number" min="0" value="${getVal(p.id,'s')}" class="col-span-2 bg-[#080C14] border border-[#1A2335] rounded text-center text-[0.4rem] py-1 font-bold outline-none focus:border-[#F97316] text-[#94A3B8]">
                        </div>`:'').join('')}
                    </div>
                </div>
            `;
            html = `
                <h3 class="text-2xl font-black mb-5 uppercase italic text-center">${m.played?'<span class="text-[#F97316]">EDIT DEEP‑DATA</span>':'REPORT <span class="text-[#3B82F6]">DEEP‑DATA</span>'}</h3>
                ${param.isPlayoff?`<p class="text-center text-[0.4rem] text-[#F97316] font-bold mb-3 uppercase tracking-widest bg-[#F97316]/10 py-1.5 rounded border border-[#F97316]/30">⚠️ Playoffs must have a winner (report tie‑breaker here)</p>`:''}
                <div class="flex flex-col md:flex-row gap-3 mb-4">${renderTeamInputs(h,true)}${renderTeamInputs(a,false)}</div>
                <div class="flex justify-end gap-3 pt-3 border-t border-[#1A2335]">
                    <button onclick="UIController.closeModal()" class="text-[0.55rem] font-bold text-[#94A3B8] hover:text-white transition-colors">Cancel</button>
                    <button onclick="App.saveMatchReport('${m.id}',${param.isPlayoff||false},${param.isPlayoff?`{r:${param.r},i:${param.i}}`:'null'})" class="btn-primary text-[0.55rem] bg-[#3B82F6] hover:bg-[#2563EB]">Process Data</button>
                </div>
            `;
            content.innerHTML = html;
            modal.style.display = 'flex';
            return;
        }

        // ---- MODAL: TOURNAMENT (CREATE/EDIT) ----
        if (type === 'mod-tour') {
            const tour = param ? State.data.tournaments.find(x => x.id === param) : null;
            const isEdit = !!tour;
            const tourData = tour || { name: '', logo: '', format: 'robin', doubleRound: false, numGroups: 2 };
            
            html = `
                <h3 class="text-2xl font-black mb-5 uppercase italic">
                    ${isEdit ? 'Editar' : 'Crear'} <span class="text-[#3B82F6]">Torneo</span>
                </h3>
                <div class="space-y-4 mb-5">
                    <!-- Nombre -->
                    <div>
                        <label class="text-[0.45rem] font-black text-[#94A3B8] uppercase tracking-widest">Nombre Oficial</label>
                        <input id="inp-tour-name" type="text" value="${tourData.name}" class="input-dark mt-1" placeholder="Ej: Liga Pro 2024" />
                    </div>
                    
                    <!-- Logo -->
                    <div>
                        <label class="text-[0.45rem] font-black text-[#94A3B8] uppercase tracking-widest">Logo</label>
                        <div class="flex items-center gap-3 mt-1 bg-[#080C14] p-3 rounded-xl border border-[#1A2335]">
                            <img id="prev-tour-logo" src="${tourData.logo}" class="w-12 h-12 rounded bg-[#080C14] object-contain border border-[#1A2335]" />
                            <label class="cursor-pointer bg-[#1A2335] hover:bg-[#334155] px-3 py-1.5 rounded-lg text-[0.55rem] font-bold text-white transition-colors">
                                <i class="fa-solid fa-upload mr-1"></i> Seleccionar
                                <input type="file" accept="image/*" onchange="Utils.handleImageUpload(this, function(res) { 
                                    document.getElementById('inp-tour-logo').value = res; 
                                    document.getElementById('prev-tour-logo').src = res; 
                                })" class="hidden" />
                            </label>
                            <input type="hidden" id="inp-tour-logo" value="${tourData.logo}" />
                        </div>
                    </div>
                    
                    <!-- Formato -->
                    <div>
                        <label class="text-[0.45rem] font-black text-[#94A3B8] uppercase tracking-widest">Formato</label>
                        <select id="inp-tour-format" onchange="document.getElementById('opt-groups').classList.toggle('hidden', this.value !== 'groups'); document.getElementById('opt-robin').classList.toggle('hidden', this.value === 'groups')" class="input-dark">
                            <option value="robin" ${tourData.format === 'robin' ? 'selected' : ''}>Round Robin (Liga)</option>
                            <option value="groups" ${tourData.format === 'groups' ? 'selected' : ''}>Fase de Grupos (Mundial)</option>
                        </select>
                    </div>
                    
                    <!-- Opciones para Round Robin -->
                    <div id="opt-robin" class="${tourData.format === 'groups' ? 'hidden' : 'mt-2'}">
                        <label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#94A3B8]">
                            <input type="checkbox" id="inp-tour-double" ${tourData.doubleRound ? 'checked' : ''} class="w-4 h-4 accent-[#3B82F6] bg-[#080C14] border-[#1A2335] rounded" /> 
                            Doble Ronda (Ida y Vuelta)
                        </label>
                    </div>
                    
                    <!-- Opciones para Grupos -->
                    <div id="opt-groups" class="${tourData.format !== 'groups' ? 'hidden' : 'mt-2'}">
                        <label class="text-[0.45rem] font-black text-[#94A3B8] uppercase tracking-widest block mb-1">Número de Grupos</label>
                        <select id="inp-tour-numgroups" class="input-dark">
                            <option value="2" ${tourData.numGroups == 2 ? 'selected' : ''}>2 Grupos</option>
                            <option value="4" ${tourData.numGroups == 4 ? 'selected' : ''}>4 Grupos</option>
                            <option value="8" ${tourData.numGroups == 8 ? 'selected' : ''}>8 Grupos</option>
                        </select>
                        <p class="text-[0.4rem] text-[#94A3B8] mt-2"><i class="fa-solid fa-circle-info"></i> Podrás distribuir manualmente los equipos antes de generar el fixture.</p>
                    </div>
                </div>
                
                <div class="flex justify-end gap-3 pt-4 border-t border-[#1A2335]">
                    <button onclick="UIController.closeModal()" class="text-[0.55rem] font-bold text-[#94A3B8] hover:text-white transition-colors">Cancelar</button>
                    <button onclick="App.saveTour('${param || ''}')" class="btn-primary text-[0.55rem]">Guardar</button>
                </div>
            `;
            content.innerHTML = html;
            modal.style.display = 'flex';
            return;
        }

        // ---- MODAL: GROUP MANAGEMENT ----
        if (type === 'mod-group') {
            if (!t) return;
            const groupTeams = t.teams.filter(x => x.group === param);
            html = `
                <h3 class="text-2xl font-black mb-5 uppercase italic">
                    Gestionar <span class="text-[#3B82F6]">GRUPO ${param}</span>
                </h3>
                <div class="space-y-3 mb-5">
                    ${groupTeams.map(tm => `
                        <div class="flex items-center justify-between bg-[#080C14] p-3 rounded-xl border border-[#1A2335]">
                            <div class="flex items-center gap-3">
                                <img src="${tm.shield}" class="w-8 h-8 rounded bg-[#080C14] object-contain border border-[#1A2335]" />
                                <span class="font-bold text-sm text-white uppercase">${tm.name}</span>
                            </div>
                            <button onclick="UIController.showModal('mod-team','${tm.id}')" class="bg-[#1A2335] hover:bg-[#334155] px-3 py-1.5 rounded-lg text-[0.55rem] font-bold text-white transition-colors">
                                <i class="fa-solid fa-pen mr-1"></i> Editar Plantilla
                            </button>
                        </div>
                    `).join('')}
                </div>
                <div class="flex justify-end">
                    <button onclick="UIController.closeModal()" class="btn-secondary text-[0.55rem]">Cerrar</button>
                </div>
            `;
            content.innerHTML = html;
            modal.style.display = 'flex';
            return;
        }

        // ---- FALLBACK (por si acaso) ----
        content.innerHTML = `<h3 class="text-xl font-black mb-4">${type}</h3><p class="text-[#94A3B8]">Modal content for ${type}</p><button class="btn-primary mt-4" onclick="UIController.closeModal()">Close</button>`;
        modal.style.display = 'flex';
    },

    closeModal: () => {
        document.getElementById('modal-overlay').style.display = 'none';
        if (UIController.activeModalSortables) { UIController.activeModalSortables.forEach(s => s.destroy()); UIController.activeModalSortables = []; }
    },

    simulatePredictionPopup: (mId, isPlayoff, playoffPath) => {
        const t = State.getT();
        if (!t) return;
        let m = isPlayoff ? t.playoffs.rounds[playoffPath.r][playoffPath.i] : t.rounds[State.currentRoundIdx].find(x => x.id === mId);
        if (!m) return;
        const h = t.teams.find(x => x.id === m.h);
        const a = t.teams.find(x => x.id === m.a);
        if (!h || !a) return;
        const sim = Engine.simulateMatchStats(m.h, m.a);
        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        let html = `
            <h3 class="text-xl font-black mb-4">Prediction</h3>
            <div class="flex justify-between items-center bg-[#080C14] p-4 rounded-xl border border-[#1A2335]">
                <div><img src="${h.shield}" class="w-12 h-12 rounded-full" /><div class="font-bold">${h.name}</div></div>
                <div class="text-2xl font-black">${sim.sH} - ${sim.sA}</div>
                <div><img src="${a.shield}" class="w-12 h-12 rounded-full" /><div class="font-bold">${a.name}</div></div>
            </div>
            <div class="flex justify-end gap-3 mt-4">
                <button onclick="UIController.closeModal()" class="btn-secondary">Cancel</button>
                <button id="btn-commit-sim" class="btn-primary">Confirm</button>
            </div>
        `;
        content.innerHTML = html;
        modal.style.display = 'flex';
        document.getElementById('btn-commit-sim').onclick = () => {
            if (isPlayoff && sim.sH === sim.sA) { alert('Playoffs must have a winner.'); return; }
            m.stats = sim.stats; m.sH = sim.sH; m.sA = sim.sA; m.played = true;
            sim.stats.forEach(st => {
                const player = t.teams.flatMap(tm => tm.players).find(p => p.id === st.pId);
                if (player) {
                    const efectivity = st.shots > 0 ? (st.g / st.shots) * 100 : 0;
                    st.efectivity = efectivity;
                    player.efectivity = efectivity;
                    if (typeof Economy !== 'undefined') Economy.updatePlayerValue(player);
                }
            });
            if (isPlayoff && m.nextR !== undefined) {
                const winId = m.sH > m.sA ? m.h : m.a;
                t.playoffs.rounds[m.nextR][Math.floor(playoffPath.i / 2)][m.nextSide] = winId;
            }
            State.saveData();
            UIController.closeModal();
            if (isPlayoff) UIController.renderPlayoffs();
            else UIController.renderSchedule();
        };
    }
};

// --- APP ---
const App = {
    init: async () => {
        State.data = await Storage.load();
        UIController.init();
        App.initChart();
        if (!State.currentTournamentId) {
            UIController.switchView('dashboard');
        } else {
            UIController.switchView('performance');
            App.renderPerformance();
        }
        document.getElementById('btn-export').addEventListener('click', () => App.exportTournament());
    },

    initChart: () => {
        const canvas = document.getElementById('perf-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        State.perfChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94A3B8', font: { size: 9, weight: 'bold' }, boxWidth: 10, padding: 8 } },
                    tooltip: { backgroundColor: '#0F1624', borderColor: '#1A2335', borderWidth: 1, titleColor: '#F1F5F9', bodyColor: '#94A3B8', cornerRadius: 8, padding: 8 }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#1A2335' }, ticks: { color: '#94A3B8', font: { size: 8 } } },
                    x: { grid: { color: '#1A2335' }, ticks: { color: '#94A3B8', font: { size: 8 } } }
                },
                elements: { line: { tension: 0.2, borderWidth: 2.5 }, point: { radius: 3, hoverRadius: 5 } }
            }
        });
    },

    renderPerformance: () => {
        const t = State.getT();
        if (!t) return;
        const stats = Engine.getGlobalPlayerStats();
        const sorted = [...stats].sort((a, b) => (b.imp || 0) - (a.imp || 0));
        const list = document.getElementById('perf-player-list');
        if (sorted.length === 0) {
            list.innerHTML = '<div class="text-[#94A3B8] text-xs font-medium text-center py-4">No players with stats yet.</div>';
            return;
        }
        if (!State.selectedPerfPlayer || !sorted.find(p => p.id === State.selectedPerfPlayer)) {
            State.selectedPerfPlayer = sorted[0]?.id || null;
        }
        list.innerHTML = sorted.map(p => {
            const tm = t.teams.find(x => x.id === p.tId);
            return `
                <div class="perf-player-item ${p.id === State.selectedPerfPlayer ? 'active' : ''}" onclick="App.selectPerfPlayer('${p.id}')">
                    <div class="player-info">
                        <img src="${tm?.shield||''}" />
                        <span class="name">${p.name||'Unknown'}</span>
                        <span class="team">${tm?.name||'Free'}</span>
                    </div>
                    <div class="ego">${(p.imp||0).toFixed(1)}</div>
                </div>
            `;
        }).join('');
        App.updatePerfChart();
    },

    selectPerfPlayer: (playerId) => {
        State.selectedPerfPlayer = playerId;
        App.renderPerformance();
    },

    updatePerfChart: () => {
        const t = State.getT();
        if (!t || !State.perfChart) return;
        const playerId = State.selectedPerfPlayer;
        if (!playerId) {
            State.perfChart.data = { labels: [], datasets: [] };
            State.perfChart.update();
            document.getElementById('perf-player-name').textContent = 'Select a player';
            document.getElementById('perf-player-ego').textContent = 'EGO: —';
            return;
        }
        const roundStats = Engine.getPlayerRoundStats(playerId);
        const player = Engine.getGlobalPlayerStats().find(p => p.id === playerId);
        if (!player) return;
        document.getElementById('perf-player-name').textContent = player.name || 'Unknown';
        document.getElementById('perf-player-ego').textContent = `EGO: ${(player.imp||0).toFixed(1)}`;
        const labels = roundStats.map(r => `R${r.round}`);
        const datasets = [];
        const colors = {
            goals: { label: 'Goals', color: '#3B82F6' },
            assists: { label: 'Assists', color: '#8B5CF6' },
            saves: { label: 'Saves', color: '#F97316' },
            ego: { label: 'EGO', color: '#F1F5F9' }
        };
        Object.keys(State.perfMetrics).forEach(key => {
            if (State.perfMetrics[key]) {
                const data = roundStats.map(r => r[key] || 0);
                const c = colors[key];
                datasets.push({
                    label: c.label,
                    data: data,
                    borderColor: c.color,
                    backgroundColor: c.color + '22',
                    borderWidth: 2.5,
                    pointBackgroundColor: c.color,
                    pointBorderColor: '#080C14',
                    pointBorderWidth: 1.5,
                    tension: 0.2,
                    fill: true
                });
            }
        });
        State.perfChart.data = { labels, datasets };
        State.perfChart.update();
    },

    toggleEGO: () => {
        State.showEGO = !State.showEGO;
        const btn = document.getElementById('btn-toggle-ego');
        if (btn) {
            btn.textContent = State.showEGO ? 'Hide EGO' : 'Show EGO';
            btn.classList.toggle('active', State.showEGO);
        }
        if (document.getElementById('view-clubs').classList.contains('active')) UIController.renderClubs();
    },

    exportTournament: () => {
        const t = State.getT();
        if (!t) return alert('Enter a tournament first.');
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(t));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = t.name.replace(/\s+/g, '_') + '_backup.json';
        a.click();
    },

    importTournament: (input) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!imported || typeof imported !== 'object' || !imported.id || !imported.name || !Array.isArray(imported.teams))
                    throw new Error('Invalid file structure.');
                imported.teams.forEach(tm => {
                    if (typeof tm.id !== 'string' || typeof tm.name !== 'string' || !Array.isArray(tm.players))
                        throw new Error('Corrupt team data.');
                    if (tm.atk !== undefined) { tm.egoAtk = tm.atk; delete tm.atk; }
                    if (tm.def !== undefined) { tm.egoDef = tm.def; delete tm.def; }
                    if (tm.glb !== undefined) { tm.egoGlb = tm.glb; delete tm.glb; }
                    if (tm.money === undefined) tm.money = 1000000;
                    tm.players.forEach(p => {
                        if (p.value === undefined) p.value = 50000 + Math.floor(Math.random() * 100000);
                        if (p.loan === undefined) p.loan = null;
                        if (p.efectivity === undefined) p.efectivity = 0;
                    });
                });
                const existing = State.data.tournaments.findIndex(x => x.id === imported.id);
                if (existing >= 0) {
                    if (confirm('Tournament already exists. Overwrite?')) {
                        State.data.tournaments[existing] = imported;
                    } else {
                        imported.id = Utils.generateId();
                        State.data.tournaments.push(imported);
                    }
                } else {
                    State.data.tournaments.push(imported);
                }
                State.saveData();
                UIController.renderDashboard();
                alert(`✅ "${imported.name}" imported successfully.`);
            } catch (err) {
                alert('❌ Import failed: ' + err.message);
            }
            input.value = '';
        };
        reader.readAsText(file);
    },

    saveTour: (id) => {
        const name = Utils.sanitize(document.getElementById('inp-tour-name').value);
        const logo = document.getElementById('inp-tour-logo').value;
        const format = document.getElementById('inp-tour-format').value;
        const doubleRound = document.getElementById('inp-tour-double')?.checked || false;
        const numGroups = parseInt(document.getElementById('inp-tour-numgroups')?.value) || 2;
        if (!name) return alert('El nombre es obligatorio.');
        
        if (id) {
            let t = State.data.tournaments.find(x => x.id === id);
            t.name = name;
            t.logo = logo;
            t.format = format;
            t.doubleRound = doubleRound;
            t.numGroups = numGroups;
            if (State.currentTournamentId === id) {
                document.getElementById('header-name').innerText = name;
                document.getElementById('header-logo').src = logo;
            }
        } else {
            State.data.tournaments.push({ id: Utils.generateId(), name, logo, format, doubleRound, numGroups, teams: [], rounds: [], playoffs: null, tableConfig: { liguilla: 8, descenso: 2 } });
        }
        State.saveData();
        UIController.closeModal();
        UIController.renderDashboard();
    },

    deleteTournament: (id) => {
        if (confirm('¿Eliminar torneo?')) {
            State.data.tournaments = State.data.tournaments.filter(t => t.id !== id);
            State.saveData();
            UIController.renderDashboard();
        }
    },

    enterTournament: (id) => {
        const t = State.data.tournaments.find(x => x.id === id);
        if (!t) return;
        State.currentTournamentId = id;
        State.currentRoundIdx = 0;
        document.getElementById('header-info').style.display = 'flex';
        document.getElementById('header-name').textContent = t.name;
        document.getElementById('header-logo').src = t.logo;
        document.getElementById('btn-export').style.display = 'inline-block';
        document.getElementById('btn-exit').style.display = 'inline-block';
        document.getElementById('btn-toggle-ego').style.display = 'inline-block';
        UIController.updateNav();
        UIController.switchView('performance');
        App.renderPerformance();
    },

    exitTournament: () => {
        State.currentTournamentId = null;
        State.selectedPerfPlayer = null;
        document.getElementById('header-info').style.display = 'none';
        document.getElementById('btn-export').style.display = 'none';
        document.getElementById('btn-exit').style.display = 'none';
        document.getElementById('btn-toggle-ego').style.display = 'none';
        UIController.updateNav();
        UIController.renderDashboard();
    },

    saveTeam: (id) => {
        const t = State.getT();
        if (!t) return;
        const name = Utils.sanitize(document.getElementById('inp-tm-name').value);
        const shield = document.getElementById('inp-tm-shield').value;
        if (!name) return alert('Name required.');
        let players = [];
        for (let i = 0; i < 12; i++) {
            const pId = document.getElementById(`p-id-${i}`).value;
            const pName = Utils.sanitize(document.getElementById(`p-name-${i}`).value.trim());
            players.push({ id: pId || Utils.generateId(), name: pName, value: 50000 + Math.floor(Math.random() * 100000), loan: null, efectivity: 0 });
        }
        if (id) {
            let tm = t.teams.find(x => x.id === id);
            tm.name = name;
            tm.shield = shield;
            tm.players = players;
        } else {
            let assignedGroup = 'A';
            if (t.format === 'groups' && t.numGroups) {
                const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, t.numGroups);
                let counts = {};
                groupNames.forEach(g => counts[g] = 0);
                t.teams.forEach(tm => { if (counts[tm.group] !== undefined) counts[tm.group]++; });
                assignedGroup = groupNames.reduce((a, b) => counts[a] <= counts[b] ? a : b);
            }
            t.teams.push({ id: Utils.generateId(), name, shield, players, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, penaltyPts: 0, group: assignedGroup, egoAtk: 50, egoDef: 50, egoGlb: 50, money: 1000000 });
        }
        State.saveData();
        UIController.closeModal();
        Engine.calcStandings();
        UIController.renderClubs();
        App.renderPerformance();
        if (typeof Economy !== 'undefined') Economy.render();
    },

    deleteTeam: (id) => {
        if (confirm('Delete club?')) {
            const t = State.getT();
            if (t) {
                t.teams = t.teams.filter(x => x.id !== id);
                State.saveData();
                UIController.closeModal();
                UIController.renderClubs();
                App.renderPerformance();
                if (typeof Economy !== 'undefined') Economy.render();
            }
        }
    },

    saveTableConfig: () => {
        const t = State.getT();
        if (!t) return;
        const lig = parseInt(document.getElementById('cfg-liguilla').value) || 0;
        const des = parseInt(document.getElementById('cfg-descenso').value) || 0;
        if (t.format === 'robin' && lig + des >= t.teams.length && t.teams.length > 0) {
            alert('⚠️ Sum of qualifiers and relegations must leave at least one neutral team.');
            return;
        }
        t.tableConfig = { liguilla: lig, descenso: des };
        t.teams.forEach(tm => {
            tm.penaltyPts = parseInt(document.getElementById(`adj-pts-${tm.id}`).value) || 0;
        });
        State.saveData();
        UIController.closeModal();
        Engine.calcStandings();
        UIController.renderClubs();
    },

    generateFixture: () => {
        console.log('[App] generateFixture llamado');
        const result = Engine.generateRoundRobin();
        console.log('[App] Resultado de generateRoundRobin:', result);
        
        if (result) {
            State.saveData();
            console.log('[App] Datos guardados');
            // Actualizar vistas
            UIController.renderSchedule();
            UIController.renderClubs();
            console.log('[App] Vistas actualizadas');
        } else {
            alert('No se pudo generar el fixture. Asegúrate de tener al menos 2 equipos.');
        }
    },

    changeRound: (dir) => {
        const t = State.getT();
        if (!t) return;
        const next = State.currentRoundIdx + dir;
        if (next >= 0 && next < t.rounds.length) {
            State.currentRoundIdx = next;
            UIController.renderSchedule();
        }
    },

    dragMemory: null,
    dragTeam: (e, mId, side) => {
        App.dragMemory = { mId, side };
        e.dataTransfer.effectAllowed = 'move';
    },
    dropTeam: (e, targetMId, targetSide) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        if (!App.dragMemory) return;
        const t = State.getT();
        if (!t) return;
        const round = t.rounds[State.currentRoundIdx];
        let m1 = round.find(x => x.id === App.dragMemory.mId);
        let m2 = round.find(x => x.id === targetMId);
        if (!m1 || !m2) return;
        let temp = m1[App.dragMemory.side];
        m1[App.dragMemory.side] = m2[targetSide];
        m2[targetSide] = temp;
        App.dragMemory = null;
        State.saveData();
        UIController.renderSchedule();
    },

    saveMatchReport: (mId, isPlayoff, playoffPath) => {
        const res = Engine.processMatchStats(mId, isPlayoff, playoffPath);
        if (res.error) return alert(res.error);
        State.saveData();
        UIController.closeModal();
        if (isPlayoff) UIController.renderPlayoffs();
        else UIController.renderSchedule();
        App.renderPerformance();
        if (typeof Economy !== 'undefined') Economy.render();
    },

    generatePlayoffs: () => {
        const t = State.getT();
        if (!t) return;
        const f = parseInt(document.getElementById('sel-playoff-format').value);
        Engine.calcStandings();
        let top = [];
        if (t.format === 'groups') {
            let grouped = {};
            t.teams.forEach(tm => {
                let g = tm.group || 'A';
                if (!grouped[g]) grouped[g] = [];
                grouped[g].push(tm);
            });
            Object.keys(grouped).sort().forEach(g => {
                top.push(...grouped[g].slice(0, 2));
            });
            if (top.length < f) {
                let flatRest = t.teams.filter(x => !top.includes(x));
                top.push(...flatRest.slice(0, f - top.length));
            }
            top = top.slice(0, f);
        } else {
            top = [...t.teams].slice(0, f);
        }
        let r = [];
        if (f === 8) {
            r.push([
                { id: Utils.generateId(), h: top[0]?.id, a: top[7]?.id, sH: 0, sA: 0, played: false, stats: [], nextR: 1, nextSide: 'h' },
                { id: Utils.generateId(), h: top[3]?.id, a: top[4]?.id, sH: 0, sA: 0, played: false, stats: [], nextR: 1, nextSide: 'a' },
                { id: Utils.generateId(), h: top[1]?.id, a: top[6]?.id, sH: 0, sA: 0, played: false, stats: [], nextR: 1, nextSide: 'h' },
                { id: Utils.generateId(), h: top[2]?.id, a: top[5]?.id, sH: 0, sA: 0, played: false, stats: [], nextR: 1, nextSide: 'a' }
            ]);
            r.push([
                { id: Utils.generateId(), h: null, a: null, sH: 0, sA: 0, played: false, stats: [], nextR: 2, nextSide: 'h' },
                { id: Utils.generateId(), h: null, a: null, sH: 0, sA: 0, played: false, stats: [], nextR: 2, nextSide: 'a' }
            ]);
            r.push([{ id: Utils.generateId(), h: null, a: null, sH: 0, sA: 0, played: false, stats: [] }]);
        } else if (f === 4) {
            r.push([
                { id: Utils.generateId(), h: top[0]?.id, a: top[3]?.id, sH: 0, sA: 0, played: false, stats: [], nextR: 1, nextSide: 'h' },
                { id: Utils.generateId(), h: top[1]?.id, a: top[2]?.id, sH: 0, sA: 0, played: false, stats: [], nextR: 1, nextSide: 'a' }
            ]);
            r.push([{ id: Utils.generateId(), h: null, a: null, sH: 0, sA: 0, played: false, stats: [] }]);
        } else {
            r.push([{ id: Utils.generateId(), h: top[0]?.id, a: top[1]?.id, sH: 0, sA: 0, played: false, stats: [] }]);
        }
        t.playoffs = { format: f, rounds: r };
        State.saveData();
        UIController.renderPlayoffs();
    }
};

document.addEventListener('DOMContentLoaded', App.init);