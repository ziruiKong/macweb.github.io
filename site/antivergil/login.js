const STORAGE_KEY = "cu-auth-user";
const DEFAULT_NEXT = "index.html#/browse";
const $ = (selector) => document.querySelector(selector);

function isColumbiaEmail(value) {
  return /^[^\s@]+@columbia\.edu$/i.test(String(value || "").trim());
}

function safeNextPath() {
  const raw = new URLSearchParams(location.search).get("next");
  if (!raw) return DEFAULT_NEXT;
  try {
    const next = new URL(raw, location.href);
    if (next.origin === location.origin) return `${next.pathname}${next.search}${next.hash}`;
  } catch (_) {}
  return DEFAULT_NEXT;
}

function setStatus(message, type = "error") {
  const status = $("#login-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", type === "error");
  status.classList.toggle("is-info", type === "info");
  status.hidden = false;
}

function clearStatus() {
  const status = $("#login-status");
  if (!status) return;
  status.hidden = true;
  status.textContent = "";
  status.classList.remove("is-error", "is-info");
}

function saveUser(user) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (_) {}
}

function completeSignIn(user) {
  if (!isColumbiaEmail(user.email)) {
    setStatus("Only Columbia University accounts can continue.", "error");
    return;
  }
  saveUser({ ...user, email: user.email.toLowerCase() });
  location.assign(safeNextPath());
}

function localSignIn(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!isColumbiaEmail(clean)) {
    setStatus("Use a Columbia email ending in @columbia.edu.", "error");
    return;
  }
  const name = clean.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  completeSignIn({ name, email: clean, picture: null, provider: "local" });
}

let googleTokenClient = null;
let googleTokenClientId = "";

function loadGoogleScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google Identity Services unavailable"));
    document.head.appendChild(script);
  });
}

async function handleGoogleTokenResponse(response) {
  const button = $("#google-login");
  try {
    if (response?.error) throw new Error(response.error_description || response.error);
    if (!response?.access_token) throw new Error("Google did not return an access token");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${response.access_token}` },
    });
    if (!profileResponse.ok) throw new Error(`Google profile request failed (${profileResponse.status})`);
    const payload = await profileResponse.json();
    if (!isColumbiaEmail(payload.email)) {
      setStatus("Use your Columbia University Google account.", "error");
      return;
    }
    completeSignIn({
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      sub: payload.sub,
      provider: "google",
    });
  } catch (_) {
    setStatus("Google sign-in failed. Try again.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function startGoogleLogin() {
  clearStatus();
  const button = $("#google-login");
  const clientId = String(window.COLUMBIA_AUTH?.googleClientId || "").trim();
  if (!clientId || !/^https?:$/.test(location.protocol)) {
    $("#email-form").hidden = false;
    setStatus("Google OAuth is not configured in this preview. Continue with your @columbia.edu email.", "info");
    requestAnimationFrame(() => $("#email-form input")?.focus());
    return;
  }

  button.disabled = true;
  try {
    await loadGoogleScript();
    if (!window.google?.accounts?.oauth2) throw new Error("Google OAuth client unavailable");
    if (!googleTokenClient || googleTokenClientId !== clientId) {
      googleTokenClientId = clientId;
      googleTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: handleGoogleTokenResponse,
        error_callback: (error) => {
          setStatus(error?.message || "Google sign-in was cancelled.", "error");
          button.disabled = false;
        },
      });
    }
    googleTokenClient.requestAccessToken({ prompt: "select_account" });
  } catch (_) {
    button.disabled = false;
    $("#email-form").hidden = false;
    setStatus("Google sign-in is unavailable. Use your @columbia.edu email to continue.", "error");
    requestAnimationFrame(() => $("#email-form input")?.focus());
  }
}

$("#login-back").href = safeNextPath();
$("#google-login").addEventListener("click", startGoogleLogin);
$("#email-form input").addEventListener("input", clearStatus);
$("#email-form").addEventListener("submit", (event) => {
  event.preventDefault();
  localSignIn(new FormData(event.currentTarget).get("email"));
});
