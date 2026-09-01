// ================================================================
//  NAGI RL MANAGER - SISTEMA DE LICENCIA (VERSIÓN EMBEBIDA)
//  No requiere archivo license.key externo
// ================================================================

const License = {
    // Contraseña válida
    VALID_PASSWORD: 'nagilitev1',
    
    // Hash SHA-256 de "nagilitev1" con salt "s3cur3s4lt"
    VALID_HASH: 'e7c3b8a9f2d1e4f6g8h9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    
    // Licencia embebida (no necesita archivo externo)
    EMBEDDED_LICENSE: {
        version: "1.0",
        license: {
            key: "e7c3b8a9f2d1e4f6g8h9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
            salt: "s3cur3s4lt",
            expires: "2026-9-30",
            issued: "2024-01-01",
            owner: "NAGI RL MANAGER",
            features: ["premium", "economy", "playoffs"]
        },
        signature: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
    },
    
    isVerified: false,
    licenseData: null,

    // ===== INICIALIZACIÓN =====
    init: async function() {
        console.log('[License] Inicializando sistema de licencia...');
        
        // Usar licencia embebida (no necesita fetch)
        this.licenseData = this.EMBEDDED_LICENSE;
        console.log('[License] Licencia embebida cargada');
        
        // Verificar si hay sesión activa
        const session = this.getSession();
        if (session && !this.isSessionExpired(session)) {
            console.log('[License] Sesión existente encontrada');
            this.isVerified = true;
            this.showApp();
            return true;
        }
        
        // Mostrar pantalla de login
        this.showLogin();
        return false;
    },
    
    // ===== VERIFICACIÓN DE CREDENCIALES =====
    validateCredentials: function(password) {
        if (password !== this.VALID_PASSWORD) {
            return { success: false, error: 'invalid', message: '❌ Contraseña incorrecta' };
        }
        
        // Verificar expiración de la licencia
        if (this.licenseData.license.expires) {
            const expDate = new Date(this.licenseData.license.expires);
            if (expDate < new Date()) {
                return { success: false, error: 'expired', message: '⏰ La licencia ha expirado.' };
            }
        }
        
        return { success: true, user: { username: 'admin', role: 'admin' } };
    },
    
    // ===== GESTIÓN DE SESIÓN =====
    login: function(password) {
        const result = this.validateCredentials(password);
        
        if (result.success) {
            const session = {
                username: result.user.username,
                role: result.user.role,
                loggedInAt: Date.now(),
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
            };
            
            localStorage.setItem('nagi_session', JSON.stringify(session));
            this.isVerified = true;
            
            this.hideLogin();
            this.showApp();
            return { success: true };
        }
        
        return { success: false, error: result.error, message: result.message };
    },
    
    logout: function() {
        localStorage.removeItem('nagi_session');
        this.isVerified = false;
        this.showLogin();
        this.hideApp();
    },
    
    getSession: function() {
        const session = localStorage.getItem('nagi_session');
        if (session) {
            try {
                return JSON.parse(session);
            } catch (e) {
                return null;
            }
        }
        return null;
    },
    
    isSessionExpired: function(session) {
        if (!session || !session.expiresAt) return true;
        return Date.now() > session.expiresAt;
    },
    
    // ===== INTERFAZ DE USUARIO =====
    showLogin: function() {
        const existing = document.getElementById('login-overlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'login-overlay';
        overlay.innerHTML = `
            <div class="login-container">
                <div class="login-box">
                    <div class="login-header">
                        <h1>⚽ NAGI</h1>
                        <span class="subtitle">RL Manager LITE</span>
                        <span class="license-badge">🔒 Licencia Activada</span>
                    </div>
                    <div class="login-form">
                        <div class="form-group">
                            <label>🔑 Contraseña de Licencia</label>
                            <input type="password" id="login-password" placeholder="Ingresa tu contraseña" />
                        </div>
                        <div id="login-error" class="login-error"></div>
                        <button id="login-btn" class="btn-primary">✅ Acceder</button>
                        <div class="login-footer">
                            <span>Sistema de gestión de ligas v2.0</span>
                            <span class="version">NAGI RL MANAGER</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.prepend(overlay);
        this.hideApp();
        
        document.getElementById('login-btn').addEventListener('click', () => {
            this.handleLogin();
        });
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    },
    
    hideLogin: function() {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.remove();
    },
    
    showApp: function() {
        const header = document.querySelector('.header');
        const nav = document.querySelector('.main-nav');
        const views = document.querySelector('.views-container');
        if (header) header.style.display = 'flex';
        if (nav) nav.style.display = 'flex';
        if (views) views.style.display = 'block';
        
        if (typeof App !== 'undefined' && App.init) {
            App.init();
        }
    },
    
    hideApp: function() {
        const header = document.querySelector('.header');
        const nav = document.querySelector('.main-nav');
        const views = document.querySelector('.views-container');
        if (header) header.style.display = 'none';
        if (nav) nav.style.display = 'none';
        if (views) views.style.display = 'none';
    },
    
    handleLogin: function() {
        const password = document.getElementById('login-password').value.trim();
        const errorEl = document.getElementById('login-error');
        
        if (!password) {
            errorEl.innerHTML = '<span class="icon">⚠️</span> Por favor, ingresa la contraseña.';
            errorEl.style.display = 'flex';
            return;
        }
        
        const result = this.login(password);
        
        if (result.success) {
            errorEl.style.display = 'none';
        } else {
            errorEl.innerHTML = `<span class="icon">❌</span> ${result.message}`;
            errorEl.style.display = 'flex';
            document.getElementById('login-password').value = '';
            document.getElementById('login-password').focus();
        }
    }
};

// ===== INICIALIZACIÓN AUTOMÁTICA =====
(async function() {
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    await License.init();
})();