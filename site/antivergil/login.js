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

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("Google Identity Services timed out"));
    }, 10000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Google Identity Services unavailable"));
    };
    document.head.appendChild(script);
  });
}

function handleGoogleCredential(response) {
  try {
    let base64 = String(response.credential || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(base64));
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
  }
}

async function initializeGoogleLogin() {
  clearStatus();
  const button = $("#google-login");
  const mount = $("#google-login-mount");
  const clientId = String(window.COLUMBIA_AUTH?.googleClientId || "").trim();
  if (!clientId || !/^https?:$/.test(location.protocol)) {
    $("#email-form").hidden = false;
    setStatus("Google OAuth is not configured in this preview. Continue with your @columbia.edu email.", "info");
    requestAnimationFrame(() => $("#email-form input")?.focus());
    return;
  }

  try {
    await loadGoogleScript();
    if (!window.google?.accounts?.id) throw new Error("Google Identity Services unavailable");
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      hd: "columbia.edu",
    });
    mount.innerHTML = "";
    window.google.accounts.id.renderButton(mount, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: 390,
    });
    button.hidden = true;
  } catch (_) {
    $("#email-form").hidden = false;
    setStatus("Google sign-in is unavailable. Use your @columbia.edu email to continue.", "error");
    requestAnimationFrame(() => $("#email-form input")?.focus());
  }
}

$("#login-back").href = safeNextPath();
$("#google-login").addEventListener("click", initializeGoogleLogin);
$("#email-form input").addEventListener("input", clearStatus);
$("#email-form").addEventListener("submit", (event) => {
  event.preventDefault();
  localSignIn(new FormData(event.currentTarget).get("email"));
});

initializeGoogleLogin();
