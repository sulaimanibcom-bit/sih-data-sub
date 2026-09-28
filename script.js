/* =========================================================
   SIH DATA SUB
   COMPLETE SCRIPT.JS
   SIGNUP FLOW:
   FULL NAME
   PHONE NUMBER
   GMAIL / EMAIL
   PASSWORD
   CONFIRM PASSWORD
   ↓
   SIGN UP
   ↓
   OTP SENT TO GMAIL
   ↓
   ENTER 6-DIGIT OTP
   ↓
   AUTOMATIC VERIFICATION
   ↓
   ACCOUNT CREATED
   ↓
   DASHBOARD
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const API_BASE = "http://localhost:5100";

const TOKEN_KEY = "sihDataSubToken";
const USER_KEY = "sihDataSubUser";
const TRANSACTIONS_KEY = "sihDataSubTransactions";
const BONUS_KEY = "sihDataSubBonus";


/* =========================================================
   APP STATE
========================================================= */

let currentUser = null;
let authToken = null;
let currentService = null;
let toastTimer = null;
let splashTimer = null;

let signupWaitingForOTP = false;
let otpVerificationRunning = false;


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function $all(selector) {
  return document.querySelectorAll(selector);
}


function on(id, event, handler) {

  const element = $(id);

  if (!element) {
    return;
  }

  element.addEventListener(
    event,
    handler
  );
}


/* =========================================================
   SESSION
========================================================= */

function saveSession(token, user) {

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

}


function loadSession() {

  authToken =
    localStorage.getItem(
      TOKEN_KEY
    );

  const savedUser =
    localStorage.getItem(
      USER_KEY
    );


  if (savedUser) {

    try {

      currentUser =
        JSON.parse(
          savedUser
        );

    } catch (error) {

      currentUser = null;

    }

  }

}


function clearSession() {

  localStorage.removeItem(
    TOKEN_KEY
  );

  localStorage.removeItem(
    USER_KEY
  );

  authToken = null;
  currentUser = null;

}


/* =========================================================
   TRANSACTIONS
========================================================= */

function getTransactions() {

  try {

    return JSON.parse(
      localStorage.getItem(
        TRANSACTIONS_KEY
      ) || "[]"
    );

  } catch (error) {

    return [];

  }

}


function saveTransactions(
  transactions
) {

  localStorage.setItem(
    TRANSACTIONS_KEY,
    JSON.stringify(
      transactions
    )
  );

}


function addTransaction(
  transaction
) {

  const transactions =
    getTransactions();

  transactions.unshift(
    transaction
  );

  saveTransactions(
    transactions.slice(
      0,
      100
    )
  );

}


/* =========================================================
   BONUS
========================================================= */

function getBonus() {

  const value =
    Number(
      localStorage.getItem(
        BONUS_KEY
      )
    );

  return Number.isFinite(value)
    ? value
    : 0;

}


function setBonus(amount) {

  localStorage.setItem(
    BONUS_KEY,
    String(
      Math.max(
        0,
        Number(amount) || 0
      )
    )
  );

}


/* =========================================================
   FORMATTERS
========================================================= */

function formatMoney(amount) {

  const number =
    Number(amount) || 0;

  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(number);

}


function formatDate(dateValue) {

  if (!dateValue) {
    return "";
  }

  const date =
    new Date(
      dateValue
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }

  return date.toLocaleString(
    "en-NG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}


/* =========================================================
   LOADING
========================================================= */

function showLoading(
  message = "Processing..."
) {

  const overlay =
    $("loadingOverlay");

  const text =
    $("loadingText");


  if (text) {

    text.textContent =
      message;

  }


  if (overlay) {

    overlay.classList.remove(
      "hidden"
    );

  }

}


function hideLoading() {

  const overlay =
    $("loadingOverlay");

  if (overlay) {

    overlay.classList.add(
      "hidden"
    );

  }

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message,
  type = "success"
) {

  const toast =
    $("toast");

  const icon =
    $("toastIcon");

  const messageElement =
    $("toastMessage");


  if (!toast) {

    console.log(
      `[${type}] ${message}`
    );

    return;

  }


  if (messageElement) {

    messageElement.textContent =
      message;

  }


  if (icon) {

    icon.textContent =
      type === "success"
        ? "✓"
        : "!";

  }


  toast.classList.remove(
    "hidden"
  );


  clearTimeout(
    toastTimer
  );


  toastTimer =
    setTimeout(
      () => {

        toast.classList.add(
          "hidden"
        );

      },
      3500
    );

}


/* =========================================================
   FORM MESSAGES
========================================================= */

function setMessage(
  element,
  message,
  type = "error"
) {

  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.style.color =
    type === "success"
      ? "#159447"
      : type === "warning"
        ? "#9a6b00"
        : "#dc3545";

}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

  const modal =
    $(id);

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "hidden"
  );

}


function closeModal(id) {

  const modal =
    $(id);

  if (!modal) {
    return;
  }

  modal.classList.add(
    "hidden"
  );

}


function closeAllModals() {

  $all(".modal").forEach(
    modal => {

      modal.classList.add(
        "hidden"
      );

    }
  );

}


