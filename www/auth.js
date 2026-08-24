(function () {
  const SESSION_KEY = 'FIELDTRACK_AUTH_SESSION';
  const TOKEN_KEY = 'authToken';
  const MESSAGE_KEY = 'FIELDTRACK_AUTH_MESSAGE';
  const nativePlatform = window.Capacitor && typeof window.Capacitor.getPlatform === 'function'
    ? window.Capacitor.getPlatform()
    : '';
  const defaultBackendBase = nativePlatform === 'android'
    ? 'http://192.168.1.18:4000'
    : nativePlatform === 'ios'
      ? 'http://localhost:4000'
      : 'http://localhost:4000';
  const BACKEND_BASE = String(window.FIELDTRACK_API_BASE || defaultBackendBase).replace(/\/$/, '');
  window.__FIELDTRACK_API_BASE = BACKEND_BASE;

  function fileName() {
    const path = window.location.pathname || '';
    const clean = path.split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    return parts.length ? String(parts[parts.length - 1] || '').toLowerCase() : 'index.html';
  }

  function setMessage(message) {
    if (message) {
      sessionStorage.setItem(MESSAGE_KEY, message);
      return;
    }
    sessionStorage.removeItem(MESSAGE_KEY);
  }

  function consumeMessage() {
    const message = sessionStorage.getItem(MESSAGE_KEY) || '';
    sessionStorage.removeItem(MESSAGE_KEY);
    return message;
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || typeof session !== 'object') return null;
      if (!session.token || !session.email) return null;
      return session;
    } catch (error) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function authHeader() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function loginWithBackend(identifier, password) {
    let response;
    try {
      response = await fetch(`${BACKEND_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, username: identifier, password })
      });
    } catch (error) {
      throw new Error('Cannot connect to the backend. Start it with: npm run backend');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'Unable to reach backend.');
    }
    return payload;
  }

  const BIOMETRIC_SERVER = 'com.Alkashaf.app';

  function getBiometricPlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric) || null;
  }

  async function isBiometricLoginAvailable() {
    const plugin = getBiometricPlugin();
    if (!plugin || nativePlatform !== 'android') return false;
    try {
      const available = await plugin.isAvailable();
      if (!available.isAvailable) return false;
      const saved = await plugin.isCredentialsSaved({ server: BIOMETRIC_SERVER });
      return !!saved.isSaved;
    } catch (error) {
      return false;
    }
  }

  async function saveBiometricCredentials(username, password) {
    const plugin = getBiometricPlugin();
    if (!plugin || nativePlatform !== 'android') return;
    try {
      const available = await plugin.isAvailable();
      if (!available.isAvailable) return;
      await plugin.setCredentials({
        username,
        password,
        server: BIOMETRIC_SERVER,
        accessControl: 2
      });
    } catch (error) {
      /* Ignore silently: biometric enrollment is optional, never block login. */
    }
  }

  async function loginWithBiometrics() {
    const plugin = getBiometricPlugin();
    if (!plugin) throw new Error('Fingerprint login is not available on this device.');
    const credentials = await plugin.getSecureCredentials({
      server: BIOMETRIC_SERVER,
      reason: 'Log in to your account',
      title: 'Fingerprint Login'
    });
    return loginWithBackend(credentials.username, credentials.password);
  }

  async function registerWithBackend(name, username, email, password, organizationName, role, employeeType) {
    let response;
    try {
      response = await fetch(`${BACKEND_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email, password, organizationName, role, employeeType })
      });
    } catch (error) {
      throw new Error('Cannot connect to the backend. Start it with: npm run backend');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'Unable to reach backend.');
    }
    return payload;
  }

  function normalizeUser(payload, fallbackIdentifier) {
    const user = (payload && payload.user) || {};
    const email = String(user.email || fallbackIdentifier || '').trim().toLowerCase();
    const username = String(user.username || '').trim().toLowerCase();
    const displayName = String(user.name || email || 'User').trim();
    return {
      email,
      username,
      displayName,
      role: String(user.role || 'owner').toLowerCase(),
      id: user.id || null,
      organizationId: user.organizationId || null,
      employeeType: String(user.employeeType || '').trim().toLowerCase()
    };
  }

  function saveEmployeeType(username, employeeType) {
    try {
      const profiles = JSON.parse(localStorage.getItem('FIELDTRACK_EMPLOYEE_PROFILES') || '{}');
      profiles[username] = { ...(profiles[username] || {}), type: employeeType };
      localStorage.setItem('FIELDTRACK_EMPLOYEE_PROFILES', JSON.stringify(profiles));
    } catch (error) {
      localStorage.setItem('FIELDTRACK_EMPLOYEE_PROFILES', JSON.stringify({ [username]: { type: employeeType } }));
    }
  }

  function guardPage() {
    const page = fileName();
    const session = getSession();

    if (page === 'auth.html') {
      if (session) {
        window.location.replace('index.html');
      }
      return;
    }

    if (!session) {
      setMessage('Please login first.');
      window.location.replace('auth.html');
      return;
    }

    if (page === 'approvals.html' && String(session.role || '').toLowerCase() !== 'admin') {
      setMessage('Only admin can access approvals.');
      window.location.replace('index.html');
      return;
    }

    if (page === 'manager-approvals.html' && !session.username && !session.email) {
      setMessage('Please login first.');
      window.location.replace('auth.html');
      return;
    }

  }

  function bindAuthPage() {
    const currentPage = fileName();

    const msgNode = document.getElementById('authMessage');
    const infoNode = document.getElementById('loginInfo');
    const loginForm = document.getElementById('loginForm');
    const registerRole = document.getElementById('registerRole');
    const employeeTypeField = document.getElementById('employeeTypeField');
    const updateEmployeeTypeVisibility = function () {
      if (employeeTypeField && registerRole) employeeTypeField.style.display = registerRole.value === 'employee' ? 'block' : 'none';
    };
    if (registerRole) {
      registerRole.addEventListener('change', updateEmployeeTypeVisibility);
      updateEmployeeTypeVisibility();
    }

    const message = consumeMessage();
    if (msgNode && message) {
      msgNode.textContent = message;
    }

    if (currentPage === 'auth.html' && loginForm) {
      const biometricBtn = document.getElementById('biometricLoginBtn');

      if (biometricBtn) {
        isBiometricLoginAvailable().then((available) => {
          if (available) biometricBtn.style.display = 'block';
        });

        biometricBtn.addEventListener('click', function () {
          if (infoNode) infoNode.textContent = 'Verifying fingerprint...';
          loginWithBiometrics()
            .then((payload) => {
              const profile = normalizeUser(payload, '');
              localStorage.setItem(TOKEN_KEY, payload.token || '');
              setSession({
                token: payload.token || '',
                email: profile.email,
                username: profile.username || profile.email,
                displayName: profile.displayName,
                role: profile.role,
                userId: profile.id,
                organizationId: profile.organizationId,
                loginAt: new Date().toISOString()
              });
              setMessage('Login successful.');
              window.location.replace('index.html');
            })
            .catch((error) => {
              if (infoNode) infoNode.textContent = error.message || 'Fingerprint login failed.';
            });
        });
      }

      loginForm.addEventListener('submit', function (event) {
        event.preventDefault();

      const identifier = String((document.getElementById('loginUsername') || {}).value || '').trim().toLowerCase();
      const password = String((document.getElementById('loginPassword') || {}).value || '').trim();

      if (infoNode) infoNode.textContent = 'Signing in...';

      loginWithBackend(identifier, password)
        .then((payload) => {
          const profile = normalizeUser(payload, identifier);
          localStorage.setItem(TOKEN_KEY, payload.token || '');
          setSession({
            token: payload.token || '',
            email: profile.email,
            username: profile.username || profile.email,
            displayName: profile.displayName,
            role: profile.role,
            userId: profile.id,
            organizationId: profile.organizationId,
            loginAt: new Date().toISOString()
          });
          if (profile.username && profile.role === 'employee' && profile.employeeType) {
            saveEmployeeType(profile.username, profile.employeeType);
          }
          saveBiometricCredentials(identifier, password);
          setMessage('Login successful.');
          window.location.replace('index.html');
        })
        .catch((error) => {
          localStorage.removeItem(TOKEN_KEY);
          if (infoNode) infoNode.textContent = error.message || 'Login failed.';
        });
      });
    }

    const registerForm = document.getElementById('registerForm');
    const registerInfo = document.getElementById('registerInfo');

    if (currentPage === 'auth.html' && registerForm) {
      registerForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const fullName = String((document.getElementById('registerName') || {}).value || '').trim();
        const username = String((document.getElementById('registerUsername') || {}).value || '').trim().toLowerCase();
        const email = String((document.getElementById('registerEmail') || {}).value || '').trim().toLowerCase();
        const password = String((document.getElementById('registerPassword') || {}).value || '').trim();
        const organizationName = String((document.getElementById('registerOrg') || {}).value || '').trim();
        const role = String((document.getElementById('registerRole') || {}).value || 'owner').trim().toLowerCase();
        const employeeType = role === 'employee'
          ? String((document.getElementById('registerEmployeeType') || {}).value || 'supervision').trim().toLowerCase()
          : '';

        if (!email || !password) {
          if (registerInfo) registerInfo.textContent = 'Email and password are required.';
          return;
        }

        if (registerInfo) registerInfo.textContent = 'Creating account...';

        registerWithBackend(fullName, username, email, password, organizationName, role, employeeType)
          .then((payload) => {
            const profile = normalizeUser(payload, email || username);
            localStorage.setItem(TOKEN_KEY, payload.token || '');
            setSession({
              token: payload.token || '',
              email: profile.email,
              username: profile.username || profile.email,
              displayName: profile.displayName,
              role: profile.role,
              userId: profile.id,
              organizationId: profile.organizationId,
              loginAt: new Date().toISOString()
            });
            if (profile.username && profile.role === 'employee') {
              saveEmployeeType(profile.username, profile.employeeType || employeeType || 'supervision');
            }
            if (registerInfo) registerInfo.textContent = 'Account created. Redirecting...';
            setMessage('Welcome! Your account is ready.');
            window.location.replace('index.html');
          })
          .catch((error) => {
            if (registerInfo) registerInfo.textContent = error.message || 'Signup failed.';
          });
      });
    }

    const pendingList = document.getElementById('pendingUsersList');
    const pendingStatus = document.getElementById('pendingStatus');
    if (pendingList && pendingStatus) {
      const session = getSession();
      if (!session || String(session.role || '').toLowerCase() !== 'admin') {
        pendingStatus.textContent = 'Admin access is required.';
        return;
      }

      const reloadPendingUsers = function () {
        pendingStatus.textContent = 'Loading pending signups...';
        fetch(`${BACKEND_BASE}/auth/pending-users`, {
          headers: { 'Content-Type': 'application/json', ...authHeader() }
        })
          .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
          .then(({ ok, payload }) => {
            if (!ok) throw new Error((payload && payload.message) || 'Unable to load pending users.');
            pendingList.innerHTML = '';
            if (!Array.isArray(payload) || !payload.length) {
              pendingStatus.textContent = 'No pending signups right now.';
              return;
            }

            payload.forEach((item) => {
              const li = document.createElement('li');
              const meta = document.createElement('div');
              meta.textContent = `${item.name || '-'} (${item.username || item.email || '-'})`;
              const actions = document.createElement('div');
              actions.style.display = 'flex';
              actions.style.gap = '8px';
              actions.style.marginTop = '8px';

              const managerInput = document.createElement('input');
              managerInput.type = 'text';
              managerInput.placeholder = 'Manager username or email';
              managerInput.style.flex = '1';
              managerInput.style.padding = '8px 10px';
              managerInput.style.borderRadius = '8px';
              managerInput.style.border = '1px solid rgba(255,255,255,.25)';
              managerInput.style.background = 'rgba(255,255,255,.08)';
              managerInput.style.color = '#f5f8fc';

              const approveBtn = document.createElement('button');
              approveBtn.type = 'button';
              approveBtn.className = 'submit';
              approveBtn.style.marginTop = '0';
              approveBtn.style.padding = '8px 10px';
              approveBtn.textContent = 'Send To Manager';

              const rejectBtn = document.createElement('button');
              rejectBtn.type = 'button';
              rejectBtn.className = 'submit';
              rejectBtn.style.marginTop = '0';
              rejectBtn.style.padding = '8px 10px';
              rejectBtn.style.background = '#a53838';
              rejectBtn.style.color = '#fff';
              rejectBtn.textContent = 'Reject';

              const perform = function (action) {
                fetch(`${BACKEND_BASE}/auth/pending-users/${item.id}/${action}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHeader() },
                  body: action === 'approve'
                    ? JSON.stringify({ managerUsername: String(managerInput.value || '').trim() })
                    : undefined
                })
                  .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
                  .then(({ ok, payload }) => {
                    if (!ok) throw new Error((payload && payload.message) || `Unable to ${action} user.`);
                    reloadPendingUsers();
                  })
                  .catch((error) => {
                    pendingStatus.textContent = error.message || `Unable to ${action} user.`;
                  });
              };

              approveBtn.addEventListener('click', () => perform('approve'));
              rejectBtn.addEventListener('click', () => perform('reject'));

              actions.append(managerInput, approveBtn, rejectBtn);
              li.append(meta, actions);
              pendingList.appendChild(li);
            });
            pendingStatus.textContent = `Pending admin queue: ${payload.length}`;
          })
          .catch((error) => {
            pendingStatus.textContent = error.message || 'Unable to load pending users.';
          });
      };

      reloadPendingUsers();
    }

    const managerList = document.getElementById('managerPendingUsersList');
    const managerStatus = document.getElementById('managerPendingStatus');
    if (managerList && managerStatus) {
      const reloadManagerUsers = function () {
        managerStatus.textContent = 'Loading manager approval queue...';
        fetch(`${BACKEND_BASE}/auth/manager/pending-users`, {
          headers: { 'Content-Type': 'application/json', ...authHeader() }
        })
          .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
          .then(({ ok, payload }) => {
            if (!ok) throw new Error((payload && payload.message) || 'Unable to load manager queue.');
            managerList.innerHTML = '';
            if (!Array.isArray(payload) || !payload.length) {
              managerStatus.textContent = 'No users waiting for your decision.';
              return;
            }

            payload.forEach((item) => {
              const li = document.createElement('li');
              const meta = document.createElement('div');
              meta.textContent = `${item.name || '-'} (${item.username || item.email || '-'})`;
              const actions = document.createElement('div');
              actions.style.display = 'flex';
              actions.style.gap = '8px';
              actions.style.marginTop = '8px';

              const approveBtn = document.createElement('button');
              approveBtn.type = 'button';
              approveBtn.className = 'submit';
              approveBtn.style.marginTop = '0';
              approveBtn.style.padding = '8px 10px';
              approveBtn.textContent = 'Approve';

              const rejectBtn = document.createElement('button');
              rejectBtn.type = 'button';
              rejectBtn.className = 'submit';
              rejectBtn.style.marginTop = '0';
              rejectBtn.style.padding = '8px 10px';
              rejectBtn.style.background = '#a53838';
              rejectBtn.style.color = '#fff';
              rejectBtn.textContent = 'Reject';

              const perform = function (action) {
                fetch(`${BACKEND_BASE}/auth/manager/pending-users/${item.id}/${action}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHeader() }
                })
                  .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
                  .then(({ ok, payload }) => {
                    if (!ok) throw new Error((payload && payload.message) || `Unable to ${action} user.`);
                    reloadManagerUsers();
                  })
                  .catch((error) => {
                    managerStatus.textContent = error.message || `Unable to ${action} user.`;
                  });
              };

              approveBtn.addEventListener('click', () => perform('approve'));
              rejectBtn.addEventListener('click', () => perform('reject'));

              actions.append(approveBtn, rejectBtn);
              li.append(meta, actions);
              managerList.appendChild(li);
            });
            managerStatus.textContent = `Pending manager queue: ${payload.length}`;
          })
          .catch((error) => {
            managerStatus.textContent = error.message || 'Unable to load manager queue.';
          });
      };

      reloadManagerUsers();
    }
  }

  window.__FIELDTRACK_AUTH = {
    guardPage,
    bindAuthPage,
    getSession,
    clearSession
  };
})();
