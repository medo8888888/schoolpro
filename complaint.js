(function () {
  const COMPLAINT_EMAIL = 'abassmahmoud@gmail.com';
  const COMPLAINT_PHONE = '+97433775363';
  const COMPLAINTS_KEY = 'FIELDTRACK_COMPLAINTS';
  const DEPARTMENT_PROBLEMS = {
    'Human Resources': ['Leave request not reviewed', 'Workplace conflict', 'Missing employee record', 'Unclear company policy'],
    'Finance / Accounting': ['Salary or payment is incorrect', 'Expense reimbursement is delayed', 'Invoice or collection issue', 'Payroll record is missing'],
    'Sales': ['Client follow-up is missing', 'Sales target is incorrect', 'Commission is not recorded', 'Customer complaint needs escalation'],
    'Field Operations': ['Assignment details are wrong', 'Site visit cannot be completed', 'Work schedule conflict', 'Missing equipment or materials'],
    'Engineering / Technical': ['Technical task is blocked', 'Project information is incomplete', 'Inspection result is incorrect', 'Safety or equipment issue'],
    'IT / Systems': ['Cannot log in', 'Application is not working', 'GPS or location is incorrect', 'Data is missing or not synchronized'],
    'Management': ['Approval is delayed', 'Team workload is not balanced', 'Attendance issue needs review', 'Policy or process needs clarification'],
    'Customer Support': ['Customer complaint needs action', 'Response is delayed', 'Customer information is incorrect', 'Service issue needs escalation']
  };

  function getText(id) {
    const node = document.getElementById(id);
    return node ? String(node.value || '').trim() : '';
  }

  function setStatus(message, error) {
    const node = document.getElementById('complaintStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `complaint-status${error ? ' error' : ''}`;
  }

  function saveComplaint(complaint) {
    let complaints = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(COMPLAINTS_KEY) || '[]');
      complaints = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      complaints = [];
    }
    complaints.unshift(complaint);
    localStorage.setItem(COMPLAINTS_KEY, JSON.stringify(complaints.slice(0, 50)));
  }

  function renderDepartmentProblems() {
    const form = document.getElementById('complaintForm');
    if (!form || document.getElementById('complaintDepartment')) return;
    const department = document.createElement('select');
    department.id = 'complaintDepartment';
    department.setAttribute('aria-label', 'Department');
    department.innerHTML = '<option value="">Choose department</option>' + Object.keys(DEPARTMENT_PROBLEMS)
      .map((name) => `<option value="${name}">${name}</option>`).join('');
    const category = document.getElementById('complaintCategory');
    form.insertBefore(department, category);

    const suggestions = document.createElement('div');
    suggestions.id = 'complaintProblemSuggestions';
    suggestions.className = 'complaint-problems';
    form.insertBefore(suggestions, category);
    department.addEventListener('change', () => {
      const problems = DEPARTMENT_PROBLEMS[department.value] || [];
      suggestions.innerHTML = problems.length
        ? '<span>Common problems:</span>' + problems.map((problem) => `<button type="button" data-problem="${problem}">${problem}</button>`).join('')
        : '<span>Select a department to see common problems.</span>';
      suggestions.querySelectorAll('[data-problem]').forEach((button) => {
        button.addEventListener('click', () => {
          const description = document.getElementById('complaintDescription');
          if (description) description.value = button.dataset.problem + ': ';
          if (description) description.focus();
        });
      });
    });
  }

  function submitComplaint(event) {
    event.preventDefault();
    const channel = event.submitter && event.submitter.dataset.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const category = getText('complaintCategory');
    const department = getText('complaintDepartment');
    const description = getText('complaintDescription');
    const name = localStorage.getItem('employeeUsername') || localStorage.getItem('FIELDTRACK_AUTH_SESSION') || 'Workforce user';
    if (!description) {
      setStatus('Please describe the issue before sending.', true);
      return;
    }

    const complaint = {
      id: `complaint-${Date.now()}`,
      category: category || 'General complaint',
      department: department || 'General',
      description,
      submittedBy: name,
      submittedAt: new Date().toISOString(),
      contactEmail: COMPLAINT_EMAIL,
      contactPhone: COMPLAINT_PHONE
    };
    saveComplaint(complaint);

    const subject = encodeURIComponent(`Workforce complaint: ${complaint.department} - ${complaint.category}`);
    const body = encodeURIComponent([
      `Department: ${complaint.department}`,
      `Complaint category: ${complaint.category}`,
      `Submitted by: ${complaint.submittedBy}`,
      `Submitted at: ${new Date(complaint.submittedAt).toLocaleString()}`,
      '',
      complaint.description
    ].join('\n'));
    const whatsappLink = document.getElementById('complaintWhatsappLink');
    if (whatsappLink) {
      const whatsappMessage = encodeURIComponent(`Department: ${complaint.department}\nComplaint: ${complaint.category}\n\n${complaint.description}`);
      whatsappLink.href = `https://wa.me/97433775363?text=${whatsappMessage}`;
    }
    if (channel === 'whatsapp') {
      window.location.href = `https://wa.me/97433775363?text=${encodeURIComponent([
        `Workforce complaint - ${complaint.department}`,
        `Category: ${complaint.category}`,
        `Submitted by: ${complaint.submittedBy}`,
        '',
        complaint.description
      ].join('\n'))}`;
      setStatus(`Complaint opened in WhatsApp for ${COMPLAINT_PHONE}.`);
      return;
    }
    window.location.href = `mailto:${COMPLAINT_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(`Complaint opened in your email app for ${COMPLAINT_EMAIL}.`);
  }

  function bindComplaintForm() {
    const form = document.getElementById('complaintForm');
    const emailLink = document.getElementById('complaintEmailLink');
    const phoneLink = document.getElementById('complaintPhoneLink');
    const whatsappLink = document.getElementById('complaintWhatsappLink');
    if (emailLink) emailLink.href = `mailto:${COMPLAINT_EMAIL}`;
    if (phoneLink) phoneLink.href = `tel:${COMPLAINT_PHONE}`;
    if (whatsappLink) whatsappLink.href = `https://wa.me/97433775363?text=${encodeURIComponent('Hello, I want to report a complaint.')}`;
    renderDepartmentProblems();
    if (form) form.addEventListener('submit', submitComplaint);
  }

  window.addEventListener('load', bindComplaintForm);
})();