/* =========================================================
   API REQUEST
========================================================= */

async function apiRequest(
  endpoint,
  options = {}
) {

  const headers = {

    "Content-Type":
      "application/json",

    ...(options.headers || {})

  };


  if (authToken) {

    headers.Authorization =
      `Bearer ${authToken}`;

  }


  const response =
    await fetch(
      `${API_BASE}${endpoint}`,
      {
        ...options,
        headers
      }
    );


  let data = null;


  try {

    data =
      await response.json();

  } catch (error) {

    data = null;

  }


  if (!response.ok) {

    const error =
      new Error(
        data?.message ||
        `Request failed (${response.status})`
      );

    error.status =
      response.status;

    throw error;

  }


  return data;

}


/* =========================================================
   SERVER CHECK
========================================================= */

async function checkServer() {

  const status =
    $("connectionStatus");


  try {

    const data =
      await apiRequest(
        "/api/health"
      );


    if (
      data &&
      data.success &&
      data.server
    ) {

      if (status) {

        status.textContent =
          "Online";

        status.style.background =
          "#edf8f1";

        status.style.color =
          "#159447";

      }

      return true;

    }


    throw new Error(
      "Server unavailable"
    );


  } catch (error) {

    if (status) {

      status.textContent =
        "Offline";

      status.style.background =
        "#fff0f1";

      status.style.color =
        "#dc3545";

    }

    return false;

  }

}


/* =========================================================
   SPLASH
========================================================= */

function startSplash() {

  const progress =
    $("splashProgress");


  if (!progress) {

    finishSplash();

    return;

  }


  let value = 0;


  clearInterval(
    splashTimer
  );


  splashTimer =
    setInterval(
      () => {

        value +=
          Math.floor(
            Math.random() * 12
          ) + 5;


        if (value >= 100) {

          value = 100;

          clearInterval(
            splashTimer
          );

        }


        progress.style.width =
          `${value}%`;


        if (value >= 100) {

          setTimeout(
            finishSplash,
            350
          );

        }

      },
      100
    );

}


function finishSplash() {

  const splash =
    $("splashScreen");


  if (splash) {

    splash.classList.add(
      "hidden"
    );

  }


  loadSession();


  if (
    authToken &&
    currentUser
  ) {

    showMainApp();

  } else {

    showAuth();

  }

}


/* =========================================================
   AUTH SCREEN
========================================================= */

function showAuth() {

  const auth =
    $("authScreen");

  const main =
    $("mainScreen");


  if (auth) {

    auth.classList.remove(
      "hidden"
    );

  }


  if (main) {

    main.classList.add(
      "hidden"
    );

  }

}


/* =========================================================
   MAIN APP
========================================================= */

function showMainApp() {

  const auth =
    $("authScreen");

  const main =
    $("mainScreen");


  if (auth) {

    auth.classList.add(
      "hidden"
    );

  }


  if (main) {

    main.classList.remove(
      "hidden"
    );

  }


  updateUserUI();

  showPage(
    "homePage"
  );

  loadWallet();

  checkServer();

  renderTransactions();

}


/* =========================================================
   USER UI
========================================================= */

function updateUserUI() {

  if (!currentUser) {
    return;
  }


  const name =
    currentUser.name ||
    "User";

  const email =
    currentUser.email ||
    "";


  if ($("welcomeName")) {

    $("welcomeName")
      .textContent =
      `Welcome, ${name}`;

  }


  if ($("profileName")) {

    $("profileName")
      .textContent =
      name;

  }


  if ($("profileEmail")) {

    $("profileEmail")
      .textContent =
      email;

  }


  const avatar =
    document.querySelector(
      ".profile-avatar"
    );


  if (avatar) {

    avatar.textContent =
      name
        .trim()
        .charAt(0)
        .toUpperCase() || "U";

  }

}


/* =========================================================
   LOGIN
========================================================= */

async function loginUser(
  email,
  password
) {

  email =
    String(
      email || ""
    )
      .trim()
      .toLowerCase();

  password =
    String(
      password || ""
    );


  if (!email) {

    setMessage(
      $("loginMessage"),
      "Enter your email."
    );

    return;

  }


  if (!password) {

    setMessage(
      $("loginMessage"),
      "Enter your password."
    );

    return;

  }


  showLoading(
    "Signing you in..."
  );


  try {

    const data =
      await apiRequest(
        "/api/auth/login",
        {
          method: "POST",

          body:
            JSON.stringify({
              email,
              password
            })

        }
      );


    if (
      !data ||
      !data.success ||
      !data.token
    ) {

      throw new Error(
        data?.message ||
        "Login failed."
      );

    }


    authToken =
      data.token;

    currentUser =
      data.user || null;


    saveSession(
      authToken,
      currentUser
    );


    $("loginForm")?.reset();


    showToast(
      "Login successful."
    );


    showMainApp();


  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );


    setMessage(
      $("loginMessage"),
      error.message ||
      "Unable to login."
    );

  } finally {

    hideLoading();

  }

}


/* =========================================================
   CREATE PHONE FIELD
========================================================= */

