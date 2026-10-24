/* ==========================================================================
   DagoOS — Main Entry Point
   --------------------------------------------------------------------------
   Loaded by every page. Responsibilities:
     1. Boot Firebase (side-effect of importing firebase-config)
     2. Watch auth state
     3. Owner check (UID must match)
     4. Passphrase gate (sessionStorage-based)
     5. Update header UI + auth gate
     6. Highlight active nav link
     7. Load the page-specific module based on <body data-page="...">
   ========================================================================== */

import "./core/firebase-config.js";
import { onAuthChange, signInWithGoogle, signOutUser } from "./core/auth.js";
import { renderAuthArea } from "./core/ui-helpers.js";
import {
  isOwner, isUnlocked, markUnlocked, clearUnlock, checkPassphrase
} from "./core/app-lock.js";
import { initTheme, mountThemeToggle } from "./core/theme.js";


/* --------------------------------------------------------------------------
   1. NAV HIGHLIGHT
   -------------------------------------------------------------------------- */
function highlightActiveNav() {
  const page = document.body.dataset.page;
  if (!page) return;
  const targetHref = page === "dashboard" ? "index.html" : `${page}.html`;

  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    link.classList.toggle("nav-link--active", href === targetHref);
  });
}


/* --------------------------------------------------------------------------
   2. PAGE MODULE DISPATCH
   -------------------------------------------------------------------------- */
async function loadPageModule(page) {
  switch (page) {
    case "dashboard": {
      const { initDashboard } = await import("./modules/dashboard.js");
      await initDashboard();
      break;
    }
    case "ledger": {
      const { initLedger } = await import("./modules/ledger.js");
      await initLedger();
      break;
    }
    case "journal": {
      const { initJournal } = await import("./modules/journal.js");
      await initJournal();
      break;
    }
    case "academy": {
      const { initAcademy } = await import("./modules/academy.js");
      await initAcademy();
      break;
    }
    case "vault": {
      const { initVault } = await import("./modules/vault.js");
      await initVault();
      break;
    }
    case "todo": {
      const { initTodo } = await import("./modules/todo.js");
      await initTodo();
      break;
    }
    case "tree": {
      const { initLifeTree } = await import("./modules/life-tree.js");
      await initLifeTree();
      break;
    }
    case "settings": {
      const { initSettings } = await import("./modules/settings.js");
      await initSettings();
      break;
    }
   case "challenge": {
      const { initChallenge } = await import("./modules/challenge.js");
      await initChallenge();
      break;
    }
    default:
      console.warn("[DagoOS] Unknown page:", page);
  }
}


/* --------------------------------------------------------------------------
   3. HANDLERS
   -------------------------------------------------------------------------- */
async function handleSignIn() {
  try { await signInWithGoogle(); } catch (_) {}
}

async function handleSignOut() {
  clearUnlock();
  await signOutUser();
}


/* --------------------------------------------------------------------------
   4. AUTH GATE (signed-out state)
   -------------------------------------------------------------------------- */
function setAuthGate(active, message = null) {
  const main = document.querySelector(".main");
  if (!main) return;

  let gate = document.getElementById("auth-gate");

  if (active) {
    if (!gate) {
      gate = document.createElement("div");
      gate.id = "auth-gate";
      gate.className = "auth-gate";
      main.prepend(gate);
    }
    gate.innerHTML = `
      <div class="auth-gate__inner">
        <div class="auth-gate__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            <circle cx="12" cy="16" r="1"/>
          </svg></div>
        <h2 class="auth-gate__title">Private application</h2>
        <p class="auth-gate__text">
          ${message || "DagoOS belongs to a single user. If you are not the owner, this app is not for you. If you are, sign in below."}
        </p>
        <button id="auth-gate-btn" class="btn btn--primary" type="button">
          Sign in with Google
        </button>
      </div>
    `;
    const btn = gate.querySelector("#auth-gate-btn");
    if (btn) btn.addEventListener("click", handleSignIn);
    gate.classList.remove("hidden");
  } else if (gate) {
    gate.remove();
  }
}


/* --------------------------------------------------------------------------
   5. PASS LOCK GATE (owner signed in, but passphrase not yet entered)
   -------------------------------------------------------------------------- */
function setPassLock(active) {
  const main = document.querySelector(".main");
  if (!main) return;

  let lock = document.getElementById("pass-lock");

  if (active) {
    if (!lock) {
      lock = document.createElement("div");
      lock.id = "pass-lock";
      lock.className = "auth-gate";
      main.prepend(lock);
      bindPassLockInput(lock);
    }
    lock.classList.remove("hidden");
  } else if (lock) {
    lock.remove();
  }
}


