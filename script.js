"use strict";

/* =========================================================
   SIH DATA SUB
   Frontend JavaScript
   Backend: http://localhost:5100
========================================================= */

const API_BASE = "http://localhost:5100";

const TOKEN_KEY = "sih_token";
const USER_KEY = "sih_user";

let currentUser = null;
let currentService = null;

/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));

  currentUser = user || {};
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  currentUser = null;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   LOADING
========================================================= */

function showLoading(message = "Please wait...") {
  const overlay = $("loadingOverlay");
  const text = $("loadingText");

  if (text) text.textContent = message;
  if (overlay) overlay.classList.add("active");
}

function hideLoading() {
  const overlay = $("loadingOverlay");
  if (overlay) overlay.classList.remove("active");
}

/* =========================================================
   TOAST
========================================================= */

function showToast(message, type = "info") {
  const toast = $("toast");
  const toastMessage = $("toastMessage");
  const toastIcon = $("toastIcon");

  if (!toast || !toastMessage) {
    console.log(message);
    return;
  }

  toastMessage.textContent = message;

  if (toastIcon) {
    if (type === "success") {
      toastIcon.textContent = "✓";
    } else if (type === "error") {
      toastIcon.textContent = "!";
    } else {
      toastIcon.textContent = "i";
    }
  }

  toast.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

/* =========================================================
   MODALS
========================================================= */

function openModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove("active");
}

window.closeModal = closeModal;

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-modal]");

  if (closeButton) {
    closeModal(closeButton.dataset.closeModal);
  }

  if (event.target.classList.contains("modal-overlay")) {
    const modal = event.target.closest(".modal");
    if (modal && modal.id) {
      closeModal(modal.id);
    }
  }
});

/* =========================================================
   API REQUEST
========================================================= */

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(
      "Cannot connect to SIH DATA SUB backend. Make sure the server is running on port 5100."
    );
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (response.status === 401) {
    clearSession();
    showAuthScreen();
    throw new Error(data.message || "Your session has expired.");
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

/* =========================================================
   SCREEN CONTROL
========================================================= */

function showAuthScreen() {
  const splash = $("splashScreen");
  const auth = $("authScreen");
  const main = $("mainScreen");

  if (splash) splash.classList.remove("active");
  if (main) main.classList.remove("active");
  if (auth) auth.classList.add("active");

  switchAuthTab("login");
}

function showMainScreen() {
  const splash = $("splashScreen");
  const auth = $("authScreen");
  const main = $("mainScreen");

  if (splash) splash.classList.remove("active");
  if (auth) auth.classList.remove("active");
  if (main) main.classList.add("active");

  updateUserDisplay();
  showPage("homePage");

  loadDashboard();
}

/* =========================================================
   SPLASH
========================================================= */

function startSplash() {
  const splash = $("splashScreen");
  const progress = $("splashProgress");

  if (!splash) {
    initializeApp();
    return;
  }

  splash.classList.add("active");

  let value = 0;

  const timer = setInterval(() => {
    value += 5;

    if (progress) {
      progress.style.width = `${Math.min(value, 100)}%`;
    }

    if (value >= 100) {
      clearInterval(timer);

      setTimeout(() => {
        initializeApp();
      }, 400);
    }
  }, 35);
}

/* =========================================================
   CONNECTION CHECK
========================================================= */

async function checkConnection(showMessage = false) {
  const status = $("connectionStatus");

  if (status) {
    status.textContent = "Connecting...";
    status.classList.remove("connected", "disconnected");
  }

  try {
    const data = await apiRequest("/api/health");

    if (status) {
      status.textContent = "Connected";
      status.classList.add("connected");
      status.classList.remove("disconnected");
    }

    if (showMessage) {
      showToast("Backend connected successfully.", "success");
    }

    return data;
  } catch (error) {
    if (status) {
      status.textContent = "Not Connected";
      status.classList.add("disconnected");
      status.classList.remove("connected");
    }

    if (showMessage) {
      showToast(error.message, "error");
    }

    return null;
  }
}

/* =========================================================
   AUTH TABS
========================================================= */

function switchAuthTab(tab) {
  const loginTab = $("loginTab");
  const signupTab = $("signupTab");
  const loginForm = $("loginForm");
  const signupForm = $("signupForm");

  if (tab === "signup") {
    loginTab?.classList.remove("active");
    signupTab?.classList.add("active");

    loginForm?.classList.remove("active");
    signupForm?.classList.add("active");
  } else {
    signupTab?.classList.remove("active");
    loginTab?.classList.add("active");

    signupForm?.classList.remove("active");
    loginForm?.classList.add("active");
  }
}

$("loginTab")?.addEventListener("click", () => {
  switchAuthTab("login");
});

$("signupTab")?.addEventListener("click", () => {
  switchAuthTab("signup");
});

/* =========================================================
   LOGIN
========================================================= */

$("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value || "";
  const button = $("loginButton");
  const message = $("loginMessage");

  if (!email || !password) {
    if (message) message.textContent = "Enter your email and password.";
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Logging in...";
  }

  if (message) message.textContent = "";

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password
      })
    });

    if (!data.success || !data.token) {
      throw new Error(data.message || "Login failed.");
    }

    saveSession(data.token, data.user);

    if (message) {
      message.textContent = "Login successful.";
    }

    showToast("Welcome back!", "success");

    setTimeout(() => {
      showMainScreen();
    }, 400);

  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }

    showToast(error.message, "error");

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Login";
    }
  }
});

