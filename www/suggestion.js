(function () {
  const SUGGESTION_EMAIL = 'abassmahmoud@gmail.com';
  const SUGGESTION_PHONE = '+97433775363';
  const SUGGESTIONS_KEY = 'FIELDTRACK_SUGGESTIONS';

  function getText(id) {
    const node = document.getElementById(id);
    return node ? String(node.value || '').trim() : '';
  }

  function setStatus(message, error) {
    const node = document.getElementById('suggestionStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `complaint-status${error ? ' error' : ''}`;
  }

  function saveSuggestion(suggestion) {
    let suggestions = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || '[]');
      suggestions = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      suggestions = [];
    }
    suggestions.unshift(suggestion);
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions.slice(0, 100)));
  }

  function submitSuggestion(event) {
    event.preventDefault();
    const channel = event.submitter && event.submitter.dataset.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const category = getText('suggestionCategory');
    const description = getText('suggestionDescription');
    const name = localStorage.getItem('employeeUsername') || localStorage.getItem('FIELDTRACK_AUTH_SESSION') || 'Workforce user';
    if (!description) {
      setStatus('Please describe your suggestion before sending.', true);
      return;
    }

    const suggestion = {
      id: `suggestion-${Date.now()}`,
      category: category || 'General suggestion',
      description,
      submittedBy: name,
      submittedAt: new Date().toISOString()
    };
    saveSuggestion(suggestion);

    const subject = encodeURIComponent(`Workforce suggestion: ${suggestion.category}`);
    const body = encodeURIComponent([
      `Suggestion category: ${suggestion.category}`,
      `Submitted by: ${suggestion.submittedBy}`,
      `Submitted at: ${new Date(suggestion.submittedAt).toLocaleString()}`,
      '',
      suggestion.description
    ].join('\n'));

    if (channel === 'whatsapp') {
      window.location.href = `https://wa.me/97433775363?text=${encodeURIComponent([
        `Workforce suggestion - ${suggestion.category}`,
        `Submitted by: ${suggestion.submittedBy}`,
        '',
        suggestion.description
      ].join('\n'))}`;
      setStatus(`Suggestion opened in WhatsApp for ${SUGGESTION_PHONE}.`);
      return;
    }
    window.location.href = `mailto:${SUGGESTION_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(`Suggestion opened in your email app for ${SUGGESTION_EMAIL}.`);
  }

  function bindSuggestionForm() {
    const form = document.getElementById('suggestionForm');
    const emailLink = document.getElementById('suggestionEmailLink');
    const phoneLink = document.getElementById('suggestionPhoneLink');
    const whatsappLink = document.getElementById('suggestionWhatsappLink');
    if (emailLink) emailLink.href = `mailto:${SUGGESTION_EMAIL}`;
    if (phoneLink) phoneLink.href = `tel:${SUGGESTION_PHONE}`;
    if (whatsappLink) whatsappLink.href = `https://wa.me/97433775363?text=${encodeURIComponent('Hello, I have a suggestion.')}`;
    if (form) form.addEventListener('submit', submitSuggestion);
  }

  window.addEventListener('load', bindSuggestionForm);
})();
