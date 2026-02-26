/**
 * Google Password Manager bridge for Made in Heaven agents 🖤
 *
 * Chrome Canary is logged into gothravenllm@gmail.com.
 * Google Password Manager = all saved creds sync across sessions automatically.
 *
 * After any login, Chrome shows "Save password?" — this module accepts it.
 * Future agent runs: Chrome auto-fills the form. Zero credentials in .env needed.
 *
 * Usage:
 *   import { acceptSavePassword, checkSavedPasswords, waitForAutofill } from "./password-manager.js";
 */

// ── Accept Chrome's "Save Password?" bubble ───────────────────────────────────
// Chrome shows this after a successful form login. Call within 3s of login.
export const ACCEPT_SAVE_PASSWORD = `() => {
  // Method 1: Click the "Save" button in Chrome's infobar/bubble
  const saveBtn = document.querySelector("cr-button#save") ||
                  document.querySelector("[aria-label='Save password']") ||
                  document.querySelector("button[data-save-pwd]");
  if (saveBtn) { saveBtn.click(); return "clicked save button"; }

  // Method 2: Dispatch to Chrome's native credential manager
  if (window.PasswordsPrivate) {
    return "PasswordsPrivate API available";
  }
  return "save dialog not found (may have appeared in browser chrome UI, not page)";
}`;

// ── Wait for Chrome Autofill to populate a form ───────────────────────────────
// Chrome auto-fills saved credentials into username/password inputs.
// Call after navigate — wait for autofill, then just submit.
export const WAIT_FOR_AUTOFILL = (timeout = 3000) => `async () => {
  const start = Date.now();
  while (Date.now() - start < ${timeout}) {
    const pwd = document.querySelector("input[type=password]");
    const user = document.querySelector("input[type=email], input[type=text], input[autocomplete=username]");
    if (pwd?.value?.length > 0 || user?.value?.length > 0) {
      return {
        userFilled: user ? user.value.slice(0,30) + "..." : "none",
        passwordFilled: pwd?.value?.length > 0,
        source: "chrome-autofill"
      };
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return { userFilled: false, passwordFilled: false, source: "timeout" };
}`;

// ── Trigger Chrome autofill on a focused input ────────────────────────────────
export const TRIGGER_AUTOFILL = `() => {
  const inputs = document.querySelectorAll("input[type=email], input[type=text], input[type=password], input[autocomplete=username]");
  inputs.forEach(inp => {
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
  return "autofill triggered on " + inputs.length + " inputs";
}`;

// ── Check saved passwords via Chrome settings page ────────────────────────────
// Navigate to chrome://password-manager/passwords to see all saved creds.
// Returns instructions (can't scrape chrome:// pages but can navigate to them).
export function getSavedPasswordsInfo() {
  return {
    settingsUrl: "chrome://password-manager/passwords",
    exportUrl: "chrome://password-manager/settings",
    note: "Open Chrome Canary → chrome://password-manager to view/manage all saved passwords",
    googleAccountSync: "gothravenllm@gmail.com",
    syncedAcross: "All Chrome instances logged into gothravenllm@gmail.com",
  };
}

// ── Sites where creds are saved (tracked manually) ───────────────────────────
export const SAVED_CREDENTIALS = {
  "x.com": {
    username: "gothravenllm@gmail.com",
    savedAt: "2026-02-26",
    method: "Made in Heaven autonomous login",
    status: "✅ confirmed working",
  },
  // Add more as agents log in to new sites:
  // "pump.fun": { username: "...", savedAt: "...", method: "..." },
  // "polymarket.com": { username: "...", savedAt: "...", method: "..." },
};

// ── Agent login helper — try autofill first, fall back to manual ──────────────
export function buildLoginTask(site, username, purpose) {
  return `
Go to ${site} and log in as ${username}.

STRATEGY (in order — stop when one works):
1. CHECK AUTOFILL: Take a snapshot. If username/password fields are already filled by Chrome, just click Submit.
2. TRIGGER AUTOFILL: Click the username field. Wait 2 seconds. Check if Chrome auto-filled from Google Password Manager.
3. GOOGLE OAUTH: If there's a "Sign in with Google" button and gothravenllm@gmail.com appears, click it.
4. MANUAL: Only if all above fail — fill email, click Next, fill password.

After successful login:
- Check for Chrome's "Save password?" bubble and accept it
- Confirm you're logged in by checking the page title/URL
- Report which login method worked

Purpose: ${purpose}
`.trim();
}