function createPhoneField() {

  const form =
    $("signupForm");


  if (!form) {
    return;
  }


  if ($("signupPhone")) {
    return;
  }


  const nameInput =
    $("signupName");


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "form-group";


  wrapper.innerHTML = `

    <label
      for="signupPhone"
    >
      Phone Number
    </label>

    <input
      id="signupPhone"
      type="tel"
      inputmode="numeric"
      autocomplete="tel"
      maxlength="11"
      placeholder="08012345678"
    >

  `;


  if (
    nameInput &&
    nameInput.parentElement
  ) {

    nameInput.parentElement.after(
      wrapper
    );

  } else {

    form.prepend(
      wrapper
    );

  }

}


/* =========================================================
   PREPARE SIGNUP INTERFACE
========================================================= */

function prepareSignupInterface() {

  const form =
    $("signupForm");


  if (!form) {
    return;
  }


  createPhoneField();


  const otp =
    $("signupOtp");


  /*
    Hide OTP input at first.
  */

  if (otp) {

    otp.style.display =
      "none";

    otp.value =
      "";

    otp.setAttribute(
      "maxlength",
      "6"
    );

    otp.setAttribute(
      "inputmode",
      "numeric"
    );

    otp.setAttribute(
      "autocomplete",
      "one-time-code"
    );

  }


  /*
    Hide the existing OTP label
    until OTP has actually been sent.
  */

  if (otp) {

    const otpParent =
      otp.parentElement;


    if (otpParent) {

      const label =
        otpParent.querySelector(
          "label"
        );


      if (label) {

        label.style.display =
          "none";

      }

    }

  }


  /*
    Hide old Send OTP button.
  */

  const oldOtpButton =
    $("sendOtpButton");


  if (oldOtpButton) {

    oldOtpButton.style.display =
      "none";

  }


  /*
    Create OTP information box.
  */

  let otpMessage =
    $("signupOtpMessage");


  if (!otpMessage) {

    otpMessage =
      document.createElement(
        "div"
      );

    otpMessage.id =
      "signupOtpMessage";


    otpMessage.style.display =
      "none";


    otpMessage.style.margin =
      "10px 0";


    otpMessage.style.padding =
      "12px";


    otpMessage.style.borderRadius =
      "10px";


    otpMessage.style.background =
      "#edf5ff";


    otpMessage.style.color =
      "#2864d7";


    otpMessage.style.fontSize =
      "14px";


    if (otp) {

      otp.parentElement?.before(
        otpMessage
      );

    }

  }


  /*
    Find the Sign Up button.
  */

  const buttons =
    form.querySelectorAll(
      "button"
    );


  let signupButton = null;


  buttons.forEach(
    button => {

      const text =
        button.textContent
          .trim()
          .toLowerCase();


      if (
        text.includes(
          "sign up"
        )
      ) {

        signupButton =
          button;

      }

    }
  );


  /*
    If no button was found,
    use the last button.
  */

  if (
    !signupButton &&
    buttons.length
  ) {

    signupButton =
      buttons[
        buttons.length - 1
      ];

  }


  if (signupButton) {

    signupButton.type =
      "button";


    signupButton.id =
      "signupSubmitButton";


    signupButton.textContent =
      "Sign Up";

  }


  /*
    Password autocomplete.
  */

  if ($("signupPassword")) {

    $("signupPassword")
      .autocomplete =
      "new-password";

  }


  if ($("signupPassword2")) {

    $("signupPassword2")
      .autocomplete =
      "new-password";

  }


  if ($("signupEmail")) {

    $("signupEmail")
      .autocomplete =
      "email";

  }

}


/* =========================================================
   SIGNUP VALIDATION
========================================================= */

function getSignupData() {

  return {

    name:
      $("signupName")?.value
        .trim() || "",

    phone:
      $("signupPhone")?.value
        .trim() || "",

    email:
      $("signupEmail")?.value
        .trim()
        .toLowerCase() || "",

    password:
      $("signupPassword")?.value || "",

    password2:
      $("signupPassword2")?.value || ""

  };

}


/* =========================================================
   SIGNUP
========================================================= */