/* =========================================================
   SEND OTP
========================================================= */

$("sendOtpButton")?.addEventListener("click", async () => {
  const name = $("signupName")?.value.trim();
  const phone = $("signupPhone")?.value.trim();
  const email = $("signupEmail")?.value.trim();
  const button = $("sendOtpButton");
  const message = $("signupMessage");

  if (!name) {
    showToast("Enter your full name.", "error");
    return;
  }

  if (!phone) {
    showToast("Enter your phone number.", "error");
    return;
  }

  if (!email) {
    showToast("Enter your Gmail address.", "error");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Sending OTP...";
  }

  if (message) message.textContent = "";

  try {
    const data = await apiRequest("/api/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({
        name,
        phone,
        email
      })
    });

    if (!data.success) {
      throw new Error(data.message || "Could not send OTP.");
    }

    showToast(
      "OTP sent to your Gmail. Check your inbox.",
      "success"
    );

    if (message) {
      message.textContent =
        "OTP sent successfully. Enter the 6-digit code.";
    }

    const otpInput = $("signupOtp");

    if (otpInput) {
      otpInput.focus();
    }

    let seconds = 30;

    if (button) {
      button.textContent = `Resend OTP (${seconds}s)`;

      const countdown = setInterval(() => {
        seconds--;

        if (seconds <= 0) {
          clearInterval(countdown);
          button.disabled = false;
          button.textContent = "Send OTP";
        } else {
          button.textContent = `Resend OTP (${seconds}s)`;
        }
      }, 1000);
    }

  } catch (error) {
    showToast(error.message, "error");

    if (button) {
      button.disabled = false;
      button.textContent = "Send OTP";
    }
  }
});

/* =========================================================
   SIGNUP / VERIFY OTP
========================================================= */

$("signupForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("signupName")?.value.trim();
  const phone = $("signupPhone")?.value.trim();
  const email = $("signupEmail")?.value.trim();
  const otp = $("signupOtp")?.value.trim();
  const password = $("signupPassword")?.value || "";
  const password2 = $("signupPassword2")?.value || "";

  const button = $("signupButton");
  const message = $("signupMessage");

  if (!name) {
    showToast("Enter your full name.", "error");
    return;
  }

  if (!phone) {
    showToast("Enter your phone number.", "error");
    return;
  }

  if (!email) {
    showToast("Enter your email.", "error");
    return;
  }

  if (!/^\d{6}$/.test(otp)) {
    showToast("Enter the 6-digit OTP.", "error");
    return;
  }

  if (password.length < 8) {
    showToast("Password must be at least 8 characters.", "error");
    return;
  }

  if (password !== password2) {
    showToast("Passwords do not match.", "error");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Creating account...";
  }

  if (message) message.textContent = "";

  try {
    const data = await apiRequest("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({
        name,
        phone,
        email,
        otp,
        password
      })
    });

    if (!data.success || !data.token) {
      throw new Error(data.message || "Account creation failed.");
    }

    saveSession(data.token, data.user);

    showToast(
      "Account created successfully!",
      "success"
    );

    if (message) {
      message.textContent = "Account created successfully.";
    }

    setTimeout(() => {
      showMainScreen();
    }, 500);

  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }

    showToast(error.message, "error");

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Create Account";
    }
  }
});

