

const Validation = (() => {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MOBILE_RE = /^[0-9]{7,15}$/;

  function isValidEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
  }

  function isValidMobile(value) {
    return MOBILE_RE.test(String(value || '').replace(/\s+/g, ''));
  }

  function passwordRules(password) {
    const pw = password || '';
    return {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      number: /[0-9]/.test(pw),
      special: /[^A-Za-z0-9]/.test(pw),
    };
  }

  function passwordIsValid(password) {
    const rules = passwordRules(password);
    return Object.values(rules).every(Boolean);
  }

  /** Returns 'weak' | 'medium' | 'strong' — kept in sync with backend authService.passwordStrength(). */
  function passwordStrength(password) {
    const pw = password || '';
    if (!pw) return 'weak';
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return 'weak';
    if (score <= 4) return 'medium';
    return 'strong';
  }

  return { isValidEmail, isValidMobile, passwordRules, passwordIsValid, passwordStrength };
})();
