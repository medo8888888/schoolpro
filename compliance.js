(function () {
  const ISSUE_KEY = 'FIELDTRACK_COMPLIANCE_ISSUES';
  const FIX_KEY = 'FIELDTRACK_COMPLIANCE_FIXES';

  function readObject(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function escapeText(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function render() {
    const panel = document.querySelector('[data-compliance-panel]');
    if (!panel) return;
    const issues = Array.isArray(readObject(ISSUE_KEY, [])) ? readObject(ISSUE_KEY, []) : [];
    const fixes = readObject(FIX_KEY, {});
    const unresolved = issues.filter((issue) => !fixes[issue.key]);
    panel.innerHTML = `
      <div class="compliance-panel-head"><strong>Compliance suggestions</strong><span>${unresolved.length ? `${unresolved.length} issue${unresolved.length === 1 ? '' : 's'} to review` : 'No unresolved issues'}</span></div>
      <p class="compliance-panel-help">Manager recommendations shared from today's attendance review.</p>
      <div class="compliance-panel-list">${issues.length ? issues.map((issue) => {
        const resolved = Boolean(fixes[issue.key]);
        return `<div class="compliance-panel-item${resolved ? ' resolved' : ''}"><div><strong>${escapeText(issue.title)}</strong><span>${escapeText(resolved ? 'Fix suggested by manager.' : issue.detail)}</span></div><button type="button" data-compliance-fix="${encodeURIComponent(issue.key)}">${resolved ? 'Suggested' : 'Acknowledge'}</button></div>`;
      }).join('') : '<div class="compliance-panel-empty">No compliance issues have been published yet.</div>'}</div>`;
    panel.querySelectorAll('[data-compliance-fix]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = decodeURIComponent(button.dataset.complianceFix || '');
        const nextFixes = readObject(FIX_KEY, {});
        nextFixes[key] = { suggestedAt: new Date().toISOString(), acknowledgedBy: 'employee-or-accountant' };
        localStorage.setItem(FIX_KEY, JSON.stringify(nextFixes));
        render();
      });
    });
  }

  window.addEventListener('storage', render);
  window.addEventListener('load', render);
})();