/* =========================================================
   PASSWORD TOGGLES
========================================================= */

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.target;
    const input = $(targetId);

    if (!input) return;

    if (input.type === "password") {
      input.type = "text";
      button.textContent = "Hide";
    } else {
      input.type = "password";
      button.textContent = "Show";
    }
  });
});

/* =========================================================
   USER DISPLAY
========================================================= */

function updateUserDisplay() {
  currentUser = getSavedUser();

  if (!currentUser) return;

  const name =
    currentUser.name ||
    currentUser.fullName ||
    "User";

  const welcome = $("welcomeName");
  const profileName = $("profileName");
  const profileEmail = $("profileEmail");

  if (welcome) {
    welcome.textContent = name;
  }

  if (profileName) {
    profileName.textContent = name;
  }

  if (profileEmail) {
    profileEmail.textContent = currentUser.email || "";
  }
}

/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {
  updateUserDisplay();

  await Promise.allSettled([
    loadAccount(),
    loadWallet(),
    loadBonus(),
    loadTransactions(),
    loadConnection()
  ]);
}

async function loadConnection() {
  await checkConnection(false);
}

/* =========================================================
   ACCOUNT
========================================================= */

async function loadAccount() {
  try {
    const data = await apiRequest("/api/account");

    if (data.success && data.user) {
      currentUser = data.user;
      localStorage.setItem(
        USER_KEY,
        JSON.stringify(data.user)
      );

      updateUserDisplay();
    }

  } catch (error) {
    console.warn("Account:", error.message);
  }
}

/* =========================================================
   WALLET
========================================================= */

async function loadWallet() {
  try {
    const data = await apiRequest("/api/wallet");

    if (!data.success || !data.wallet) return;

    const balance = Number(data.wallet.balance || 0);

    const balanceElement = $("walletBalance");

    if (balanceElement) {
      balanceElement.textContent =
        `₦${balance.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
    }

    const transactionWallet = $("transactionWallet");

    if (transactionWallet) {
      transactionWallet.textContent =
        `Wallet: ₦${balance.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
    }

  } catch (error) {
    console.warn("Wallet:", error.message);
  }
}

/* =========================================================
   BONUS
========================================================= */

async function loadBonus() {
  try {
    const data = await apiRequest("/api/bonus");

    if (!data.success || !data.bonus) return;

    const balance = Number(data.bonus.balance || 0);

    const bonusElement = $("bonusBalance");

    if (bonusElement) {
      bonusElement.textContent =
        `₦${balance.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
    }

  } catch (error) {
    console.warn("Bonus:", error.message);
  }
}

/* =========================================================
   TRANSACTIONS
========================================================= */

async function loadTransactions() {
  try {
    const data = await apiRequest(
      "/api/transactions?limit=50"
    );

    const transactions = data.transactions || [];

    renderRecentTransactions(transactions);
    renderAllTransactions(transactions);

  } catch (error) {
    console.warn("Transactions:", error.message);

    renderRecentTransactions([]);
    renderAllTransactions([]);
  }
}

function formatMoney(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function transactionTitle(transaction) {
  return (
    transaction.description ||
    transaction.service ||
    transaction.type ||
    "Transaction"
  );
}

function renderRecentTransactions(transactions) {
  const container = $("recentTransactions");

  if (!container) return;

  const recent = transactions.slice(0, 5);

  if (!recent.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>No transactions yet</div>
        <small>Your transactions will appear here.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = recent.map((tx) => {
    const amount = Number(tx.amount || 0);
    const positive =
      tx.type === "credit" ||
      tx.type === "funding" ||
      tx.status === "credited";

    return `
      <div class="transaction-item">
        <div>
          <strong>${escapeHTML(transactionTitle(tx))}</strong>
          <small>${escapeHTML(formatDate(tx.createdAt))}</small>
        </div>

        <div>
          <strong class="${positive ? "credit" : "debit"}">
            ${positive ? "+" : "-"}${formatMoney(Math.abs(amount))}
          </strong>

          <small>${escapeHTML(tx.status || "")}</small>
        </div>
      </div>
    `;
  }).join("");
}

function renderAllTransactions(transactions) {
  const container = $("allTransactions");
  const count = $("transactionCount");

  if (count) {
    count.textContent = transactions.length;
  }

  if (!container) return;

  if (!transactions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>No transactions yet</div>
        <small>Your transaction history will appear here.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map((tx) => {
    const amount = Number(tx.amount || 0);

    return `
      <div class="transaction-item">
        <div>
          <strong>${escapeHTML(transactionTitle(tx))}</strong>
          <small>
            ${escapeHTML(formatDate(tx.createdAt))}
          </small>
          ${
            tx.reference
              ? `<small>Ref: ${escapeHTML(tx.reference)}</small>`
              : ""
          }
        </div>

        <div>
          <strong>
            ${formatMoney(amount)}
          </strong>

          <small>
            ${escapeHTML(tx.status || "unknown")}
          </small>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   NAVIGATION
========================================================= */

function showPage(pageId) {
  const pages = document.querySelectorAll(".page");

  pages.forEach((page) => {
    page.classList.remove("active");
  });

  const target = $(pageId);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");

    if (item.dataset.page === pageId) {
      item.classList.add("active");
    }
  });

  if (pageId === "transactionsPage") {
    loadTransactions();
  }

  if (pageId === "accountPage") {
    loadAccount();
  }

  if (pageId === "homePage") {
    loadDashboard();
  }
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const page = item.dataset.page;

    if (page) {
      showPage(page);
    }
  });
});

