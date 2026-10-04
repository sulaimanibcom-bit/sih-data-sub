"use strict";

/* =========================================================
   SIH DATA SUB - FRONTEND APP
========================================================= */

/*
  IMPORTANT:
  Frontend and backend are separated.

  Frontend:
  - index.html
  - style.css
  - app.js

  Backend:
  - http://localhost:5100
*/


/* =========================================================
   CONFIG
========================================================= */

const API_BASE =
  location.port === "5100"
    ? ""
    : "http://localhost:5100";

const TOKEN_KEY = "sih_data_sub_token";
const USER_KEY = "sih_data_sub_user";


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let currentToken = null;

let airtimeNetworks = [];
let dataNetworks = [];
let airtimePinNetworks = [];
let dataPinNetworks = [];

let selectedAirtimeNetwork = "";
let selectedDataNetwork = "";
let selectedAirtimePinNetwork = "";
let selectedDataPinNetwork = "";

let dataPlans = [];


/* =========================================================
   BASIC HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function show(id) {
  const el = $(id);

  if (el) {
    el.classList.remove("hidden");
  }
}


function hide(id) {
  const el = $(id);

  if (el) {
    el.classList.add("hidden");
  }
}


function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}


function getSavedUser() {
  try {
    return JSON.parse(
      localStorage.getItem(USER_KEY) || "null"
    );
  } catch {
    return null;
  }
}


function saveAuth(token, user) {

  if (token) {
    localStorage.setItem(
      TOKEN_KEY,
      token
    );
  }

  if (user) {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify(user)
    );
  }

  currentToken = token || getToken();
  currentUser = user || getSavedUser();
}


function clearAuth() {

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  currentToken = null;
  currentUser = null;
}


/* =========================================================
   API REQUEST
========================================================= */

async function api(path, options = {}) {

  const headers = {
    ...(options.headers || {})
  };


  if (
    options.body &&
    typeof options.body !== "string"
  ) {

    headers["Content-Type"] =
      "application/json";

    options.body =
      JSON.stringify(options.body);
  }


  const token = getToken();


  if (token) {

    headers["Authorization"] =
      "Bearer " + token;
  }


  let response;


  try {

    response = await fetch(
      API_BASE + path,
      {
        ...options,
        headers
      }
    );

  } catch (error) {

    throw new Error(
      "Cannot connect to SIH DATA SUB backend."
    );
  }


  let data = null;


  try {

    data = await response.json();

  } catch {

    data = {
      success: false,
      message:
        "Invalid response from server."
    };
  }


  /*
    VERY IMPORTANT:

    Only our own authentication
    endpoint failures should clear
    the login session.

    A VTUPLUG provider error must NOT
    log the user out.
  */

  if (
    response.status === 401 &&
    path.startsWith("/api/auth/")
  ) {

    /*
      Login/signup/OTP requests may
      legitimately return 401.

      Do not clear the current session
      automatically here.
    */

  }


  if (!response.ok) {

    const message =
      data?.message ||
      data?.error ||
      "Request failed.";

    const error =
      new Error(message);

    error.status =
      response.status;

    error.data =
      data;

    error.path =
      path;

    throw error;
  }


  return data;
}


/* =========================================================
   LOADING
========================================================= */

function showLoading(message = "Please wait...") {

  if ($("loadingText")) {
    $("loadingText").textContent =
      message;
  }

  show("actionLoading");
}


