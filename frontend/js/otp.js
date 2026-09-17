/**
 * Reusable 6-digit OTP box widget.
 *
 * Usage:
 *   const otp = OtpWidget.mount('email-otp', { length: 6, onComplete: (code) => {...} });
 *   otp.clear();
 *   otp.showError();
 *   otp.getValue();
 *
 * Also provides countdown-timer helpers used for both the "code expires in"
 * timer and the "resend code in" cooldown, since both screens need them.
 */

const OtpWidget = (() => {
  const timers = new Map(); // key -> intervalId, so re-starting a timer clears the old one

  function mount(groupKey, { length = 6, onComplete } = {}) {
    const container = document.querySelector(`[data-otp-group="${groupKey}"]`);
    if (!container) return null;

    container.innerHTML = '';
    const inputs = [];
    for (let i = 0; i < length; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 1;
      input.className = 'otp-box';
      input.setAttribute('aria-label', `Digit ${i + 1}`);
      inputs.push(input);
      container.appendChild(input);
    }

    function currentValue() {
      return inputs.map((i) => i.value).join('');
    }

    function focusIndex(idx) {
      const target = inputs[Math.max(0, Math.min(idx, inputs.length - 1))];
      target.focus();
      target.select();
    }

    inputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        const digit = e.target.value.replace(/[^0-9]/g, '').slice(-1);
        e.target.value = digit;
        input.classList.remove('is-error');
        if (digit) {
          input.classList.add('is-filled');
          if (idx < inputs.length - 1) focusIndex(idx + 1);
        } else {
          input.classList.remove('is-filled');
        }
        if (currentValue().length === length && onComplete) onComplete(currentValue());
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          focusIndex(idx - 1);
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          focusIndex(idx - 1);
        } else if (e.key === 'ArrowRight' && idx < inputs.length - 1) {
          focusIndex(idx + 1);
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, length);
        if (!pasted) return;
        pasted.split('').forEach((digit, i) => {
          if (inputs[i]) {
            inputs[i].value = digit;
            inputs[i].classList.add('is-filled');
          }
        });
        focusIndex(Math.min(pasted.length, length - 1));
        if (pasted.length === length && onComplete) onComplete(currentValue());
      });
    });

    // Autofocus the first box whenever this screen becomes active.
    setTimeout(() => inputs[0] && inputs[0].focus(), 50);

    return {
      getValue: currentValue,
      clear() {
        inputs.forEach((i) => {
          i.value = '';
          i.classList.remove('is-error', 'is-filled');
        });
        focusIndex(0);
      },
      showError() {
        inputs.forEach((i) => i.classList.add('is-error'));
      },
      disable() {
        inputs.forEach((i) => (i.disabled = true));
      },
      enable() {
        inputs.forEach((i) => (i.disabled = false));
      },
      focusFirst() {
        focusIndex(0);
      },
    };
  }

  function formatMMSS(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /**
   * Starts a countdown from `seconds`, updating the element matched by
   * `selector` every second, and calling `onExpire` once it hits zero.
   * Returns a stop() function. Timers are keyed so re-calling with the
   * same key clears any previous interval (e.g. after a resend).
   */
  function startCountdown(key, selector, seconds, onExpire) {
    stopCountdown(key);
    const el = document.querySelector(selector);
    let remaining = seconds;
    if (el) el.textContent = formatMMSS(remaining);

    const intervalId = setInterval(() => {
      remaining -= 1;
      if (el) el.textContent = formatMMSS(remaining);
      if (remaining <= 0) {
        clearInterval(intervalId);
        timers.delete(key);
        if (onExpire) onExpire();
      }
    }, 1000);
    timers.set(key, intervalId);

    return () => stopCountdown(key);
  }

  function stopCountdown(key) {
    if (timers.has(key)) {
      clearInterval(timers.get(key));
      timers.delete(key);
    }
  }

  /**
   * Wires up an entire OTP screen: the boxes, the expiry timer, the resend
   * cooldown/link, and the expired/error banners. Centralizes logic shared
   * by email-otp, mobile-otp, mfa-verification, and login-otp so each
   * screen's flow code just supplies callbacks.
   *
   * config:
   *   onSubmit(code)      -> called when all boxes are filled
   *   onResend()          -> called when the user triggers a resend
   *   maxAttemptsMessage  -> optional static copy for the max-attempts state
   */
  function controlScreen(groupKey, config) {
    const errorEl = document.querySelector(`[data-otp-error="${groupKey}"]`);
    const expiredEl = document.querySelector(`[data-otp-expired="${groupKey}"]`);
    const maxAttemptsEl = document.querySelector(`[data-otp-maxattempts="${groupKey}"]`);
    const timerRow = document.querySelector(`[data-otp-timer="${groupKey}"]`);
    const resendRow = document.querySelector(`[data-otp-resend-row="${groupKey}"]`);
    const resendBtn = document.querySelector(`[data-otp-resend-btn="${groupKey}"]`);
    const resendCountdownSel = `[data-otp-resend-countdown="${groupKey}"]`;
    const codeCountdownSel = `[data-otp-countdown="${groupKey}"]`;

    const widget = mount(groupKey, { onComplete: (code) => config.onSubmit && config.onSubmit(code) });

    function hideAllBanners() {
      if (errorEl) errorEl.hidden = true;
      if (expiredEl) expiredEl.hidden = true;
      if (maxAttemptsEl) maxAttemptsEl.hidden = true;
    }

    function showExpiredState() {
      hideAllBanners();
      if (expiredEl) expiredEl.hidden = false;
      if (timerRow) timerRow.hidden = true;
      if (resendRow) resendRow.hidden = true;
      if (resendBtn) resendBtn.hidden = false;
      if (widget) widget.disable();
    }

    function showMaxAttemptsState() {
      hideAllBanners();
      if (maxAttemptsEl) maxAttemptsEl.hidden = false;
      if (timerRow) timerRow.hidden = true;
      if (resendRow) resendRow.hidden = true;
      if (resendBtn) resendBtn.hidden = false;
      if (widget) widget.disable();
    }

    function showInvalidCode(message) {
      hideAllBanners();
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
      if (widget) widget.showError();
    }

    function reset({ ttlSeconds, resendCooldownSeconds }) {
      hideAllBanners();
      if (timerRow) timerRow.hidden = false;
      if (resendBtn) resendBtn.hidden = true;
      if (resendRow) {
        resendRow.hidden = false;
        resendRow.classList.remove('is-clickable');
      }
      if (widget) {
        widget.enable();
        widget.clear();
      }

      startCountdown(`${groupKey}-expiry`, codeCountdownSel, ttlSeconds, showExpiredState);
      startCountdown(`${groupKey}-resend`, resendCountdownSel, resendCooldownSeconds, () => {
        if (resendRow) {
          resendRow.classList.add('is-clickable');
          resendRow.innerHTML = '<span class="resend-link">Resend code</span>';
          resendRow.querySelector('.resend-link').addEventListener('click', () => {
            config.onResend && config.onResend();
          });
        }
      });
    }

    if (resendBtn) {
      resendBtn.addEventListener('click', () => config.onResend && config.onResend());
    }

    return { widget, reset, showInvalidCode, showExpiredState, showMaxAttemptsState, hideAllBanners };
  }

  return { mount, startCountdown, stopCountdown, formatMMSS, controlScreen };
})();