$("viewTransactionsButton")?.addEventListener("click", () => {
  showPage("transactionsPage");
});

$("viewAllServices")?.addEventListener("click", () => {
  showPage("servicesPage");
});

/* =========================================================
   FUND WALLET
========================================================= */

$("fundWalletButton")?.addEventListener("click", () => {
  const amountInput = $("fundAmount");

  if (amountInput) {
    amountInput.value = "";
  }

  openModal("fundWalletModal");
});

document.querySelectorAll(".quick-amount").forEach((button) => {
  button.addEventListener("click", () => {
    const amount = button.dataset.amount;

    const input = $("fundAmount");

    if (input) {
      input.value = amount || "";
    }
  });
});

$("continueFundingButton")?.addEventListener("click", async () => {
  const input = $("fundAmount");

  const amount = Number(
    input?.value?.replace(/,/g, "") || 0
  );

  if (!Number.isFinite(amount) || amount < 100) {
    showToast("Minimum funding amount is ₦100.", "error");
    return;
  }

  if (amount > 1000000) {
    showToast("Maximum funding amount is ₦1,000,000.", "error");
    return;
  }

  const button = $("continueFundingButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Creating request...";
  }

  try {
    /* First get the official quote */
    const quoteData = await apiRequest(
      "/api/funding/quote",
      {
        method: "POST",
        body: JSON.stringify({ amount })
      }
    );

    if (!quoteData.success || !quoteData.quote) {
      throw new Error(
        quoteData.message || "Unable to create funding quote."
      );
    }

    const quote = quoteData.quote;

    const confirmed = window.confirm(
      `Funding summary\n\n` +
      `Wallet credit: ${formatMoney(quote.walletCredit)}\n` +
      `Fee: ${formatMoney(quote.fee)}\n` +
      `Total to pay: ${formatMoney(quote.totalToPay)}\n\n` +
      `Continue?`
    );

    if (!confirmed) {
      return;
    }

    /* Create pending funding request */
    const createData = await apiRequest(
      "/api/funding/create",
      {
        method: "POST",
        body: JSON.stringify({ amount })
      }
    );

    if (!createData.success) {
      throw new Error(
        createData.message ||
        "Could not create funding request."
      );
    }

    closeModal("fundWalletModal");

    showToast(
      "Funding request created. Wallet is not credited yet.",
      "success"
    );

    showInfo(
      "Funding Pending",
      `
        <p>Your funding request has been created.</p>
        <p><strong>Wallet credit:</strong> ${formatMoney(quote.walletCredit)}</p>
        <p><strong>Fee:</strong> ${formatMoney(quote.fee)}</p>
        <p><strong>Total:</strong> ${formatMoney(quote.totalToPay)}</p>
        <p>
          Payment provider integration is still pending,
          so your wallet balance has not been increased.
        </p>
      `,
      "💳"
    );

  } catch (error) {
    showToast(error.message, "error");

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Continue";
    }
  }
});

/* =========================================================
   BONUS
========================================================= */

$("redeemBonusButton")?.addEventListener("click", () => {
  showInfo(
    "Bonus",
    `
      <p>Your current bonus balance is shown on the dashboard.</p>
      <p>
        Bonus redemption is not enabled in the current backend yet.
      </p>
    `,
    "🎁"
  );
});