async function signupUser() {

  /*
    If OTP has already been sent,
    pressing the button means VERIFY.
  */

  if (signupWaitingForOTP) {

    await verifySignupOTP();

    return;

  }


  const data =
    getSignupData();


  /* -------------------------------------------------------
     NAME
  ------------------------------------------------------- */

  if (!data.name) {

    setMessage(
      $("signupMessage"),
      "Enter your full name."
    );

    $("signupName")?.focus();

    return;

  }


  /* -------------------------------------------------------
     PHONE
  ------------------------------------------------------- */

  if (
    !/^0\d{10}$/.test(
      data.phone
    )
  ) {

    setMessage(
      $("signupMessage"),
      "Enter a valid 11-digit phone number."
    );

    $("signupPhone")?.focus();

    return;

  }


  /* -------------------------------------------------------
     EMAIL
  ------------------------------------------------------- */

  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/
      .test(
        data.email
      )
  ) {

    setMessage(
      $("signupMessage"),
      "Enter a valid Gmail address."
    );

    $("signupEmail")?.focus();

    return;

  }


  /* -------------------------------------------------------
     PASSWORD
  ------------------------------------------------------- */

  if (
    data.password.length < 8
  ) {

    setMessage(
      $("signupMessage"),
      "Password must be at least 8 characters."
    );

    $("signupPassword")?.focus();

    return;

  }


  /* -------------------------------------------------------
     CONFIRM PASSWORD
  ------------------------------------------------------- */

  if (
    data.password !==
    data.password2
  ) {

    setMessage(
      $("signupMessage"),
      "Passwords do not match."
    );

    $("signupPassword2")?.focus();

    return;

  }


  /* -------------------------------------------------------
     SEND OTP
  ------------------------------------------------------- */

  showLoading(
    "Sending OTP to your Gmail..."
  );


  try {

    const response =
      await apiRequest(
        "/api/auth/request-otp",
        {
          method: "POST",

          body:
            JSON.stringify({
              name:
                data.name,

              email:
                data.email,

              phone:
                data.phone
            })

        }
      );


    if (
      !response ||
      !response.success
    ) {

      throw new Error(
        response?.message ||
        "Unable to send OTP."
      );

    }


    /*
      OTP is now waiting.
    */

    signupWaitingForOTP =
      true;


    /*
      Show OTP input.
    */

    const otp =
      $("signupOtp");


    if (otp) {

      otp.style.display =
        "block";


      otp.value =
        "";


      const otpParent =
        otp.parentElement;


      if (otpParent) {

        const label =
          otpParent.querySelector(
            "label"
          );


        if (label) {

          label.style.display =
            "block";

        }

      }


      otp.focus();

    }


    /*
      Show OTP message.
    */

    const otpMessage =
      $("signupOtpMessage");


    if (otpMessage) {

      otpMessage.style.display =
        "block";


      otpMessage.innerHTML = `

        <strong>
          OTP sent successfully
        </strong>

        <br>

        Check your Gmail and enter
        the 6-digit verification code.

      `;

    }


    /*
      Change button.
    */

    const button =
      $("signupSubmitButton");


    if (button) {

      button.textContent =
        "Verify OTP";

    }


    setMessage(
      $("signupMessage"),
      "OTP sent to your Gmail.",
      "success"
    );


    showToast(
      "OTP sent to your Gmail."
    );


  } catch (error) {

    console.error(
      "SIGNUP OTP ERROR:",
      error
    );


    setMessage(
      $("signupMessage"),
      error.message ||
      "Unable to send OTP."
    );

  } finally {

    hideLoading();

  }

}


/* =========================================================
   VERIFY OTP
========================================================= */

async function verifySignupOTP() {

  if (!signupWaitingForOTP) {
    return;
  }


  if (otpVerificationRunning) {
    return;
  }


  const data =
    getSignupData();


  const otp =
    $("signupOtp")?.value
      .trim() || "";


  if (
    !/^\d{6}$/.test(
      otp
    )
  ) {

    showToast(
      "Enter the complete 6-digit OTP.",
      "warning"
    );

    $("signupOtp")?.focus();

    return;

  }


  otpVerificationRunning =
    true;


  showLoading(
    "Verifying OTP and creating your account..."
  );


  try {

    const response =
      await apiRequest(
        "/api/auth/verify-otp",
        {
          method: "POST",

          body:
            JSON.stringify({

              name:
                data.name,

              phone:
                data.phone,

              email:
                data.email,

              otp:
                otp,

              password:
                data.password

            })

        }
      );


    if (
      !response ||
      !response.success ||
      !response.token
    ) {

      throw new Error(
        response?.message ||
        "Unable to create account."
      );

    }


    /*
      ACCOUNT CREATED
    */

    signupWaitingForOTP =
      false;


    authToken =
      response.token;


    currentUser =
      response.user || {

        id:
          "",

        name:
          data.name,

        email:
          data.email,

        phone:
          data.phone

      };


    /*
      Keep phone in frontend session.
    */

    currentUser.phone =
      currentUser.phone ||
      data.phone;


    saveSession(
      authToken,
      currentUser
    );


    /*
      Success message.
    */

    setMessage(
      $("signupMessage"),
      "Account created successfully!",
      "success"
    );


    showToast(
      "Account created successfully!"
    );


    /*
      Reset signup interface.
    */

    $("signupForm")?.reset();


    const otpInput =
      $("signupOtp");


    if (otpInput) {

      otpInput.style.display =
        "none";

    }


    const otpParent =
      otpInput?.parentElement;


    if (otpParent) {

      const label =
        otpParent.querySelector(
          "label"
        );


      if (label) {

        label.style.display =
          "none";

      }

    }


    const otpMessage =
      $("signupOtpMessage");


    if (otpMessage) {

      otpMessage.style.display =
        "none";

    }


    const signupButton =
      $("signupSubmitButton");


    if (signupButton) {

      signupButton.textContent =
        "Sign Up";

    }


    /*
      Open dashboard automatically.
    */

    setTimeout(
      () => {

        showMainApp();

      },
      700
    );


  } catch (error) {

    console.error(
      "OTP VERIFY ERROR:",
      error
    );


    setMessage(
      $("signupMessage"),
      error.message ||
      "Incorrect or expired OTP."
    );


    $("signupOtp")?.focus();


  } finally {

    otpVerificationRunning =
      false;

    hideLoading();

  }

}


