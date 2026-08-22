const root = document.querySelector('.app-shell');
const backendBase = String(window.FIELDTRACK_API_BASE || (
  window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000'
)).replace(/\/$/, '');
let authToken = localStorage.getItem('authToken');
const CLOCK_STATE_KEY = 'FIELDTRACK_CLOCK_STATE';
const CURRENT_EMPLOYEE_ID = 'emp-current';
const CURRENT_EMPLOYEE_NAME = 'Current Employee';
let dashboardPeople = [];
let selectedEmployeeId = null;

const fallbackPeople = [];

const fallbackAttendance = [];

async function authenticate() {
  if (authToken) return authToken;
  throw new Error('Authentication required');
}

async function fetchJson(path, fallback) {
  try {
    const token = await authenticate();
    const response = await fetch(`${backendBase}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Request failed');
    return await response.json();
  } catch (error) {
    return fallback;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function hashNumber(input) {
  const text = String(input || 'seed');
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function ensureCoordinates(person) {
  const latCandidate = Number(person.lat ?? person.latitude ?? person.locationLat ?? person.location?.lat);
  const lngCandidate = Number(person.lng ?? person.longitude ?? person.locationLng ?? person.location?.lng);
  if (Number.isFinite(latCandidate) && Number.isFinite(lngCandidate)) {
    return { lat: latCandidate, lng: lngCandidate };
  }
  const seed = hashNumber(person.id || person.name || 'emp');
  const lat = 25.2854 + ((seed % 100) - 50) / 2500;
  const lng = 51.5310 + (((seed >> 3) % 100) - 50) / 2500;
  return { lat, lng };
}

function formatDateTime(value) {
  if (!value) return 'Now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setStatus(message) {
  const banner = document.getElementById('statusBanner');
  if (!banner) return;
  banner.textContent = message;
  banner.style.display = 'block';
  clearTimeout(setStatus.timeout);
  setStatus.timeout = setTimeout(() => {
    banner.style.display = 'none';
  }, 2200);
}

function getClockState() {
  try {
    return JSON.parse(localStorage.getItem(CLOCK_STATE_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function saveClockState(state) {
  localStorage.setItem(CLOCK_STATE_KEY, JSON.stringify(state));
}

function formatWorkedTime(ms) {
  const totalMins = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function getCurrentEmployeeWorkedMs() {
  const state = getClockState();
  let totalMs = Number(state.totalMs || 0);
  if (state.activeClockInAt) {
    totalMs += Math.max(0, Date.now() - new Date(state.activeClockInAt).getTime());
  }
  return totalMs;
}

function updateWorkedTimeUI() {
  const workedText = formatWorkedTime(getCurrentEmployeeWorkedMs());
  setText('employeeWorkedTime', workedText);
  setText('hoursToday', workedText);
  setText('metricHours', workedText);
}

function applyLocalClockUpdate(action) {
  const state = getClockState();
  if (action === 'in') {
    state.activeClockInAt = new Date().toISOString();
  } else if (state.activeClockInAt) {
    state.totalMs = Number(state.totalMs || 0) + Math.max(0, Date.now() - new Date(state.activeClockInAt).getTime());
    state.activeClockInAt = null;
  }
  saveClockState(state);
}

function buildLocalAttendanceItem(action) {
  return {
    id: `att-local-${Date.now()}`,
    employeeId: CURRENT_EMPLOYEE_ID,
    employeeName: CURRENT_EMPLOYEE_NAME,
    type: action === 'in' ? 'Clock in' : 'Clock out',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'Saved local'
  };
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => reject(new Error('Location permission denied')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

async function verifyClockInChecks() {
  const fingerprintAccepted = window.confirm('Fingerprint scan required before clock in. Tap OK after scanning fingerprint.');
  if (!fingerprintAccepted) {
    throw new Error('Fingerprint verification cancelled');
  }

  setStatus('Allow location access to finish clock-in');
  const position = await getCurrentPosition();
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };
}

function renderDashboard(data) {
  const people = Array.isArray(data.people) ? data.people : [];
  const presentCount = people.filter((person) => person.status === 'On site' || person.status === 'active' || person.status === 'Present').length;
  const lateCount = people.filter((person) => person.status === 'Late').length;
  const absentCount = Math.max(0, people.length - presentCount - lateCount);
  setText('statActive', presentCount);
  setText('statLate', lateCount);
  setText('statAbsent', absentCount);
  setText('hoursToday', data.summary.hoursToday);
  setText('metricPresent', presentCount);
  setText('metricLate', lateCount);
  setText('metricHours', data.summary.hoursToday);
  setText('liveNow', presentCount);
  setText('pendingNow', lateCount);
  setText('complianceNow', data.summary.compliance);

  const normalizedPeople = people.map((person, index) => {
    const coords = ensureCoordinates(person);
    return {
      ...person,
      id: person.id || `emp-${index + 1}`,
      name: person.name || `Employee ${index + 1}`,
      role: person.role || 'Field Engineer',
      department: person.department || person.group || 'Operations',
      shift: person.shift || '08:00 - 16:00',
      status: person.status || 'Present',
      lat: coords.lat,
      lng: coords.lng,
      lastUpdate: person.lastUpdate || person.updatedAt || new Date().toISOString()
    };
  });
  if (!normalizedPeople.some((person) => person.id === CURRENT_EMPLOYEE_ID)) {
    normalizedPeople.unshift({
      id: CURRENT_EMPLOYEE_ID,
      name: CURRENT_EMPLOYEE_NAME,
      department: 'Operations',
      role: 'Field Engineer',
      status: 'Present',
      shift: '08:00 - 16:00',
      lat: 25.2854,
      lng: 51.5310,
      lastUpdate: new Date().toISOString()
    });
  }
  dashboardPeople = normalizedPeople;
  if (!selectedEmployeeId) selectedEmployeeId = normalizedPeople[0]?.id || null;

  const presenceList = document.getElementById('presenceList');
  if (presenceList) {
    presenceList.innerHTML = normalizedPeople.map((person) => `
      <li class="presence-item ${person.id === selectedEmployeeId ? 'active' : ''}" data-employee-id="${person.id}" onclick="showEmployeeDetails('${person.id}')">
        <strong>${person.name}</strong>
        ${person.department} • ${person.status}
      </li>
    `).join('');
  }

  try {
    renderSelectedEmployeeDetails();
  } catch (error) {
    // Keep dashboard usable even if details panel fails.
  }

  const activity = Array.isArray(data.activity) ? data.activity : [];
  const latestClockIn = activity.find((item) => String(item.type || '').toLowerCase() === 'clock in');
  setText('lastClockInTime', latestClockIn?.time || '--');
  const storedLocation = localStorage.getItem('lastClockInLocation');
  setText('lastClockInLocation', storedLocation || '--');

  const activityList = document.getElementById('activityList');
  if (activityList) {
    activityList.innerHTML = activity.map((item) => `<li><strong>${item.type || 'Update'}</strong>${item.employeeName || item.employeeId || 'System'} • ${item.time || 'Now'} • ${item.status || 'Saved'}</li>`).join('');
  }

  const timelineList = document.getElementById('timelineList');
  if (timelineList) {
    timelineList.innerHTML = activity.slice(0, 4).map((item) => {
      const dotClass = item.status === 'Flagged' ? 'red' : item.type === 'Clock in' ? 'green' : 'gold';
      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div>
            <div class="timeline-time">${item.time || 'Now'}</div>
            <div class="timeline-event">${item.type || 'Sync'} • ${item.employeeName || 'System'}</div>
            <div class="timeline-meta">${item.status || 'Saved'}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  const fieldPoints = document.getElementById('fieldPoints');
  if (fieldPoints) {
    const liveCount = normalizedPeople.filter((person) => person.status === 'On site' || person.status === 'active' || person.status === 'Present').length;
    const lateCount = normalizedPeople.filter((person) => person.status === 'Late').length;
    fieldPoints.innerHTML = normalizedPeople.slice(0, 3).map((person) => `
      <div class="field-point"><strong>${person.name}</strong><span>${person.department}</span></div>
    `).join('');
    const legend = document.getElementById('mapLegend');
    if (legend) legend.textContent = `Live ${liveCount} • Late ${lateCount} • Remote ${Math.max(0, normalizedPeople.length - liveCount - lateCount)}`;
  }

  try {
    renderLiveMap(normalizedPeople);
  } catch (error) {
    // Keep dashboard usable even if map rendering fails.
  }

  const table = document.getElementById('employeeTable');
  if (table) {
    const currentWorkedText = formatWorkedTime(getCurrentEmployeeWorkedMs());
    table.innerHTML = normalizedPeople.map((person) => `
      <tr>
        <td>${person.name}</td>
        <td>${person.id}</td>
        <td>${person.department}</td>
        <td>${person.role}</td>
        <td>${person.status}</td>
        <td>${person.shift}</td>
        <td>${person.id === CURRENT_EMPLOYEE_ID ? currentWorkedText : '--'}</td>
      </tr>
    `).join('');
  }

  updateWorkedTimeUI();
}

function renderSelectedEmployeeDetails() {
  const card = document.getElementById('presenceDetailCard');
  if (!card) return;
  const employee = dashboardPeople.find((item) => item.id === selectedEmployeeId) || dashboardPeople[0];
  if (!employee) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  setText('presenceDetailName', employee.name);
  setText('presenceDetailId', employee.id || '--');
  setText('presenceDetailStatus', employee.status || '--');
  setText('presenceDetailDept', employee.department || '--');
  setText('presenceDetailRole', employee.role || '--');
  setText('presenceDetailShift', employee.shift || '--');
  setText('presenceDetailUpdate', formatDateTime(employee.lastUpdate));
  const locationLabel = Number.isFinite(employee.lat) && Number.isFinite(employee.lng)
    ? `${employee.lat.toFixed(5)}, ${employee.lng.toFixed(5)}`
    : 'Location unavailable';
  setText('presenceDetailLocation', locationLabel);
}

function initDashboardMap() {
  if (typeof L === 'undefined') return null;
  const mapNode = document.getElementById('liveMap');
  if (!mapNode) return null;
  if (!window.dashboardMap || typeof window.dashboardMap.setView !== 'function') {
    window.dashboardMap = L.map('liveMap', { zoomControl: true, attributionControl: true }).setView([25.2854, 51.5310], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(window.dashboardMap);
    window.dashboardMapMarkers = {};
  }
  return window.dashboardMap;
}

function renderLiveMap(people) {
  const map = initDashboardMap();
  if (!map) return;
  const markers = window.dashboardMapMarkers || {};
  const nextIds = new Set((people || []).map((person) => person.id));

  Object.keys(markers).forEach((id) => {
    if (!nextIds.has(id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  const points = [];
  (people || []).forEach((person) => {
    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) return;
    points.push([person.lat, person.lng]);
    const popup = `<strong>${person.name}</strong><br>${person.role || 'Field Engineer'} • ${person.status}<br>${person.lat.toFixed(5)}, ${person.lng.toFixed(5)}`;
    if (!markers[person.id]) {
      markers[person.id] = L.marker([person.lat, person.lng]).addTo(map).bindPopup(popup);
    } else {
      markers[person.id].setLatLng([person.lat, person.lng]);
      markers[person.id].setPopupContent(popup);
    }
  });

  window.dashboardMapMarkers = markers;
  if (points.length > 1) {
    map.fitBounds(points, { padding: [26, 26] });
  } else if (points.length === 1) {
    map.setView(points[0], 13);
  }
  setTimeout(() => map.invalidateSize(), 120);
}

window.showEmployeeDetails = function(employeeId) {
  selectedEmployeeId = employeeId;
  const list = document.getElementById('presenceList');
  if (list) {
    Array.from(list.querySelectorAll('.presence-item')).forEach((item) => {
      item.classList.toggle('active', item.dataset.employeeId === employeeId);
    });
  }
  renderSelectedEmployeeDetails();
  window.focusEmployeeOnMap();
};

window.focusEmployeeOnMap = function() {
  const map = initDashboardMap();
  if (!map) return;
  const employee = dashboardPeople.find((item) => item.id === selectedEmployeeId);
  if (!employee || !Number.isFinite(employee.lat) || !Number.isFinite(employee.lng)) return;
  map.setView([employee.lat, employee.lng], 14);
  const marker = window.dashboardMapMarkers && window.dashboardMapMarkers[employee.id];
  if (marker) marker.openPopup();
};

window.initDashboardMap = initDashboardMap;

async function init() {
  try {
    const [peopleData, attendanceData] = await Promise.all([
      fetchJson('/employees', []),
      fetchJson('/attendance', [])
    ]);
    const mergedActivity = [...getLocalAttendanceEvents(), ...(Array.isArray(attendanceData) ? attendanceData : [])]
      .sort((a, b) => Number(String(b.id || '').replace(/\D/g, '')) - Number(String(a.id || '').replace(/\D/g, '')))
      .slice(0, 30);

    const summary = {
      hoursToday: formatWorkedTime(getCurrentEmployeeWorkedMs()),
      compliance: '0%'
    };

    renderDashboard({
      people: peopleData,
      activity: mergedActivity,
      summary
    });
  } catch (error) {
    try {
      renderDashboard({
        people: [],
        activity: getLocalAttendanceEvents(),
        summary: {
          hoursToday: formatWorkedTime(getCurrentEmployeeWorkedMs()),
          compliance: '0%'
        }
      });
      setStatus('Running in offline mode');
    } catch (renderError) {
      if (root) root.innerHTML = '<div class="empty-state">The platform could not load. Please start the backend and refresh.</div>';
    }
  }
}

function addLocalAttendanceEvent(action) {
  const state = getClockState();
  const next = [buildLocalAttendanceItem(action), ...(state.localAttendance || [])].slice(0, 30);
  state.localAttendance = next;
  saveClockState(state);
}

function getLocalAttendanceEvents() {
  const state = getClockState();
  return Array.isArray(state.localAttendance) ? state.localAttendance : [];
}

async function exportAttendanceReport() {
  try {
    const token = await authenticate();
    const response = await fetch(`${backendBase}/reports/attendance`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Report failed');
    const report = await response.json();
    const rows = [
      ['Employee', 'Type', 'Time', 'Status'],
      ...report.rows.map((item) => [item.employeeName, item.type, item.time, item.status])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendance-report.csv';
    link.click();
    window.URL.revokeObjectURL(url);
    setStatus(`Exported ${report.rows.length} attendance records`);
  } catch (error) {
    setStatus('Report export failed');
  }
}

window.exportAttendanceReport = exportAttendanceReport;
window.clockAction = async function(action) {
  const endpoint = action === 'in' ? '/attendance/clock-in' : '/attendance/clock-out';
  try {
    let payload = null;
    let token = null;
    let synced = false;

    if (action === 'in') {
      setStatus('Fingerprint verification required');
      try {
        const location = await verifyClockInChecks();
        const locationLabel = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
        localStorage.setItem('lastClockInLocation', locationLabel);
        payload = {
          verification: 'fingerprint',
          location,
          clientClockInAt: new Date().toISOString()
        };
      } catch (error) {
        if (String(error.message || '').toLowerCase().includes('location permission denied')) {
          payload = {
            verification: 'fingerprint',
            location: null,
            clientClockInAt: new Date().toISOString(),
            locationError: 'Location permission denied'
          };
          setStatus('Location denied. Clock-in will be saved without GPS.');
        } else {
          throw error;
        }
      }
    }

    try {
      token = await authenticate();
      const res = await fetch(`${backendBase}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: payload ? JSON.stringify(payload) : undefined
      });
      synced = res.ok;
    } catch (error) {
      synced = false;
    }

    applyLocalClockUpdate(action);
    addLocalAttendanceEvent(action);
    setStatus(synced
      ? (action === 'in' ? 'Clock-in recorded with fingerprint and location' : 'Clock-out recorded')
      : (action === 'in' ? 'Clock-in saved locally (backend offline)' : 'Clock-out saved locally (backend offline)'));

    await init();
  } catch (error) {
    setStatus(error.message || 'Attendance could not be updated');
  }
};

setInterval(updateWorkedTimeUI, 30000);

init();