function bindPassLockInput(lock) {
  lock.innerHTML = `
    <div class="auth-gate__inner">
      <div class="auth-gate__icon"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="7.5" cy="15.5" r="5.5"/>
          <path d="M11.5 11.5 21 3"/>
          <path d="M16 5.5l2.5 2.5"/>
          <path d="M18.5 3l2.5 2.5"/>
        </svg></div>
      <h2 class="auth-gate__title">Welcome back</h2>
      <p class="auth-gate__text">
        Enter your passphrase to unlock DagoOS. You'll only need to do this
        once per browser session.
      </p>
      <form id="pass-lock-form" class="auth-gate__form">
        <input id="pass-lock-input" class="field__input" type="password"
               autocomplete="off" placeholder="Passphrase" required />
        <button class="btn btn--primary" type="submit">Unlock</button>
      </form>
      <p id="pass-lock-error" class="auth-gate__error hidden"></p>
      <p class="auth-gate__signout">
        <button id="pass-lock-signout" class="auth-gate__link" type="button">
          Sign out
        </button>
      </p>
    </div>
  `;

  const form = lock.querySelector("#pass-lock-form");
  const input = lock.querySelector("#pass-lock-input");
  const err = lock.querySelector("#pass-lock-error");
  const signout = lock.querySelector("#pass-lock-signout");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value || "";
    const ok = await checkPassphrase(value);
    if (ok) {
      markUnlocked();
      setPassLock(false);
      document.body.dataset.auth = "in";
      await loadPageModule(document.body.dataset.page);
    } else {
      err.textContent = "Incorrect passphrase.";
      err.classList.remove("hidden");
      input.value = "";
      input.focus();
    }
  });

  signout.addEventListener("click", async () => {
    await handleSignOut();
  });

  setTimeout(() => input.focus(), 50);
}


/* --------------------------------------------------------------------------
   6. GLOBAL LOADING OVERLAY
   -------------------------------------------------------------------------- */
function showLoading(text = "Loading…") {
  let overlay = document.getElementById("dagoos-loading");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "dagoos-loading";
    overlay.className = "dagoos-loading";
    overlay.innerHTML = `
      <div class="dagoos-loading__inner">
        <div class="dagoos-loading__spinner"></div>
        <div class="dagoos-loading__text">${text}</div>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector(".dagoos-loading__text").textContent = text;
    overlay.classList.remove("hidden");
  }
}

function hideLoading() {
  const overlay = document.getElementById("dagoos-loading");
  if (overlay) overlay.classList.add("hidden");
}


/* --------------------------------------------------------------------------
   7. BOOT
   -------------------------------------------------------------------------- */
function boot() {
   initTheme(); 
  console.log("[DagoOS] Booting…");
  highlightActiveNav();
  showLoading("Checking session…");

  onAuthChange(async (user) => {
     mountThemeToggle();  
    const page = document.body.dataset.page;

    // ---- Not signed in ----
    if (!user) {
      console.log("[DagoOS] Signed out");
      document.body.dataset.auth = "out";
      hideLoading();
      setPassLock(false);
      setAuthGate(true);
      renderAuthArea(null, {
        onSignIn:  handleSignIn,
        onSignOut: handleSignOut
      });
      return;
    }

    // ---- Signed in, but not the owner ----
    if (!isOwner(user)) {
      console.warn("[DagoOS] Non-owner sign-in rejected:", user.email);
      await signOutUser();
      document.body.dataset.auth = "out";
      hideLoading();
      setPassLock(false);
      setAuthGate(true, "Access denied. This application belongs to a single user.");
      renderAuthArea(null, {
        onSignIn:  handleSignIn,
        onSignOut: handleSignOut
      });
      return;
    }

    // ---- Owner, but not unlocked this session ----
    console.log(`[DagoOS] Owner detected: ${user.email}`);
    document.body.dataset.auth = "out";      // keep content hidden
    hideLoading();
    setAuthGate(false);
    setPassLock(true);
    renderAuthArea(user, {
      onSignIn:  handleSignIn,
      onSignOut: handleSignOut
    });

    // If already unlocked (navigated between pages), skip the prompt
    if (isUnlocked()) {
      console.log("[DagoOS] Session already unlocked");
      setPassLock(false);
      document.body.dataset.auth = "in";
      await loadPageModule(page);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