/* =========================================================
   OTP INPUT
========================================================= */

function setupOTPInput() {

  const otp =
    $("signupOtp");


  if (!otp) {
    return;
  }


  otp.addEventListener(
    "input",
    () => {

      otp.value =
        otp.value
          .replace(
            /\D/g,
            ""
          )
          .slice(
            0,
            6
          );


      /*
        Automatically verify after
        the sixth digit.
      */

      if (
        otp.value.length === 6 &&
        signupWaitingForOTP
      ) {

        verifySignupOTP();

      }

    }
  );

}


/* =========================================================
   WALLET
========================================================= */

async function loadWallet() {

  if (!authToken) {
    return;
  }


  try {

    const data =
      await apiRequest(
        "/api/wallet"
      );


    if (
      !data ||
      !data.success ||
      !data.wallet
    ) {

      throw new Error(
        "Wallet data unavailable."
      );

    }


    const balance =
      Number(
        data.wallet.balance
      ) || 0;


    if ($("walletBalance")) {

      $("walletBalance")
        .textContent =
        formatMoney(
          balance
        );

    }


    if ($("transactionWallet")) {

      $("transactionWallet")
        .textContent =
        formatMoney(
          balance
        );

    }


    if ($("bonusBalance")) {

      $("bonusBalance")
        .textContent =
        formatMoney(
          getBonus()
        );

    }


  } catch (error) {

    console.error(
      "WALLET ERROR:",
      error
    );


    if (
      error.status === 401
    ) {

      handleExpiredSession();

    }

  }

}


/* =========================================================
   EXPIRED SESSION
========================================================= */

function handleExpiredSession() {

  clearSession();

  closeAllModals();

  showAuth();

  showToast(
    "Your session has expired.",
    "warning"
  );

}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(
  pageId
) {

  $all(".page").forEach(
    page => {

      page.classList.add(
        "hidden"
      );

      page.classList.remove(
        "active-page"
      );

    }
  );


  const selected =
    $(pageId);


  if (!selected) {
    return;
  }


  selected.classList.remove(
    "hidden"
  );

  selected.classList.add(
    "active-page"
  );


  $all(".nav-item")
    .forEach(
      item => {

        item.classList.toggle(
          "active",
          item.dataset.page ===
          pageId
        );

      }
    );


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


  if (
    pageId ===
    "transactionsPage"
  ) {

    renderTransactions();

  }

}


/* =========================================================
   TRANSACTIONS
========================================================= */

function renderTransactions() {

  const transactions =
    getTransactions();


  if ($("transactionCount")) {

    $("transactionCount")
      .textContent =
      transactions.length;

  }


  renderTransactionContainer(
    $("recentTransactions"),
    transactions.slice(
      0,
      5
    )
  );


  renderTransactionContainer(
    $("allTransactions"),
    transactions
  );

}


