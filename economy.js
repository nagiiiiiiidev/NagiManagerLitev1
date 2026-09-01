// ================================================================
//  NAGI RL MANAGER LITE v1  –  ECONOMY MODULE
//  Manages money, transfers, loans, and market.
// ================================================================

const Economy = {
    render: () => {
        const t = State.getT();
        const container = document.getElementById('economy-container');
        if (!t || !t.teams || t.teams.length === 0) {
            container.innerHTML = '<div class="glass-card p-6 text-center"><p class="text-[#94A3B8]">No teams available.</p></div>';
            return;
        }
        let html = '';
        t.teams.forEach(tm => {
            html += `
                <div class="economy-club">
                    <div class="club-header">
                        <div class="club-name">
                            <img src="${tm.shield||''}" />
                            <span>${tm.name}</span>
                        </div>
                        <div class="money">💰 ${new Intl.NumberFormat().format(tm.money || 0)}</div>
                    </div>
                    <div class="player-list">
                        ${tm.players.map(p => {
                            if (!p.name) return '';
                            const loanInfo = p.loan ? ` (loan to ${t.teams.find(x=>x.id===p.loan.teamId)?.name||'unknown'}, ${p.loan.roundsLeft} rounds left)` : '';
                            const efectivity = p.efectivity || 0;
                            const effColor = efectivity >= 50 ? '#22D3EE' : '#F97316';
                            return `
                                <div class="player-row">
                                    <span class="pname">${p.name}</span>
                                    <span class="pvalue">🏷️ ${new Intl.NumberFormat().format(p.value || 0)}</span>
                                    <span class="pvalue" style="color:${effColor};">🎯 ${efectivity.toFixed(1)}%</span>
                                    ${loanInfo ? `<span class="ploan">📋 ${loanInfo}</span>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    updatePlayerValues: () => {
        const t = State.getT();
        if (!t) return;
        t.teams.forEach(tm => {
            tm.players.forEach(p => {
                if (p.name) {
                    // Base value: EGO Score * 10,000 (100 EGO = 1,000,000)
                    const egoScore = p.egoScore || 50;
                    const baseValue = egoScore * 10000;
                    // Adjust for efectivity
                    const efectivity = p.efectivity || 0;
                    let multiplier = 1;
                    if (efectivity >= 50) multiplier = 1.10; // +10%
                    else if (efectivity > 0) multiplier = 0.90; // -10%
                    p.value = Math.round(baseValue * multiplier);
                }
            });
        });
        State.saveData();
    },

    updatePlayerValue: (player) => {
        const t = State.getT();
        if (!t || !player) return;
        const egoScore = player.egoScore || 50;
        const baseValue = egoScore * 10000;
        const efectivity = player.efectivity || 0;
        let multiplier = 1;
        if (efectivity >= 50) multiplier = 1.10;
        else if (efectivity > 0) multiplier = 0.90;
        player.value = Math.round(baseValue * multiplier);
        // Update egoScore from global stats
        const stats = Engine.getGlobalPlayerStats();
        const stat = stats.find(s => s.id === player.id);
        if (stat) player.egoScore = stat.imp || 50;
        State.saveData();
    },

    showGiveMoney: () => {
        const t = State.getT();
        if (!t) return;
        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        let html = `
            <h3 class="text-xl font-black mb-4">Give Money</h3>
            <div class="space-y-4">
                <div>
                    <label class="text-xs text-[#94A3B8]">Amount</label>
                    <input id="give-amount" type="number" value="100000" class="input-dark mt-1" />
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">Select Teams</label>
                    <div class="space-y-1 mt-1">
                        ${t.teams.map(tm => `
                            <label class="flex items-center gap-2 text-sm">
                                <input type="checkbox" class="give-team-check" value="${tm.id}" />
                                ${tm.name}
                            </label>
                        `).join('')}
                    </div>
                    <button class="btn-secondary text-xs mt-2" onclick="document.querySelectorAll('.give-team-check').forEach(c=>c.checked=true)">Select All</button>
                </div>
                <div class="flex gap-3">
                    <button class="btn-primary" onclick="Economy.processGiveMoney()">Give</button>
                    <button class="btn-accent" onclick="Economy.processGiveAll()">Give All</button>
                </div>
            </div>
        `;
        content.innerHTML = html;
        modal.style.display = 'flex';
    },

    processGiveMoney: () => {
        const t = State.getT();
        const amount = parseInt(document.getElementById('give-amount').value) || 0;
        if (amount <= 0) return alert('Enter a valid amount.');
        const checks = document.querySelectorAll('.give-team-check:checked');
        if (checks.length === 0) return alert('Select at least one team.');
        checks.forEach(c => {
            const tm = t.teams.find(x => x.id === c.value);
            if (tm) tm.money = (tm.money || 0) + amount;
        });
        State.saveData();
        UIController.closeModal();
        Economy.render();
    },

    processGiveAll: () => {
        const t = State.getT();
        const amount = parseInt(document.getElementById('give-amount').value) || 0;
        if (amount <= 0) return alert('Enter a valid amount.');
        t.teams.forEach(tm => tm.money = (tm.money || 0) + amount);
        State.saveData();
        UIController.closeModal();
        Economy.render();
    },

    showTransfers: () => {
        const t = State.getT();
        if (!t) return;
        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        let html = `
            <h3 class="text-xl font-black mb-4">Transfer Player</h3>
            <div class="space-y-4">
                <div>
                    <label class="text-xs text-[#94A3B8]">From</label>
                    <select id="transfer-from" class="input-dark mt-1">
                        ${t.teams.map(tm => `<option value="${tm.id}">${tm.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">Player</label>
                    <select id="transfer-player" class="input-dark mt-1"></select>
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">To</label>
                    <select id="transfer-to" class="input-dark mt-1">
                        ${t.teams.map(tm => `<option value="${tm.id}">${tm.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">Value</label>
                    <input id="transfer-value" type="number" class="input-dark mt-1" />
                </div>
                <button class="btn-primary" onclick="Economy.processTransfer()">Transfer</button>
            </div>
        `;
        content.innerHTML = html;
        modal.style.display = 'flex';
        document.getElementById('transfer-from').addEventListener('change', Economy.updateTransferPlayers);
        Economy.updateTransferPlayers();
    },

    updateTransferPlayers: () => {
        const t = State.getT();
        const fromId = document.getElementById('transfer-from').value;
        const tm = t.teams.find(x => x.id === fromId);
        const select = document.getElementById('transfer-player');
        select.innerHTML = '';
        if (!tm) return;
        tm.players.forEach(p => {
            if (p.name) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${new Intl.NumberFormat().format(p.value || 0)})`;
                select.appendChild(opt);
            }
        });
        select.addEventListener('change', () => {
            const p = tm.players.find(x => x.id === select.value);
            if (p) document.getElementById('transfer-value').value = p.value || 0;
        });
        if (tm.players.length) {
            const p = tm.players.find(x => x.id === select.value) || tm.players[0];
            if (p) document.getElementById('transfer-value').value = p.value || 0;
        }
    },

    processTransfer: () => {
        const t = State.getT();
        const fromId = document.getElementById('transfer-from').value;
        const toId = document.getElementById('transfer-to').value;
        const playerId = document.getElementById('transfer-player').value;
        const value = parseInt(document.getElementById('transfer-value').value) || 0;
        if (fromId === toId) return alert('Cannot transfer to the same team.');
        const from = t.teams.find(x => x.id === fromId);
        const to = t.teams.find(x => x.id === toId);
        if (!from || !to) return;
        const pIdx = from.players.findIndex(x => x.id === playerId);
        if (pIdx === -1) return;
        const player = from.players[pIdx];
        if (player.loan) return alert('Cannot transfer a loaned player.');
        if ((from.money || 0) < value) return alert('Not enough money.');
        from.money -= value;
        to.money = (to.money || 0) + value;
        from.players.splice(pIdx, 1);
        to.players.push(player);
        State.saveData();
        UIController.closeModal();
        Economy.render();
    },

    showLoans: () => {
        const t = State.getT();
        if (!t) return;
        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        let html = `
            <h3 class="text-xl font-black mb-4">Loan Player</h3>
            <div class="space-y-4">
                <div>
                    <label class="text-xs text-[#94A3B8]">From</label>
                    <select id="loan-from" class="input-dark mt-1">
                        ${t.teams.map(tm => `<option value="${tm.id}">${tm.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">Player</label>
                    <select id="loan-player" class="input-dark mt-1"></select>
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">To</label>
                    <select id="loan-to" class="input-dark mt-1">
                        ${t.teams.map(tm => `<option value="${tm.id}">${tm.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">Rounds</label>
                    <input id="loan-rounds" type="number" value="5" class="input-dark mt-1" />
                </div>
                <div>
                    <label class="text-xs text-[#94A3B8]">Loan Fee</label>
                    <input id="loan-fee" type="number" value="50000" class="input-dark mt-1" />
                </div>
                <button class="btn-primary" onclick="Economy.processLoan()">Loan</button>
            </div>
        `;
        content.innerHTML = html;
        modal.style.display = 'flex';
        document.getElementById('loan-from').addEventListener('change', Economy.updateLoanPlayers);
        Economy.updateLoanPlayers();
    },

    updateLoanPlayers: () => {
        const t = State.getT();
        const fromId = document.getElementById('loan-from').value;
        const tm = t.teams.find(x => x.id === fromId);
        const select = document.getElementById('loan-player');
        select.innerHTML = '';
        if (!tm) return;
        tm.players.forEach(p => {
            if (p.name && !p.loan) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            }
        });
    },

    processLoan: () => {
        const t = State.getT();
        const fromId = document.getElementById('loan-from').value;
        const toId = document.getElementById('loan-to').value;
        const playerId = document.getElementById('loan-player').value;
        const rounds = parseInt(document.getElementById('loan-rounds').value) || 0;
        const fee = parseInt(document.getElementById('loan-fee').value) || 0;
        if (fromId === toId) return alert('Cannot loan to the same team.');
        if (rounds <= 0) return alert('Rounds must be positive.');
        const from = t.teams.find(x => x.id === fromId);
        const to = t.teams.find(x => x.id === toId);
        if (!from || !to) return;
        const pIdx = from.players.findIndex(x => x.id === playerId);
        if (pIdx === -1) return;
        const player = from.players[pIdx];
        if (player.loan) return alert('Player is already on loan.');
        if ((from.money || 0) < fee) return alert('Not enough money for fee.');
        from.money -= fee;
        to.money = (to.money || 0) + fee;
        player.loan = { teamId: toId, roundsLeft: rounds };
        from.players.splice(pIdx, 1);
        to.players.push(player);
        State.saveData();
        UIController.closeModal();
        Economy.render();
    },

    // --- MARKET ---
    showMarket: () => {
        const t = State.getT();
        if (!t) return;
        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        // Collect all players from all teams
        let allPlayers = [];
        t.teams.forEach(tm => {
            tm.players.forEach(p => {
                if (p.name) {
                    allPlayers.push({
                        ...p,
                        teamName: tm.name,
                        teamShield: tm.shield,
                        egoScore: p.egoScore || 50
                    });
                }
            });
        });
        // Sort by value descending
        allPlayers.sort((a, b) => (b.value || 0) - (a.value || 0));
        let html = `
            <h3 class="text-xl font-black mb-4">Market</h3>
            <p class="text-xs text-[#94A3B8] mb-4">Player values based on EGO (100 EGO = 1,000,000) and adjusted by efectivity.</p>
            <div class="space-y-2 max-h-[60vh] overflow-y-auto">
        `;
        allPlayers.forEach((p, idx) => {
            const trend = p.efectivity >= 50 ? 'up' : (p.efectivity > 0 ? 'down' : 'stable');
            const trendSymbol = trend === 'up' ? '▲' : (trend === 'down' ? '▼' : '—');
            const trendColor = trend === 'up' ? 'up' : (trend === 'down' ? 'down' : 'stable');
            html += `
                <div class="market-item">
                    <div class="rank">#${idx+1}</div>
                    <img src="${p.teamShield||''}" class="avatar" />
                    <div class="info">
                        <div class="name">${p.name}</div>
                        <div class="team">${p.teamName}</div>
                    </div>
                    <div class="value">💰 ${new Intl.NumberFormat().format(p.value || 0)}</div>
                    <div class="trend ${trendColor}">${trendSymbol} ${(p.efectivity||0).toFixed(1)}%</div>
                </div>
            `;
        });
        html += `</div><div class="flex justify-end mt-4"><button class="btn-secondary" onclick="UIController.closeModal()">Close</button></div>`;
        content.innerHTML = html;
        modal.style.display = 'flex';
    },

    // Called each round to decrease loan rounds
    advanceLoans: () => {
        const t = State.getT();
        if (!t) return;
        let changed = false;
        t.teams.forEach(tm => {
            tm.players.forEach(p => {
                if (p.loan) {
                    p.loan.roundsLeft -= 1;
                    if (p.loan.roundsLeft <= 0) {
                        const originalTeam = t.teams.find(x => x.id === p.loan.teamId);
                        if (originalTeam) {
                            const idx = tm.players.indexOf(p);
                            if (idx > -1) tm.players.splice(idx, 1);
                            originalTeam.players.push({ ...p, loan: null });
                            changed = true;
                        }
                    }
                }
            });
        });
        if (changed) {
            State.saveData();
            if (document.getElementById('view-economy').classList.contains('active')) Economy.render();
        }
    }
};

// Automatically advance loans when a new round is generated or loaded
const origGenerateRoundRobin = Engine.generateRoundRobin;
Engine.generateRoundRobin = function() {
    const result = origGenerateRoundRobin.call(this);
    if (result) Economy.advanceLoans();
    return result;
};

// Also when switching rounds in schedule, we could advance loans
// This is a simplified approach; for a full implementation, you'd call advanceLoans
// after each match report or round change.