/* =========================================================
   SERVICES
========================================================= */

const serviceNames = {
  data: {
    title: "Data",
    icon: "📶",
    description: "Buy mobile data bundles."
  },

  airtime: {
    title: "Airtime",
    icon: "📱",
    description: "Buy airtime for supported networks."
  },

  cable: {
    title: "Cable TV",
    icon: "📺",
    description: "Pay your cable TV subscription."
  },

  electricity: {
    title: "Electricity",
    icon: "💡",
    description: "Pay electricity bills."
  },

  education: {
    title: "Education",
    icon: "🎓",
    description: "Purchase supported education PINs."
  },

  bulksms: {
    title: "Bulk SMS",
    icon: "💬",
    description: "Send bulk SMS when the provider is connected."
  }
};

function openService(service) {
  currentService = service;

  const info = serviceNames[service] || {
    title: "Service",
    icon: "⚡",
    description: "SIH DATA SUB service."
  };

  const icon = $("serviceModalIcon");
  const title = $("serviceModalTitle");
  const description = $("serviceModalDescription");
  const formArea = $("serviceFormArea");

  if (icon) icon.textContent = info.icon;
  if (title) title.textContent = info.title;
  if (description) description.textContent = info.description;

  if (formArea) {
    formArea.innerHTML = `
      <div class="service-status-box">
        <div style="font-size:40px;">${info.icon}</div>
        <h3>${escapeHTML(info.title)}</h3>
        <p>
          This service requires a verified VTU/provider
          connection before purchases can be processed.
        </p>

        <button
          type="button"
          id="checkServiceButton"
          class="primary-button"
        >
          Check Service Status
        </button>
      </div>
    `;

    $("checkServiceButton")?.addEventListener(
      "click",
      () => checkServiceStatus(service)
    );
  }

  openModal("serviceModal");
}

window.openService = openService;

document.querySelectorAll(
  ".service-card, .full-service-card"
).forEach((card) => {
  card.addEventListener("click", () => {
    const service = card.dataset.service;

    if (service) {
      openService(service);
    }
  });
});