function renderTransactionContainer(
  container,
  transactions
) {

  if (!container) {
    return;
  }


  if (!transactions.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          🧾
        </div>

        <strong>
          No transactions yet
        </strong>

        <p>
          Your recent activity will appear here.
        </p>

      </div>

    `;

    return;

  }


  container.innerHTML =
    transactions
      .map(
        transaction => {

          const credit =
            transaction.type ===
            "credit";


          return `

            <div class="transaction-item">

              <div class="transaction-icon">

                ${
                  escapeHTML(
                    transaction.icon ||
                    "🧾"
                  )
                }

              </div>

              <div class="transaction-details">

                <strong>
                  ${
                    escapeHTML(
                      transaction.title ||
                      "Transaction"
                    )
                  }
                </strong>

                <small>
                  ${
                    escapeHTML(
                      formatDate(
                        transaction.date
                      )
                    )
                  }
                </small>

              </div>

              <div
                class="transaction-amount ${
                  credit
                    ? "credit"
                    : "debit"
                }"
              >

                ${
                  credit
                    ? "+"
                    : "-"
                }${
                  formatMoney(
                    Math.abs(
                      Number(
                        transaction.amount
                      ) || 0
                    )
                  )
                }

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   SERVICES
========================================================= */

const SERVICE_CONFIG = {

  data: {
    title: "Data",
    icon: "📶",
    description:
      "Choose your network and data package."
  },

  airtime: {
    title: "Airtime",
    icon: "📱",
    description:
      "Recharge a mobile phone."
  },

  cable: {
    title: "Cable TV",
    icon: "📺",
    description:
      "Cable subscription service."
  },

  electricity: {
    title: "Electricity",
    icon: "⚡",
    description:
      "Electricity bill payment."
  },

  education: {
    title: "Education PIN",
    icon: "🎓",
    description:
      "Education PIN service."
  },

  bulksms: {
    title: "Bulk SMS",
    icon: "💬",
    description:
      "Bulk SMS service."
  }

};


function openService(
  service
) {

  const config =
    SERVICE_CONFIG[
      service
    ];


  if (!config) {
    return;
  }


  currentService =
    service;


  if ($("serviceModalIcon")) {

    $("serviceModalIcon")
      .textContent =
      config.icon;

  }


  if ($("serviceModalTitle")) {

    $("serviceModalTitle")
      .textContent =
      config.title;

  }


  if ($("serviceModalDescription")) {

    $("serviceModalDescription")
      .textContent =
      config.description;

  }


  renderServiceForm(
    service
  );


  openModal(
    "serviceModal"
  );

}


function renderServiceForm(
  service
) {

  const area =
    $("serviceFormArea");


  if (!area) {
    return;
  }


  if (
    service === "data"
  ) {

    area.innerHTML = `

      <div class="form-group">

        <label>
          Network
        </label>

        <select id="dataNetwork">

          <option value="">
            Select network
          </option>

          <option value="MTN">
            MTN
          </option>

          <option value="Airtel">
            Airtel
          </option>

          <option value="Glo">
            Glo
          </option>

          <option value="9mobile">
            9mobile
          </option>

        </select>

      </div>

      <div class="form-group">

        <label>
          Phone Number
        </label>

        <input
          id="dataPhone"
          type="tel"
          inputmode="numeric"
          maxlength="11"
          placeholder="08012345678"
        >

      </div>

      <div class="form-group">

        <label>
          Data Plan
        </label>

        <select id="dataPlan">

          <option value="">
            Select plan
          </option>

          <option value="500MB">
            500MB
          </option>

          <option value="1GB">
            1GB
          </option>

          <option value="2GB">
            2GB
          </option>

          <option value="5GB">
            5GB
          </option>

        </select>

      </div>

      <button
        class="primary-button"
        type="button"
        id="serviceActionButton"
      >
        Continue
      </button>

    `;

  }


  else if (
    service === "airtime"
  ) {

    area.innerHTML = `

      <div class="form-group">

        <label>
          Network
        </label>

        <select id="airtimeNetwork">

          <option value="">
            Select network
          </option>

          <option value="MTN">
            MTN
          </option>

          <option value="Airtel">
            Airtel
          </option>

          <option value="Glo">
            Glo
          </option>

          <option value="9mobile">
            9mobile
          </option>

        </select>

      </div>

      <div class="form-group">

        <label>
          Phone Number
        </label>

        <input
          id="airtimePhone"
          type="tel"
          inputmode="numeric"
          maxlength="11"
          placeholder="08012345678"
        >

      </div>

      <div class="form-group">

        <label>
          Amount
        </label>

        <input
          id="airtimeAmount"
          type="number"
          min="50"
          placeholder="Enter amount"
        >

      </div>

      <button
        class="primary-button"
        type="button"
        id="serviceActionButton"
      >
        Continue
      </button>

    `;

  }


  else {

    const config =
      SERVICE_CONFIG[
        service
      ];


    area.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          ${
            escapeHTML(
              config?.icon ||
              "⚡"
            )
          }
        </div>

        <strong>
          ${
            escapeHTML(
              config?.title ||
              "Service"
            )
          }
        </strong>

        <p>
          This service interface is ready.
          Secure provider connection will be
          added before real transactions are enabled.
        </p>

      </div>

      <button
        class="primary-button"
        type="button"
        id="serviceActionButton"
      >
        Close
      </button>

    `;

  }


  const action =
    $("serviceActionButton");


  if (action) {

    action.addEventListener(
      "click",
      handleServiceAction
    );

  }

}


function handleServiceAction() {

  if (
    currentService ===
    "data"
  ) {

    const network =
      $("dataNetwork")?.value;

    const phone =
      $("dataPhone")?.value
        .trim();

    const plan =
      $("dataPlan")?.value;


    if (!network) {

      showToast(
        "Select a network.",
        "warning"
      );

      return;

    }


    if (
      !/^0\d{10}$/.test(
        phone || ""
      )
    ) {

      showToast(
        "Enter a valid 11-digit phone number.",
        "warning"
      );

      return;

    }


    if (!plan) {

      showToast(
        "Select a data plan.",
        "warning"
      );

      return;

    }


    showToast(
      "Data provider is not connected yet.",
      "warning"
    );

    return;

  }


  if (
    currentService ===
    "airtime"
  ) {

    const network =
      $("airtimeNetwork")?.value;

    const phone =
      $("airtimePhone")?.value
        .trim();

    const amount =
      Number(
        $("airtimeAmount")?.value
      );


    if (!network) {

      showToast(
        "Select a network.",
        "warning"
      );

      return;

    }


    if (
      !/^0\d{10}$/.test(
        phone || ""
      )
    ) {

      showToast(
        "Enter a valid 11-digit phone number.",
        "warning"
      );

      return;

    }


    if (
      !Number.isFinite(amount) ||
      amount < 50
    ) {

      showToast(
        "Enter a valid amount.",
        "warning"
      );

      return;

    }


    showToast(
      "Airtime provider is not connected yet.",
      "warning"
    );

    return;

  }


  closeModal(
    "serviceModal"
  );

}


/* =========================================================
   FUND WALLET
========================================================= */

function openFundWallet() {

  if ($("fundAmount")) {

    $("fundAmount")
      .value = "";

  }


  openModal(
    "fundWalletModal"
  );

}


function selectQuickAmount(
  amount
) {

  if ($("fundAmount")) {

    $("fundAmount")
      .value =
      amount;

  }

}


function continueFunding() {

  const amount =
    Number(
      $("fundAmount")?.value
    );


  if (
    !Number.isFinite(amount) ||
    amount < 100
  ) {

    showToast(
      "Enter an amount of at least ₦100.",
      "warning"
    );

    return;

  }


  closeModal(
    "fundWalletModal"
  );


  showToast(
    "Payment gateway is not connected yet.",
    "warning"
  );

}


/* =========================================================
   BONUS
========================================================= */

function redeemBonus() {

  if (
    getBonus() <= 0
  ) {

    showToast(
      "You have no bonus available.",
      "warning"
    );

    return;

  }


  showToast(
    "Bonus redemption will be enabled when the wallet system is finalized.",
    "warning"
  );

}


/* =========================================================
   NOTIFICATIONS
========================================================= */

function openNotifications() {

  openModal(
    "notificationModal"
  );

}


function clearNotificationBadge() {

  const badge =
    $("notificationBadge");


  if (badge) {

    badge.classList.add(
      "hidden"
    );

  }

}


/* =========================================================
   PROFILE
========================================================= */

function showProfileInfo() {

  const name =
    currentUser?.name ||
    "User";

  const email =
    currentUser?.email ||
    "";

  const phone =
    currentUser?.phone ||
    "Not available";


  if ($("infoModalIcon")) {

    $("infoModalIcon")
      .textContent =
      "👤";

  }


  if ($("infoModalTitle")) {

    $("infoModalTitle")
      .textContent =
      "Profile";

  }


  if ($("infoModalContent")) {

    $("infoModalContent")
      .innerHTML = `

        <strong>
          Name
        </strong>

        <br>

        ${escapeHTML(name)}

        <br><br>

        <strong>
          Phone
        </strong>

        <br>

        ${escapeHTML(phone)}

        <br><br>

        <strong>
          Email
        </strong>

        <br>

        ${escapeHTML(email)}

      `;

  }


  openModal(
    "infoModal"
  );

}


/* =========================================================
   SECURITY
========================================================= */

function showSecurityInfo() {

  if ($("infoModalIcon")) {

    $("infoModalIcon")
      .textContent =
      "🔐";

  }


  if ($("infoModalTitle")) {

    $("infoModalTitle")
      .textContent =
      "Security";

  }


  if ($("infoModalContent")) {

    $("infoModalContent")
      .innerHTML = `

        Your password is protected
        by the SIH DATA SUB backend.

        <br><br>

        Your login session uses
        secure authentication.

        <br><br>

        Never share your password,
        OTP or private credentials
        with anyone.

      `;

  }


  openModal(
    "infoModal"
  );

}


/* =========================================================
   SUPPORT
========================================================= */

function showSupportInfo() {

  if ($("infoModalIcon")) {

    $("infoModalIcon")
      .textContent =
      "💬";

  }


  if ($("infoModalTitle")) {

    $("infoModalTitle")
      .textContent =
      "Help & Support";

  }


  if ($("infoModalContent")) {

    $("infoModalContent")
      .innerHTML = `

        <strong>
          SIH DATA SUB Support
        </strong>

        <br><br>

        Official support contact
        information can be added
        when your support channel
        is ready.

      `;

  }


  openModal(
    "infoModal"
  );

}


/* =========================================================
   ABOUT
========================================================= */

function showAboutInfo() {

  if ($("infoModalIcon")) {

    $("infoModalIcon")
      .textContent =
      "ℹ️";

  }


  if ($("infoModalTitle")) {

    $("infoModalTitle")
      .textContent =
      "About SIH DATA SUB";

  }


  if ($("infoModalContent")) {

    $("infoModalContent")
      .innerHTML = `

        <strong>
          SIH DATA SUB
        </strong>

        <br>

        Fast • Secure • Reliable

        <br><br>

        A platform being developed
        for data, airtime, bills and
        other VTU services.

      `;

  }


  openModal(
    "infoModal"
  );

}


/* =========================================================
   LOGOUT
========================================================= */

function logoutUser() {

  const confirmed =
    window.confirm(
      "Are you sure you want to logout?"
    );


  if (!confirmed) {
    return;
  }


  clearSession();

  closeAllModals();

  showAuth();

  showToast(
    "You have been logged out."
  );

}


/* =========================================================
   PASSWORD SHOW / HIDE
========================================================= */

function setupPasswordToggles() {

  $all(
    ".password-toggle"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const target =
            $(button.dataset.target);


          if (!target) {
            return;
          }


          const showing =
            target.type ===
            "text";


          target.type =
            showing
              ? "password"
              : "text";


          button.textContent =
            showing
              ? "Show"
              : "Hide";

        }
      );

    }
  );

}


/* =========================================================
   AUTH TABS
========================================================= */

function showLoginTab() {

  $("loginTab")
    ?.classList.add(
      "active"
    );

  $("signupTab")
    ?.classList.remove(
      "active"
    );

  $("loginForm")
    ?.classList.remove(
      "hidden"
    );

  $("signupForm")
    ?.classList.add(
      "hidden"
    );

}


function showSignupTab() {

  $("signupTab")
    ?.classList.add(
      "active"
    );

  $("loginTab")
    ?.classList.remove(
      "active"
    );

  $("signupForm")
    ?.classList.remove(
      "hidden"
    );

  $("loginForm")
    ?.classList.add(
      "hidden"
    );

}


/* =========================================================
   SIGNUP BUTTON DIRECT HANDLER
========================================================= */

function setupSignupButton() {

  const form =
    $("signupForm");


  if (!form) {
    return;
  }


  const button =
    $("signupSubmitButton");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    event => {

      event.preventDefault();

      signupUser();

    }
  );

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  /* LOGIN TAB */

  on(
    "loginTab",
    "click",
    showLoginTab
  );


  /* SIGNUP TAB */

  on(
    "signupTab",
    "click",
    showSignupTab
  );


  /* LOGIN */

  on(
    "loginForm",
    "submit",
    event => {

      event.preventDefault();

      loginUser(
        $("loginEmail")?.value,
        $("loginPassword")?.value
      );

    }
  );


  /*
    SIGNUP FORM
    We handle the button directly,
    but also keep submit working.
  */

  on(
    "signupForm",
    "submit",
    event => {

      event.preventDefault();

      signupUser();

    }
  );


  /* NAVIGATION */

  $all(
    ".nav-item"
  ).forEach(
    item => {

      item.addEventListener(
        "click",
        () => {

          if (
            item.dataset.page
          ) {

            showPage(
              item.dataset.page
            );

          }

        }
      );

    }
  );


  /* SERVICES */

  $all(
    "[data-service]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          openService(
            button.dataset.service
          );

        }
      );

    }
  );


  /* FUND */

  on(
    "fundWalletButton",
    "click",
    openFundWallet
  );


  /* BONUS */

  on(
    "redeemBonusButton",
    "click",
    redeemBonus
  );


  /* FUND CONTINUE */

  on(
    "continueFundingButton",
    "click",
    continueFunding
  );


  /* QUICK AMOUNTS */

  $all(
    ".quick-amount"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          selectQuickAmount(
            Number(
              button.dataset.amount
            )
          );

        }
      );

    }
  );


  /* SERVICES PAGE */

  on(
    "viewAllServices",
    "click",
    () => {

      showPage(
        "servicesPage"
      );

    }
  );


  /* TRANSACTIONS */

  on(
    "viewTransactionsButton",
    "click",
    () => {

      showPage(
        "transactionsPage"
      );

    }
  );


  /* NOTIFICATIONS */

  on(
    "notificationButton",
    "click",
    openNotifications
  );


  /* PROFILE */

  on(
    "profileButton",
    "click",
    showProfileInfo
  );


  /* SECURITY */

  on(
    "securityButton",
    "click",
    showSecurityInfo
  );


  /* SUPPORT */

  on(
    "supportButton",
    "click",
    showSupportInfo
  );


  /* ABOUT */

  on(
    "aboutButton",
    "click",
    showAboutInfo
  );


  /* LOGOUT */

  on(
    "logoutButton",
    "click",
    logoutUser
  );


  /* CLOSE MODALS */

  $all(
    "[data-close-modal]"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          closeModal(
            button.dataset.closeModal
          );

        }
      );

    }
  );


  /* ESC KEY */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Escape"
      ) {

        closeAllModals();

      }

    }
  );


  /* PASSWORD BUTTONS */

  setupPasswordToggles();

}


/* =========================================================
   APPLICATION START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    /*
      First prepare the new
      signup interface.
    */

    prepareSignupInterface();


    /*
      Then connect the buttons.
    */

    setupEvents();


    /*
      Direct Sign Up button.
    */

    setupSignupButton();


    /*
      OTP automatic verification.
    */

    setupOTPInput();


    /*
      Start application.
    */

    startSplash();

  }
);


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.loginUser =
  loginUser;

window.signupUser =
  signupUser;

window.verifySignupOTP =
  verifySignupOTP;

window.showAuth =
  showAuth;

window.showMainApp =
  showMainApp;

window.showPage =
  showPage;

window.openModal =
  openModal;

window.closeModal =
  closeModal;

window.closeAllModals =
  closeAllModals;

window.openService =
  openService;

window.openFundWallet =
  openFundWallet;

window.selectQuickAmount =
  selectQuickAmount;

window.continueFunding =
  continueFunding;

window.redeemBonus =
  redeemBonus;

window.openNotifications =
  openNotifications;

window.showProfileInfo =
  showProfileInfo;

window.showSecurityInfo =
  showSecurityInfo;

window.showSupportInfo =
  showSupportInfo;

window.showAboutInfo =
  showAboutInfo;

window.logoutUser =
  logoutUser;

window.loadWallet =
  loadWallet;

window.checkServer =
  checkServer;