function hideLoading() {
  hide("actionLoading");
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;


function toast(
  message,
  type = "normal"
) {

  const el = $("toast");

  if (!el) return;

  clearTimeout(toastTimer);

  el.textContent = message;

  el.className =
    "toast show " + type;

  toastTimer =
    setTimeout(() => {

      el.className = "toast";

    }, 3500);
}


/* =========================================================
   PASSWORD
========================================================= */

function togglePassword(
  inputId,
  button
) {

  const input = $(inputId);

  if (!input) return;

  if (
    input.type === "password"
  ) {

    input.type = "text";

    button.textContent = "🙈";

  } else {

    input.type = "password";

    button.textContent = "👁";
  }
}


/* =========================================================
   AUTH SCREEN
========================================================= */

function showLogin() {

  show("authScreen");
  hide("mainScreen");

  show("loginBox");
  hide("signupBox");
  hide("forgotBox");

}


function showSignup() {

  show("authScreen");
  hide("mainScreen");

  hide("loginBox");
  show("signupBox");
  hide("forgotBox");

}


function showForgotPassword() {

  show("authScreen");
  hide("mainScreen");

  hide("loginBox");
  hide("signupBox");
  show("forgotBox");

}


/* =========================================================
   LOGIN
========================================================= */

async function login(event) {

  event.preventDefault();

  const email =
    $("loginEmail").value.trim();

  const password =
    $("loginPassword").value;


  if (!email || !password) {

    toast(
      "Enter your email and password.",
      "error"
    );

    return;
  }


  const button =
    $("loginButton");

  button.disabled = true;

  button.textContent =
    "Logging in...";


  try {

    showLoading("Signing you in...");


    const result =
      await api(
        "/api/auth/login",
        {
          method: "POST",
          body: {
            email,
            password
          }
        }
      );


    if (
      !result ||
      !result.token
    ) {

      throw new Error(
        result?.message ||
        "Login succeeded but no login token was returned."
      );
    }


    saveAuth(
      result.token,
      result.user || null
    );


    toast(
      "Login successful.",
      "success"
    );


    await openDashboard();


  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    toast(
      error.message ||
      "Login failed.",
      "error"
    );

  } finally {

    hideLoading();

    button.disabled = false;

    button.textContent =
      "Login";
  }
}


/* =========================================================
   SEND SIGNUP OTP
========================================================= */

async function sendSignupOTP() {

  const name =
    $("signupName").value.trim();

  const phone =
    $("signupPhone").value.trim();

  const email =
    $("signupEmail").value.trim();


  if (!name) {

    toast(
      "Enter your full name.",
      "error"
    );

    return;
  }


  if (!phone) {

    toast(
      "Enter your phone number.",
      "error"
    );

    return;
  }


  if (!email) {

    toast(
      "Enter your email.",
      "error"
    );

    return;
  }


  const button =
    $("sendOtpButton");

  button.disabled = true;

  button.textContent =
    "Sending...";


  try {

    showLoading(
      "Sending OTP to your email..."
    );


    const result =
      await api(
        "/api/auth/request-otp",
        {
          method: "POST",
          body: {
            name,
            phone,
            email
          }
        }
      );


    toast(
      result.message ||
      "OTP sent to your email.",
      "success"
    );


    $("signupOtp").focus();


  } catch (error) {

    console.error(
      "SIGNUP OTP ERROR:",
      error
    );

    toast(
      error.message ||
      "Unable to send OTP.",
      "error"
    );

  } finally {

    hideLoading();

    button.disabled = false;

    button.textContent =
      "Send OTP";
  }
}


/* =========================================================
   SIGNUP
========================================================= */

async function signup(event) {

  event.preventDefault();


  const name =
    $("signupName").value.trim();

  const phone =
    $("signupPhone").value.trim();

  const email =
    $("signupEmail").value.trim();

  const otp =
    $("signupOtp").value.trim();

  const password =
    $("signupPassword").value;

  const confirmPassword =
    $("signupConfirmPassword").value;


  if (
    !name ||
    !phone ||
    !email ||
    !otp ||
    !password ||
    !confirmPassword
  ) {

    toast(
      "Please complete all fields.",
      "error"
    );

    return;
  }


  if (password !== confirmPassword) {

    toast(
      "Passwords do not match.",
      "error"
    );

    return;
  }


  const button =
    $("signupButton");

  button.disabled = true;

  button.textContent =
    "Creating...";


  try {

    showLoading(
      "Creating your account..."
    );


    const result =
      await api(
        "/api/auth/signup",
        {
          method: "POST",
          body: {
            name,
            phone,
            email,
            password,
            otp
          }
        }
      );


    if (
      result.token
    ) {

      saveAuth(
        result.token,
        result.user || null
      );

      await openDashboard();

    } else {

      toast(
        result.message ||
        "Account created successfully. Please login.",
        "success"
      );

      showLogin();
    }


  } catch (error) {

    console.error(
      "SIGNUP ERROR:",
      error
    );

    toast(
      error.message ||
      "Account creation failed.",
      "error"
    );

  } finally {

    hideLoading();

    button.disabled = false;

    button.textContent =
      "Create Account";
  }
}


/* =========================================================
   FORGOT PASSWORD
========================================================= */

async function forgotPassword(event) {

  event.preventDefault();


  const email =
    $("forgotEmail").value.trim();


  if (!email) {

    toast(
      "Enter your email.",
      "error"
    );

    return;
  }


  const button =
    $("forgotButton");

  button.disabled = true;

  button.textContent =
    "Sending...";


  try {

    showLoading(
      "Sending reset OTP..."
    );


    const result =
      await api(
        "/api/auth/forgot-password",
        {
          method: "POST",
          body: {
            email
          }
        }
      );


    toast(
      result.message ||
      "Reset OTP sent.",
      "success"
    );


    show("resetPasswordBox");

    $("resetOtp").focus();


  } catch (error) {

    console.error(
      "FORGOT PASSWORD ERROR:",
      error
    );

    toast(
      error.message ||
      "Unable to send reset OTP.",
      "error"
    );

  } finally {

    hideLoading();

    button.disabled = false;

    button.textContent =
      "Send Reset OTP";
  }
}


/* =========================================================
   RESET PASSWORD
========================================================= */

async function resetPassword() {

  const email =
    $("forgotEmail").value.trim();

  const otp =
    $("resetOtp").value.trim();

  const password =
    $("newPassword").value;

  const confirmPassword =
    $("confirmNewPassword").value;


  if (
    !email ||
    !otp ||
    !password ||
    !confirmPassword
  ) {

    toast(
      "Complete all reset fields.",
      "error"
    );

    return;
  }


  if (
    password !==
    confirmPassword
  ) {

    toast(
      "Passwords do not match.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Resetting your password..."
    );


    const result =
      await api(
        "/api/auth/reset-password",
        {
          method: "POST",
          body: {
            email,
            otp,
            password
          }
        }
      );


    toast(
      result.message ||
      "Password reset successfully.",
      "success"
    );


    $("forgotForm").reset();

    $("resetOtp").value = "";
    $("newPassword").value = "";
    $("confirmNewPassword").value = "";

    hide("resetPasswordBox");

    setTimeout(
      showLogin,
      700
    );


  } catch (error) {

    console.error(
      "RESET PASSWORD ERROR:",
      error
    );

    toast(
      error.message ||
      "Password reset failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function openDashboard() {

  hide("authScreen");
  show("mainScreen");

  await loadCurrentUser();
  await loadWallet();
  await checkBackend();
  await loadTransactions();

}


async function loadCurrentUser() {

  const token =
    getToken();


  if (!token) {

    currentUser = null;

    showLogin();

    return false;
  }


  try {

    const result =
      await api(
        "/api/auth/me"
      );


    currentUser =
      result.user ||
      result.data ||
      result;


    saveAuth(
      token,
      currentUser
    );


    updateUserUI();

    return true;


  } catch (error) {

    console.error(
      "ME ERROR:",
      error
    );


    /*
      Only clear the session when
      /api/auth/me itself rejects
      the application's JWT.
    */

    if (
      error.status === 401 &&
      error.path === "/api/auth/me"
    ) {

      clearAuth();

      showLogin();

      toast(
        "Your session has expired. Please login again.",
        "error"
      );

      return false;
    }


    toast(
      error.message ||
      "Unable to load your account.",
      "error"
    );

    return false;
  }
}


function updateUserUI() {

  const user =
    currentUser || {};


  const name =
    user.name ||
    user.fullName ||
    "User";


  const email =
    user.email ||
    "";


  if ($("userName")) {
    $("userName").textContent =
      name;
  }


  if ($("profileName")) {
    $("profileName").textContent =
      name;
  }


  if ($("profileEmail")) {
    $("profileEmail").textContent =
      email;
  }


  const initial =
    name.charAt(0).toUpperCase() ||
    "U";


  if ($("userInitial")) {
    $("userInitial").textContent =
      initial;
  }


  if ($("profileInitial")) {
    $("profileInitial").textContent =
      initial;
  }
}


/* =========================================================
   BACKEND HEALTH
========================================================= */

async function checkBackend() {

  const status =
    $("connectionStatus");


  if (!status) return;


  status.textContent =
    "Checking backend...";


  try {

    const result =
      await api(
        "/api/health"
      );


    const vtu =
      result.vtuProvider ||
      "Unknown";


    const vtuReady =
      result.vtuConfigured === true;


    if (
      result.success &&
      result.server
    ) {

      status.textContent =
        vtuReady
          ? "Backend connected • VTUPLUG: Connected"
          : "Backend connected • VTUPLUG: Not configured";

      status.style.color =
        vtuReady
          ? "#159447"
          : "#d58a00";

    } else {

      status.textContent =
        "Backend response received.";

    }


  } catch (error) {

    console.error(
      "HEALTH ERROR:",
      error
    );

    status.textContent =
      "Backend connection failed.";

    status.style.color =
      "#d9363e";
  }
}


/* =========================================================
   WALLET
========================================================= */

async function loadWallet() {

  try {

    const result =
      await api(
        "/api/wallet"
      );


    const wallet =
      result.wallet ||
      result.data ||
      result;


    const balance =
      Number(
        wallet.balance ||
        wallet.walletBalance ||
        0
      );


    $("walletBalance").textContent =
      formatNaira(balance);


  } catch (error) {

    console.error(
      "WALLET ERROR:",
      error
    );

    if (
      error.status === 401 &&
      error.path === "/api/wallet"
    ) {

      /*
        We don't immediately destroy
        the session here.

        /api/auth/me is the authority
        for checking whether the SIH
        JWT is actually valid.
      */

      toast(
        "Unable to load wallet.",
        "error"
      );

      return;
    }


    toast(
      error.message ||
      "Unable to load wallet.",
      "error"
    );
  }
}


function formatNaira(amount) {

  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2
    }
  ).format(
    Number(amount) || 0
  );
}


/* =========================================================
   FUND WALLET
========================================================= */

function openFundWallet() {

  show("fundWalletModal");

}


function closeFundWallet() {

  hide("fundWalletModal");

}


async function fundWallet() {

  const amount =
    Number(
      $("fundAmount").value
    );


  if (
    !amount ||
    amount < 100
  ) {

    toast(
      "Enter at least ₦100.",
      "error"
    );

    return;
  }


  /*
    The current backend marks the
    payment provider as PENDING.

    We therefore don't pretend that
    money was actually deposited.
  */

  toast(
    "Payment provider is not connected yet.",
    "error"
  );
}


/* =========================================================
   SERVICE MODAL
========================================================= */

function openModal(
  title,
  html
) {

  $("modalTitle").textContent =
    title;

  $("modalBody").innerHTML =
    html;

  show("serviceModal");
}


function closeModal() {

  hide("serviceModal");

  $("modalBody").innerHTML =
    "";
}


/* =========================================================
   AIRTIME
========================================================= */

async function openAirtime() {

  openModal(
    "Buy Airtime",
    `
      <div class="service-note">
        Buy airtime instantly using your SIH DATA SUB wallet.
      </div>

      <div id="airtimeContent">
        Loading networks...
      </div>
    `
  );


  try {

    const result =
      await api(
        "/api/provider/airtime-networks"
      );


    airtimeNetworks =
      result.networks ||
      result.data ||
      [];


    renderAirtime();


  } catch (error) {

    console.error(
      "AIRTIME NETWORK ERROR:",
      error
    );

    showProviderError(
      "airtimeContent",
      error
    );
  }
}


function renderAirtime() {

  const el =
    $("airtimeContent");

  if (!el) return;


  if (
    !Array.isArray(
      airtimeNetworks
    ) ||
    airtimeNetworks.length === 0
  ) {

    el.innerHTML = `
      <div class="empty-state">
        No airtime networks were returned by VTUPLUG.
      </div>
    `;

    return;
  }


  const options =
    airtimeNetworks
      .map(network => {

        const value =
          network.code ||
          network.network ||
          network.id ||
          network.name ||
          "";

        const label =
          network.name ||
          network.network ||
          network.label ||
          value;

        return `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `;

      })
      .join("");


  el.innerHTML = `

    <div class="service-form">

      <label>Network</label>

      <select id="airtimeNetwork">
        <option value="">
          Select network
        </option>
        ${options}
      </select>


      <label>Phone Number</label>

      <input
        id="airtimePhone"
        type="tel"
        inputmode="numeric"
        placeholder="08012345678"
      >


      <label>Amount</label>

      <input
        id="airtimeAmount"
        type="number"
        min="50"
        placeholder="Enter amount"
      >


      <button
        class="primary-button"
        onclick="purchaseAirtime()"
      >
        Buy Airtime
      </button>

    </div>
  `;
}


async function purchaseAirtime() {

  const network =
    $("airtimeNetwork")?.value;

  const phone =
    $("airtimePhone")?.value.trim();

  const amount =
    Number(
      $("airtimeAmount")?.value
    );


  if (!network) {

    toast(
      "Select a network.",
      "error"
    );

    return;
  }


  if (!phone) {

    toast(
      "Enter phone number.",
      "error"
    );

    return;
  }


  if (
    !amount ||
    amount <= 0
  ) {

    toast(
      "Enter a valid amount.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Processing airtime..."
    );


    const result =
      await api(
        "/api/airtime/purchase",
        {
          method: "POST",
          body: {
            network,
            phone,
            amount
          }
        }
      );


    toast(
      result.message ||
      "Airtime purchase successful.",
      "success"
    );


    closeModal();

    await loadWallet();
    await loadTransactions();


  } catch (error) {

    console.error(
      "AIRTIME PURCHASE ERROR:",
      error
    );

    /*
      Provider 401/403 should now
      arrive as 502 from our backend.
      Therefore this will NOT destroy
      the user's session.
    */

    toast(
      error.message ||
      "Airtime purchase failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   DATA
========================================================= */

async function openData() {

  openModal(
    "Buy Data",
    `
      <div class="service-note">
        Select a network and data plan.
      </div>

      <div id="dataContent">
        Loading networks...
      </div>
    `
  );


  try {

    const result =
      await api(
        "/api/provider/data-networks"
      );


    dataNetworks =
      result.networks ||
      result.data ||
      [];


    renderDataNetworks();


  } catch (error) {

    console.error(
      "DATA NETWORK ERROR:",
      error
    );

    showProviderError(
      "dataContent",
      error
    );
  }
}


function renderDataNetworks() {

  const el =
    $("dataContent");

  if (!el) return;


  if (
    !Array.isArray(
      dataNetworks
    ) ||
    dataNetworks.length === 0
  ) {

    el.innerHTML = `
      <div class="empty-state">
        No data networks were returned by VTUPLUG.
      </div>
    `;

    return;
  }


  const options =
    dataNetworks
      .map(network => {

        const value =
          network.code ||
          network.network ||
          network.id ||
          network.name ||
          "";

        const label =
          network.name ||
          network.network ||
          network.label ||
          value;

        return `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `;

      })
      .join("");


  el.innerHTML = `

    <label>Network</label>

    <select id="dataNetwork"
      onchange="loadDataPlans()">

      <option value="">
        Select network
      </option>

      ${options}

    </select>


    <div id="dataPlansBox">
      <p class="service-note">
        Select a network to load available plans.
      </p>
    </div>
  `;
}


async function loadDataPlans() {

  const network =
    $("dataNetwork")?.value;


  if (!network) {

    return;
  }


  const box =
    $("dataPlansBox");


  box.innerHTML =
    `<p class="provider-status">
      Loading data plans...
    </p>`;


  try {

    const result =
      await api(
        "/api/data/plans?network=" +
        encodeURIComponent(network)
      );


    dataPlans =
      result.plans ||
      result.data ||
      [];


    renderDataPlans();


  } catch (error) {

    console.error(
      "DATA PLANS ERROR:",
      error
    );

    showProviderError(
      "dataPlansBox",
      error
    );
  }
}


function renderDataPlans() {

  const box =
    $("dataPlansBox");

  if (!box) return;


  if (
    !Array.isArray(dataPlans) ||
    dataPlans.length === 0
  ) {

    box.innerHTML = `
      <div class="empty-state">
        No data plans returned by VTUPLUG.
      </div>
    `;

    return;
  }


  const options =
    dataPlans
      .map((plan, index) => {

        const value =
          plan.code ||
          plan.id ||
          plan.plan_id ||
          index;

        const name =
          plan.name ||
          plan.plan ||
          plan.size ||
          plan.label ||
          "Data Plan";

        const price =
          Number(
            plan.price ||
            plan.amount ||
            plan.selling_price ||
            0
          );


        return `
          <option
            value="${escapeHtml(String(value))}"
          >
            ${escapeHtml(name)}
            - ${formatNaira(price)}
          </option>
        `;

      })
      .join("");


  box.innerHTML = `

    <label>Data Plan</label>

    <select id="dataPlan">

      <option value="">
        Select data plan
      </option>

      ${options}

    </select>


    <label>Phone Number</label>

    <input
      id="dataPhone"
      type="tel"
      inputmode="numeric"
      placeholder="08012345678"
    >


    <button
      class="primary-button"
      onclick="purchaseData()"
    >
      Buy Data
    </button>
  `;
}


async function purchaseData() {

  const network =
    $("dataNetwork")?.value;

  const plan =
    $("dataPlan")?.value;

  const phone =
    $("dataPhone")?.value.trim();


  if (!network) {

    toast(
      "Select a network.",
      "error"
    );

    return;
  }


  if (!plan) {

    toast(
      "Select a data plan.",
      "error"
    );

    return;
  }


  if (!phone) {

    toast(
      "Enter phone number.",
      "error"
    );

    return;
  }


  const selected =
    dataPlans.find(
      (item, index) => {

        const value =
          item.code ||
          item.id ||
          item.plan_id ||
          index;

        return String(value) ===
          String(plan);
      }
    );


  const amount =
    Number(
      selected?.price ||
      selected?.amount ||
      selected?.selling_price ||
      0
    );


  try {

    showLoading(
      "Processing data purchase..."
    );


    const result =
      await api(
        "/api/data/purchase",
        {
          method: "POST",
          body: {
            network,
            plan,
            phone,
            amount
          }
        }
      );


    toast(
      result.message ||
      "Data purchase successful.",
      "success"
    );


    closeModal();

    await loadWallet();
    await loadTransactions();


  } catch (error) {

    console.error(
      "DATA PURCHASE ERROR:",
      error
    );

    toast(
      error.message ||
      "Data purchase failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   CABLE TV
========================================================= */

async function openCable() {

  openModal(
    "Cable TV",
    `
      <div id="cableContent">
        Loading cable providers...
      </div>
    `
  );


  try {

    const result =
      await api(
        "/api/cable/providers"
      );


    const providers =
      result.providers ||
      result.data ||
      [];


    renderCable(providers);


  } catch (error) {

    showProviderError(
      "cableContent",
      error
    );
  }
}


function renderCable(providers) {

  const el =
    $("cableContent");

  if (!el) return;


  if (
    !Array.isArray(providers) ||
    providers.length === 0
  ) {

    el.innerHTML = `
      <div class="empty-state">
        No cable providers available.
      </div>
    `;

    return;
  }


  const options =
    providers
      .map(provider => {

        const value =
          provider.code ||
          provider.id ||
          provider.name ||
          "";

        const label =
          provider.name ||
          provider.label ||
          value;

        return `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `;

      })
      .join("");


  el.innerHTML = `

    <label>Cable Provider</label>

    <select id="cableProvider">
      <option value="">
        Select provider
      </option>
      ${options}
    </select>


    <label>Smart Card / IUC Number</label>

    <input
      id="cableNumber"
      type="text"
      placeholder="Enter number"
    >


    <button
      class="primary-button"
      onclick="validateCable()"
    >
      Continue
    </button>

    <div id="cableValidation"></div>
  `;
}


async function validateCable() {

  const cable =
    $("cableProvider")?.value;

  const number =
    $("cableNumber")?.value.trim();


  if (!cable || !number) {

    toast(
      "Complete the cable details.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Validating account..."
    );


    const result =
      await api(
        "/api/cable/validate",
        {
          method: "POST",
          body: {
            cable,
            number
          }
        }
      );


    const box =
      $("cableValidation");


    box.innerHTML = `

      <div class="provider-status">
        ${escapeHtml(
          result.message ||
          "Account validated."
        )}
      </div>

      <label>Amount</label>

      <input
        id="cableAmount"
        type="number"
        placeholder="Enter amount"
      >

      <button
        class="primary-button"
        onclick="purchaseCable()"
      >
        Pay Cable TV
      </button>
    `;


  } catch (error) {

    showProviderError(
      "cableValidation",
      error
    );

  } finally {

    hideLoading();
  }
}


async function purchaseCable() {

  const cable =
    $("cableProvider")?.value;

  const number =
    $("cableNumber")?.value.trim();

  const amount =
    Number(
      $("cableAmount")?.value
    );


  if (!amount) {

    toast(
      "Enter amount.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Processing cable payment..."
    );


    const result =
      await api(
        "/api/cable/purchase",
        {
          method: "POST",
          body: {
            cable,
            number,
            amount
          }
        }
      );


    toast(
      result.message ||
      "Cable payment successful.",
      "success"
    );


    closeModal();

    await loadWallet();
    await loadTransactions();


  } catch (error) {

    toast(
      error.message ||
      "Cable payment failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   ELECTRICITY
========================================================= */

async function openElectricity() {

  openModal(
    "Electricity",
    `
      <div id="electricityContent">
        Loading electricity providers...
      </div>
    `
  );


  try {

    const result =
      await api(
        "/api/electricity/providers"
      );


    const providers =
      result.providers ||
      result.data ||
      [];


    renderElectricity(
      providers
    );


  } catch (error) {

    showProviderError(
      "electricityContent",
      error
    );
  }
}


function renderElectricity(
  providers
) {

  const el =
    $("electricityContent");

  if (!el) return;


  if (
    !Array.isArray(providers) ||
    providers.length === 0
  ) {

    el.innerHTML = `
      <div class="empty-state">
        No electricity providers available.
      </div>
    `;

    return;
  }


  const options =
    providers
      .map(provider => {

        const value =
          provider.code ||
          provider.id ||
          provider.name ||
          "";

        const label =
          provider.name ||
          provider.label ||
          value;

        return `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `;

      })
      .join("");


  el.innerHTML = `

    <label>Electricity Provider</label>

    <select id="electricityProvider">
      <option value="">
        Select provider
      </option>

      ${options}

    </select>


    <label>Meter Number</label>

    <input
      id="meterNumber"
      type="text"
      placeholder="Enter meter number"
    >


    <button
      class="primary-button"
      onclick="validateElectricity()"
    >
      Continue
    </button>


    <div id="electricityValidation"></div>
  `;
}


async function validateElectricity() {

  const provider =
    $("electricityProvider")?.value;

  const meter =
    $("meterNumber")?.value.trim();


  if (!provider || !meter) {

    toast(
      "Complete the meter details.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Validating meter..."
    );


    const result =
      await api(
        "/api/electricity/validate",
        {
          method: "POST",
          body: {
            provider,
            meter
          }
        }
      );


    $("electricityValidation")
      .innerHTML = `

      <div class="provider-status">
        ${escapeHtml(
          result.message ||
          "Meter validated."
        )}
      </div>

      <label>Amount</label>

      <input
        id="electricityAmount"
        type="number"
        placeholder="Enter amount"
      >

      <button
        class="primary-button"
        onclick="purchaseElectricity()"
      >
        Pay Electricity
      </button>
    `;


  } catch (error) {

    showProviderError(
      "electricityValidation",
      error
    );

  } finally {

    hideLoading();
  }
}


async function purchaseElectricity() {

  const provider =
    $("electricityProvider")?.value;

  const meter =
    $("meterNumber")?.value.trim();

  const amount =
    Number(
      $("electricityAmount")?.value
    );


  if (!amount) {

    toast(
      "Enter amount.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Processing electricity payment..."
    );


    const result =
      await api(
        "/api/electricity/purchase",
        {
          method: "POST",
          body: {
            provider,
            meter,
            amount
          }
        }
      );


    toast(
      result.message ||
      "Electricity payment successful.",
      "success"
    );


    closeModal();

    await loadWallet();
    await loadTransactions();


  } catch (error) {

    toast(
      error.message ||
      "Electricity payment failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   RECHARGE PIN
========================================================= */

async function openRechargePin() {

  openModal(
    "Recharge PIN",
    `
      <div id="rechargePinContent">
        Loading airtime PIN networks...
      </div>
    `
  );


  try {

    const result =
      await api(
        "/api/provider/airtime-pin-networks"
      );


    airtimePinNetworks =
      result.networks ||
      result.data ||
      [];


    renderRechargePin();


  } catch (error) {

    showProviderError(
      "rechargePinContent",
      error
    );
  }
}


function renderRechargePin() {

  const el =
    $("rechargePinContent");

  if (!el) return;


  const options =
    airtimePinNetworks
      .map(network => {

        const value =
          network.code ||
          network.network ||
          network.id ||
          network.name ||
          "";

        const label =
          network.name ||
          network.network ||
          network.label ||
          value;

        return `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `;
      })
      .join("");


  el.innerHTML = `

    <label>Network</label>

    <select id="rechargePinNetwork">
      <option value="">
        Select network
      </option>

      ${options}
    </select>


    <label>Amount</label>

    <input
      id="rechargePinAmount"
      type="number"
      placeholder="Enter amount"
    >


    <label>Quantity</label>

    <input
      id="rechargePinQuantity"
      type="number"
      min="1"
      value="1"
    >


    <button
      class="primary-button"
      onclick="purchaseRechargePin()"
    >
      Buy Recharge PIN
    </button>
  `;
}


async function purchaseRechargePin() {

  const network =
    $("rechargePinNetwork")?.value;

  const amount =
    Number(
      $("rechargePinAmount")?.value
    );

  const quantity =
    Number(
      $("rechargePinQuantity")?.value
    );


  if (!network || !amount) {

    toast(
      "Complete the recharge PIN details.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Generating recharge PIN..."
    );


    const result =
      await api(
        "/api/recharge-pin/purchase",
        {
          method: "POST",
          body: {
            network,
            amount,
            quantity
          }
        }
      );


    toast(
      result.message ||
      "Recharge PIN generated.",
      "success"
    );


    closeModal();

    await loadWallet();
    await loadTransactions();


  } catch (error) {

    toast(
      error.message ||
      "Recharge PIN purchase failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   DATA PIN
========================================================= */

async function openDataPin() {

  openModal(
    "Data PIN",
    `
      <div id="dataPinContent">
        Loading data PIN networks...
      </div>
    `
  );


  try {

    const result =
      await api(
        "/api/provider/data-pin-networks"
      );


    dataPinNetworks =
      result.networks ||
      result.data ||
      [];


    renderDataPin();


  } catch (error) {

    showProviderError(
      "dataPinContent",
      error
    );
  }
}


function renderDataPin() {

  const el =
    $("dataPinContent");

  if (!el) return;


  const options =
    dataPinNetworks
      .map(network => {

        const value =
          network.code ||
          network.network ||
          network.id ||
          network.name ||
          "";

        const label =
          network.name ||
          network.network ||
          network.label ||
          value;

        return `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `;
      })
      .join("");


  el.innerHTML = `

    <label>Network</label>

    <select id="dataPinNetwork">
      <option value="">
        Select network
      </option>

      ${options}
    </select>


    <label>Amount</label>

    <input
      id="dataPinAmount"
      type="number"
      placeholder="Enter amount"
    >


    <label>Quantity</label>

    <input
      id="dataPinQuantity"
      type="number"
      min="1"
      value="1"
    >


    <button
      class="primary-button"
      onclick="purchaseDataPin()"
    >
      Buy Data PIN
    </button>
  `;
}


async function purchaseDataPin() {

  const network =
    $("dataPinNetwork")?.value;

  const amount =
    Number(
      $("dataPinAmount")?.value
    );

  const quantity =
    Number(
      $("dataPinQuantity")?.value
    );


  if (!network || !amount) {

    toast(
      "Complete the Data PIN details.",
      "error"
    );

    return;
  }


  try {

    showLoading(
      "Generating Data PIN..."
    );


    const result =
      await api(
        "/api/data-pin/purchase",
        {
          method: "POST",
          body: {
            network,
            amount,
            quantity
          }
        }
      );


    toast(
      result.message ||
      "Data PIN generated.",
      "success"
    );


    closeModal();

    await loadWallet();
    await loadTransactions();


  } catch (error) {

    toast(
      error.message ||
      "Data PIN purchase failed.",
      "error"
    );

  } finally {

    hideLoading();
  }
}


/* =========================================================
   COMING SOON SERVICES
========================================================= */

function openEduPin() {

  toast(
    "Edu PIN is coming soon.",
    "normal"
  );
}


function openBulkSMS() {

  toast(
    "Bulk SMS is coming soon.",
    "normal"
  );
}


function openAirtimeSwap() {

  toast(
    "Airtime Swap is coming soon.",
    "normal"
  );
}


/* =========================================================
   TRANSACTIONS
========================================================= */

async function loadTransactions() {

  try {

    const result =
      await api(
        "/api/transactions"
      );


    const transactions =
      result.transactions ||
      result.data ||
      [];


    renderTransactions(
      transactions
    );


  } catch (error) {

    console.error(
      "TRANSACTIONS ERROR:",
      error
    );
  }
}


function renderTransactions(
  transactions
) {

  const recent =
    $("recentTransactions");

  const history =
    $("historyList");


  if (
    !Array.isArray(transactions) ||
    transactions.length === 0
  ) {

    if (recent) {

      recent.innerHTML =
        `<div class="empty-state">
          No transactions yet
        </div>`;
    }


    if (history) {

      history.innerHTML =
        `<div class="empty-state">
          No transactions yet
        </div>`;
    }


    return;
  }


  const html =
    transactions
      .slice(0, 20)
      .map(transaction => {

        const type =
          transaction.type ||
          transaction.service ||
          "Transaction";

        const amount =
          Number(
            transaction.amount ||
            0
          );


        return `
          <div class="transaction-item">

            <div class="transaction-icon">
              💳
            </div>

            <div class="transaction-info">

              <strong>
                ${escapeHtml(type)}
              </strong>

              <small>
                ${escapeHtml(
                  transaction.status ||
                  "Completed"
                )}
              </small>

            </div>

            <div class="transaction-amount">
              ${formatNaira(amount)}
            </div>

          </div>
        `;

      })
      .join("");


  if (recent) {

    recent.innerHTML =
      html;
  }


  if (history) {

    history.innerHTML =
      html;
  }
}


function openHistory() {

  showPage(
    "historyPage"
  );

  loadTransactions();
}


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(
  pageId,
  button = null
) {

  const pages =
    document.querySelectorAll(
      ".page"
    );


  pages.forEach(
    page =>
      page.classList.add(
        "hidden"
      )
  );


  const page =
    $(pageId);


  if (page) {

    page.classList.remove(
      "hidden"
    );
  }


  const navButtons =
    document.querySelectorAll(
      ".bottom-nav button"
    );


  navButtons.forEach(
    btn =>
      btn.classList.remove(
        "active"
      )
  );


  if (button) {

    button.classList.add(
      "active"
    );

  } else {

    if (
      pageId === "homePage" &&
      $("navHome")
    ) {
      $("navHome")
        .classList.add("active");
    }

    if (
      pageId === "historyPage" &&
      $("navHistory")
    ) {
      $("navHistory")
        .classList.add("active");
    }

    if (
      pageId === "accountPage" &&
      $("navAccount")
    ) {
      $("navAccount")
        .classList.add("active");
    }
  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function scrollToServices() {

  showPage(
    "homePage",
    $("navServices")
  );


  setTimeout(() => {

    const sections =
      document.querySelectorAll(
        "#homePage .section"
      );

    if (sections.length) {

      sections[0]
        .scrollIntoView({
          behavior: "smooth"
        });
    }

  }, 100);
}


/* =========================================================
   ACCOUNT
========================================================= */

function showBonus() {

  toast(
    "Bonus feature is ready for the next wallet/reward update.",
    "normal"
  );
}


function showNotifications() {

  toast(
    "No new notifications.",
    "normal"
  );
}


function showSecurity() {

  toast(
    "Security settings will be added here.",
    "normal"
  );
}


function showSupport() {

  toast(
    "Support: contact SIH DATA SUB support.",
    "normal"
  );
}


function showAbout() {

  toast(
    "SIH DATA SUB — Fast, Secure and Reliable VTU Services.",
    "normal"
  );
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

  try {

    const token =
      getToken();


    if (token) {

      await api(
        "/api/auth/logout",
        {
          method: "POST"
        }
      );
    }

  } catch (error) {

    console.warn(
      "Logout API error:",
      error
    );

  } finally {

    clearAuth();

    closeModal();

    closeFundWallet();

    showLogin();

    toast(
      "You have been logged out.",
      "success"
    );
  }
}


/* =========================================================
   PROVIDER ERROR
========================================================= */

function showProviderError(
  elementId,
  error
) {

  const el =
    $(elementId);

  if (!el) return;


  let message =
    error?.message ||
    "Unable to connect to provider.";


  /*
    Never show a misleading
    application-login message for
    provider failures.
  */

  if (
    error?.status === 502
  ) {

    message =
      "VTUPLUG could not process this request. Please check the VTUPLUG API configuration.";
  }


  el.innerHTML = `
    <div class="empty-state">

      <strong>
        Service unavailable
      </strong>

      <p style="margin-top:8px;">
        ${escapeHtml(message)}
      </p>

    </div>
  `;
}


/* =========================================================
   HTML SAFETY
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   STARTUP
========================================================= */

async function startApp() {

  /*
    Show splash briefly.
  */

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        900
      )
  );


  currentToken =
    getToken();

  currentUser =
    getSavedUser();


  /*
    No saved login.
  */

  if (!currentToken) {

    hide("loadingScreen");

    showLogin();

    return;
  }


  /*
    We have a saved token.
    Verify it with OUR backend.
  */

  const valid =
    await loadCurrentUser();


  hide("loadingScreen");


  if (valid) {

    await openDashboard();

  } else {

    clearAuth();

    showLogin();
  }
}


/* =========================================================
   FORM EVENTS
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const loginForm =
      $("loginForm");

    if (loginForm) {

      loginForm.addEventListener(
        "submit",
        login
      );
    }


    const signupForm =
      $("signupForm");

    if (signupForm) {

      signupForm.addEventListener(
        "submit",
        signup
      );
    }


    const forgotForm =
      $("forgotForm");

    if (forgotForm) {

      forgotForm.addEventListener(
        "submit",
        forgotPassword
      );
    }


    startApp();
  }
);