async function checkServiceStatus(service) {
  showLoading("Checking service...");

  try {
    const data = await apiRequest("/api/services");

    const services = data.services || [];

    const found = services.find(
      (item) => item.service === service
    );

    if (!found) {
      throw new Error("Service information not found.");
    }

    if (found.available) {
      showToast(
        `${serviceNames[service]?.title || service} is available.`,
        "success"
      );
    } else {
      showInfo(
        serviceNames[service]?.title || "Service",
        `
          <p><strong>Status:</strong> ${escapeHTML(
            found.status || "Provider required"
          )}</p>
          <p>
            This service cannot process real purchases until
            the VTU provider is connected to SIH DATA SUB.
          </p>
        `,
        serviceNames[service]?.icon || "⚡"
      );
    }

  } catch (error) {
    showToast(error.message, "error");

  } finally {
    hideLoading();
  }
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

$("notificationButton")?.addEventListener("click", async () => {
  openModal("notificationModal");

  const content = $("notificationContent");

  if (!content) return;

  content.innerHTML = `
    <p>Checking system status...</p>
  `;

  try {
    const health = await apiRequest("/api/health");

    content.innerHTML = `
      <div class="notification-item">
        <strong>Backend</strong>
        <span>Connected ✓</span>
      </div>

      <div class="notification-item">
        <strong>Gmail OTP</strong>
        <span>
          ${
            health.gmailReady
              ? "Ready ✓"
              : "Not Ready"
          }
        </span>
      </div>

      <div class="notification-item">
        <strong>Payment Provider</strong>
        <span>
          ${
            health.paymentProvider === "CONNECTED"
              ? "Connected ✓"
              : "Pending"
          }
        </span>
      </div>

      <div class="notification-item">
        <strong>VTU Provider</strong>
        <span>
          ${
            health.vtuProvider === "CONNECTED"
              ? "Connected ✓"
              : "Pending"
          }
        </span>
      </div>
    `;

  } catch (error) {
    content.innerHTML = `
      <p>${escapeHTML(error.message)}</p>
    `;
  }
});

/* =========================================================
   INFO MODAL
========================================================= */

function showInfo(title, content, icon = "ℹ️") {
  const modalIcon = $("infoModalIcon");
  const modalTitle = $("infoModalTitle");
  const modalContent = $("infoModalContent");

  if (modalIcon) modalIcon.textContent = icon;
  if (modalTitle) modalTitle.textContent = title;

  if (modalContent) {
    modalContent.innerHTML = content;
  }

  openModal("infoModal");
}

window.showInfo = showInfo;

/* =========================================================
   PROFILE
========================================================= */

$("profileButton")?.addEventListener("click", async () => {
  try {
    const data = await apiRequest("/api/account");

    const user = data.user || currentUser || {};

    showInfo(
      "My Profile",
      `
        <p>
          <strong>Name:</strong>
          ${escapeHTML(user.name || "")}
        </p>

        <p>
          <strong>Email:</strong>
          ${escapeHTML(user.email || "")}
        </p>

        <p>
          <strong>Phone:</strong>
          ${escapeHTML(user.phone || "")}
        </p>
      `,
      "👤"
    );

  } catch (error) {
    showToast(error.message, "error");
  }
});

/* =========================================================
   SECURITY
========================================================= */

$("securityButton")?.addEventListener("click", () => {
  showInfo(
    "Security",
    `
      <p>
        Your account uses JWT authentication.
      </p>

      <p>
        Your password is stored on the backend using
        password hashing.
      </p>

      <p>
        Never share your password or OTP with another person.
      </p>
    `,
    "🔐"
  );
});

/* =========================================================
   SUPPORT
========================================================= */

$("supportButton")?.addEventListener("click", () => {
  showInfo(
    "Support",
    `
      <p>
        SIH DATA SUB support information will be connected here.
      </p>

      <p>
        For now, make sure your backend server is running
        before reporting a connection problem.
      </p>
    `,
    "🎧"
  );
});

/* =========================================================
   ABOUT
========================================================= */

$("aboutButton")?.addEventListener("click", async () => {
  try {
    const health = await apiRequest("/api/health");

    showInfo(
      "About SIH DATA SUB",
      `
        <p>
          <strong>App:</strong>
          ${escapeHTML(health.app || "SIH DATA SUB")}
        </p>

        <p>
          <strong>Backend version:</strong>
          ${escapeHTML(health.version || "Unknown")}
        </p>

        <p>
          SIH DATA SUB is a VTU-style platform for
          data, airtime, bills and other digital services.
        </p>
      `,
      "ℹ️"
    );

  } catch (error) {
    showInfo(
      "About SIH DATA SUB",
      `
        <p>SIH DATA SUB</p>
        <p>Backend connection unavailable.</p>
      `,
      "ℹ️"
    );
  }
});

/* =========================================================
   LOGOUT
========================================================= */

$("logoutButton")?.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Do you want to logout?"
  );

  if (!confirmed) return;

  try {
    if (getToken()) {
      await apiRequest("/api/auth/logout", {
        method: "POST"
      });
    }
  } catch (error) {
    console.warn("Logout:", error.message);
  }

  clearSession();

  showToast("Logged out successfully.", "success");

  setTimeout(() => {
    showAuthScreen();
  }, 300);
});

/* =========================================================
   SERVICE PURCHASE FUNCTION
   This intentionally does NOT fake a successful purchase.
========================================================= */

async function processService(service, payload = {}) {
  try {
    const data = await apiRequest(
      "/api/services/purchase",
      {
        method: "POST",
        body: JSON.stringify({
          service,
          ...payload
        })
      }
    );

    if (data.success) {
      showToast(
        "Service purchase successful.",
        "success"
      );

      await loadWallet();
      await loadTransactions();

      return data;
    }

    throw new Error(
      data.message || "Purchase failed."
    );

  } catch (error) {
    showToast(error.message, "error");
    throw error;
  }
}

window.processService = processService;

/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeApp() {
  const token = getToken();

  currentUser = getSavedUser();

  /* Always test backend connection */
  await checkConnection(false);

  if (token) {
    try {
      await apiRequest("/api/account");

      showMainScreen();

    } catch (error) {
      clearSession();
      showAuthScreen();
    }

  } else {
    showAuthScreen();
  }
}

/* =========================================================
   AUTO REFRESH
========================================================= */

setInterval(() => {
  if (getToken()) {
    loadWallet();
    loadBonus();
  }
}, 30000);

/* =========================================================
   START APP
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  startSplash();
});