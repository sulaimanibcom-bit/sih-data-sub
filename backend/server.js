"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 5100);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET";

const VTUPLUG_BASE_URL =
  process.env.VTUPLUG_BASE_URL ||
  "https://vtuplug.com/api";

const VTUPLUG_API_KEY =
  process.env.VTUPLUG_API_KEY || "";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   FILE STORAGE
========================================================= */

const DATA_DIR = __dirname;

const USERS_FILE = path.join(DATA_DIR, "users.json");
const WALLETS_FILE = path.join(DATA_DIR, "wallets.json");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "transactions.json");
const FUNDING_FILE = path.join(DATA_DIR, "funding.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");

function ensureFile(file, defaultValue) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(defaultValue, null, 2)
    );
  }
}

ensureFile(USERS_FILE, []);
ensureFile(WALLETS_FILE, []);
ensureFile(TRANSACTIONS_FILE, []);
ensureFile(FUNDING_FILE, []);
ensureFile(NOTIFICATIONS_FILE, []);

function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");

    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      "JSON read error:",
      file,
      error.message
    );

    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

/* =========================================================
   OTP STORAGE
========================================================= */

const otpStore = new Map();

const passwordResetStore = new Map();

/* =========================================================
   EMAIL
========================================================= */

 let mailTransporter = null;

if (
  process.env.GMAIL_USER &&
  process.env.GMAIL_APP_PASSWORD
) {
  mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER.trim(),
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "")
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000
  });

  mailTransporter.verify()
    .then(() => {
      console.log("GMAIL SMTP: READY");
    })
    .catch((error) => {
      console.error(
        "GMAIL SMTP CONNECTION ERROR:",
        error.code || "UNKNOWN",
        error.message
      );
    });
} else {
  console.error(
    "GMAIL SMTP NOT CONFIGURED: Check environment variable names."
  );
}

async function sendMail({
  to,
  subject,
  text
}) {
  if (!mailTransporter) {
    throw new Error(
      "Gmail SMTP is not configured."
    );
  }

  await mailTransporter.sendMail({
    from:
      `"SIH DATA SUB" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text
  });
}

async function sendOTPEmail(
  email,
  name,
  otp
) {
  await sendMail({
    to: email,

    subject:
      "SIH DATA SUB Verification Code",

    text:
      `Hello ${name || "User"},\n\n` +
      `Your SIH DATA SUB verification code is: ${otp}\n\n` +
      `This code expires in 10 minutes.\n\n` +
      `SIH DATA SUB`
  });
}

async function sendPasswordResetEmail(
  email,
  name,
  otp
) {
  await sendMail({
    to: email,

    subject:
      "SIH DATA SUB Password Reset Code",

    text:
      `Hello ${name || "User"},\n\n` +
      `Your SIH DATA SUB password reset code is: ${otp}\n\n` +
      `This code expires in 10 minutes.\n\n` +
      `If you did not request this, you can ignore this email.\n\n` +
      `SIH DATA SUB`
  });
}

/* =========================================================
   HELPERS
========================================================= */

function makeId(prefix = "TX") {
  return (
    prefix +
    "_" +
    Date.now() +
    "_" +
    crypto.randomBytes(4).toString("hex")
  );
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/\s+/g, "")
    .trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^(\+234|234|0)\d{10}$/.test(phone);
}

function numberValue(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return n;
}

function providerConfigured() {
  return Boolean(VTUPLUG_API_KEY);
}

function providerHeaders() {
  return {
    Authorization:
      `Bearer ${VTUPLUG_API_KEY}`,

    "Content-Type":
      "application/json"
  };
}

/* =========================================================
   PROVIDER REQUESTS
========================================================= */

async function vtuGet(endpoint) {
  if (!providerConfigured()) {
    throw new Error(
      "VTUPLUG API is not configured yet."
    );
  }

  const url =
    `${VTUPLUG_BASE_URL}${endpoint}`;

  console.log("VTUPLUG GET:", endpoint);

  const response =
    await fetch(url, {
      method: "GET",
      headers: providerHeaders()
    });

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      status: "fail",
      message:
        text ||
        "Invalid provider response."
    };
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    data
  };
}

async function vtuPost(
  endpoint,
  payload
) {
  if (!providerConfigured()) {
    throw new Error(
      "VTUPLUG API is not configured yet."
    );
  }

  const url =
    `${VTUPLUG_BASE_URL}${endpoint}`;

  console.log(
    "VTUPLUG POST:",
    endpoint
  );

  const response =
    await fetch(url, {
      method: "POST",

      headers:
        providerHeaders(),

      body:
        JSON.stringify(payload)
    });

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      status: "fail",
      message:
        text ||
        "Invalid provider response."
    };
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    data
  };
}

function providerSuccess(result) {
  if (!result) {
    return false;
  }

  const data =
    result.data || {};

  const status =
    String(
      data.status ??
      data.Status ??
      data.success ??
      ""
    ).toLowerCase();

  return (
    result.ok &&
    (
      status === "success" ||
      status === "successful" ||
      status === "true"
    )
  );
}

function providerMessage(result) {
  const data =
    result?.data || {};

  return (
    data.message ||
    data.response ||
    data.api_response ||
    data.apiResponse ||
    "Provider request failed."
  );
}

function providerHttpStatus(result) {
  if (!result) {
    return 502;
  }

  if (result.ok) {
    return 200;
  }

  return 502;
}

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function authMiddleware(
  req,
  res,
  next
) {
  const authHeader =
    req.headers.authorization || "";

  if (
    !authHeader.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      success: false,
      message:
        "Authentication required."
    });
  }

  const token =
    authHeader.substring(7);

  try {
    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired token."
    });
  }
}

/* =========================================================
   USER HELPERS
========================================================= */

function findUserById(userId) {
  const users =
    readJSON(
      USERS_FILE,
      []
    );

  return users.find(
    user =>
      String(user.id) ===
      String(userId)
  );
}

function findUserByEmail(email) {
  const users =
    readJSON(
      USERS_FILE,
      []
    );

  const target =
    normalizeEmail(email);

  return users.find(
    user =>
      normalizeEmail(
        user.email
      ) === target
  );
}

function safeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    verified: Boolean(user.verified),
    createdAt: user.createdAt
  };
}

/* =========================================================
   WALLET
========================================================= */

function getWallet(userId) {
  const wallets =
    readJSON(
      WALLETS_FILE,
      []
    );

  let wallet =
    wallets.find(
      item =>
        String(item.userId) ===
        String(userId)
    );

  if (!wallet) {
    wallet = {
      userId,
      balance: 0,
      bonus: 0,
      cashback: 0,
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    };

    wallets.push(wallet);

    writeJSON(
      WALLETS_FILE,
      wallets
    );
  }

  return wallet;
}

function updateWallet(
  userId,
  changes
) {
  const wallets =
    readJSON(
      WALLETS_FILE,
      []
    );

  let wallet =
    wallets.find(
      item =>
        String(item.userId) ===
        String(userId)
    );

  if (!wallet) {
    wallet = {
      userId,
      balance: 0,
      bonus: 0,
      cashback: 0,
      createdAt:
        new Date().toISOString()
    };

    wallets.push(wallet);
  }

  if (
    changes.balance !== undefined
  ) {
    wallet.balance =
      numberValue(
        changes.balance
      );
  }

  if (
    changes.bonus !== undefined
  ) {
    wallet.bonus =
      numberValue(
        changes.bonus
      );
  }

  if (
    changes.cashback !== undefined
  ) {
    wallet.cashback =
      numberValue(
        changes.cashback
      );
  }

  wallet.updatedAt =
    new Date().toISOString();

  writeJSON(
    WALLETS_FILE,
    wallets
  );

  return wallet;
}

function addWalletBalance(
  userId,
  amount
) {
  const wallet =
    getWallet(userId);

  return updateWallet(
    userId,
    {
      balance:
        numberValue(wallet.balance) +
        numberValue(amount)
    }
  );
}

function deductWalletBalance(
  userId,
  amount
) {
  const wallet =
    getWallet(userId);

  const current =
    numberValue(
      wallet.balance
    );

  const cost =
    numberValue(amount);

  if (current < cost) {
    return {
      success: false,
      wallet
    };
  }

  const updated =
    updateWallet(
      userId,
      {
        balance:
          current - cost
      }
    );

  return {
    success: true,
    wallet: updated
  };
}

/* =========================================================
   TRANSACTIONS
========================================================= */

function saveTransaction(
  transaction
) {
  const transactions =
    readJSON(
      TRANSACTIONS_FILE,
      []
    );

  transactions.unshift(
    transaction
  );

  writeJSON(
    TRANSACTIONS_FILE,
    transactions
  );

  return transaction;
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

function createNotification({
  userId,
  title,
  message,
  type = "info"
}) {
  const notifications =
    readJSON(
      NOTIFICATIONS_FILE,
      []
    );

  const notification = {
    id: makeId("NOT"),
    userId,
    title,
    message,
    type,
    read: false,
    createdAt:
      new Date().toISOString()
  };

  notifications.unshift(
    notification
  );

  writeJSON(
    NOTIFICATIONS_FILE,
    notifications
  );

  return notification;
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/api/health",
  async (req, res) => {
    let gmailReady = false;

    if (mailTransporter) {
      try {
        await mailTransporter.verify();
        gmailReady = true;
      } catch {
        gmailReady = false;
      }
    }

    res.json({
      success: true,

      server: true,

      app:
        "SIH DATA SUB",

      version:
        "4.0.0",

      port:
        PORT,

      gmailConfigured:
        Boolean(
          mailTransporter
        ),

      gmailReady,

      paymentProvider:
        process.env.PAYMENT_PROVIDER ||
        "PENDING",

      vtuProvider:
        providerConfigured()
          ? "VTUPLUG"
          : "PENDING",

      vtuConfigured:
        providerConfigured(),

      features: {
        authentication: true,
        forgotPassword: true,
        wallet: true,
        fundingFlow: true,
        bonus: true,
        cashback: true,
        notifications: true,
        transactions: true,
        profile: true,
        security: true,
        airtime: true,
        data: true,
        cableTV: true,
        electricity: true,
        rechargePIN: true,
        dataPIN: true,
        eduPIN:
          "PENDING_PROVIDER",
        bulkSMS:
          "PENDING_PROVIDER",
        airtimeSwap:
          "PENDING_PROVIDER"
      }
    });
  }
);

/* =========================================================
   AUTH - REQUEST SIGNUP OTP
========================================================= */

app.post(
  "/api/auth/request-otp",
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const phone =
        normalizePhone(
          req.body.phone
        );

      const email =
        normalizeEmail(
          req.body.email
        );

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your full name."
        });
      }

      if (!isValidPhone(phone)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid Nigerian phone number."
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email address."
        });
      }

      if (
        findUserByEmail(email)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this email already exists."
        });
      }

      const otp =
        Math.floor(
          100000 +
          Math.random() * 900000
        ).toString();

      otpStore.set(
        email,
        {
          otp,
          name,
          phone,
          expiresAt:
            Date.now() +
            10 * 60 * 1000
        }
      );

      await sendOTPEmail(
        email,
        name,
        otp
      );

      res.json({
        success: true,
        message:
          "OTP sent to your Gmail address."
      });

    } catch (error) {
      console.error(
        "REQUEST OTP ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to send OTP."
      });
    }
  }
);

/* =========================================================
   AUTH - SIGNUP
========================================================= */

app.post(
  "/api/auth/signup",
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const phone =
        normalizePhone(
          req.body.phone
        );

      const email =
        normalizeEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      const otp =
        String(
          req.body.otp || ""
        ).trim();

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your full name."
        });
      }

      if (!isValidPhone(phone)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid Nigerian phone number."
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email address."
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters."
        });
      }

      if (!otp) {
        return res.status(400).json({
          success: false,
          message:
            "Enter the OTP sent to your email."
        });
      }

      if (
        findUserByEmail(email)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this email already exists."
        });
      }

      const savedOTP =
        otpStore.get(email);

      if (!savedOTP) {
        return res.status(400).json({
          success: false,
          message:
            "OTP not found. Please request a new OTP."
        });
      }

      if (
        Date.now() >
        savedOTP.expiresAt
      ) {
        otpStore.delete(email);

        return res.status(400).json({
          success: false,
          message:
            "OTP has expired. Please request a new one."
        });
      }

      if (
        savedOTP.otp !== otp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Incorrect OTP."
        });
      }

      const users =
        readJSON(
          USERS_FILE,
          []
        );

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      const user = {
        id: makeId("USR"),
        name,
        phone,
        email,
        password: passwordHash,
        verified: true,
        createdAt:
          new Date().toISOString()
      };

      users.push(user);

      writeJSON(
        USERS_FILE,
        users
      );

      getWallet(user.id);

      createNotification({
        userId: user.id,
        title:
          "Welcome to SIH DATA SUB",
        message:
          "Your account was created successfully.",
        type: "success"
      });

      otpStore.delete(email);

      const token =
        jwt.sign(
          {
            id: user.id,
            email: user.email
          },
          JWT_SECRET,
          {
            expiresIn: "30d"
          }
        );

      res.status(201).json({
        success: true,
        message:
          "Account created successfully.",
        token,
        user:
          safeUser(user)
      });

    } catch (error) {
      console.error(
        "SIGNUP ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to create account."
      });
    }
  }
);

/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your email and password."
        });
      }

      const user =
        findUserByEmail(email);

      if (!user) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password."
        });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!valid) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password."
        });
      }

      const token =
        jwt.sign(
          {
            id: user.id,
            email: user.email
          },
          JWT_SECRET,
          {
            expiresIn: "30d"
          }
        );

      res.json({
        success: true,
        message:
          "Login successful.",
        token,
        user:
          safeUser(user)
      });

    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to login."
      });
    }
  }
);

/* =========================================================
   FORGOT PASSWORD - REQUEST OTP
========================================================= */

app.post(
  "/api/auth/forgot-password",
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email address."
        });
      }

      const user =
        findUserByEmail(email);

      /*
       * We intentionally return the same
       * general message whether or not the
       * email exists.
       */

      if (!user) {
        return res.json({
          success: true,
          message:
            "If an account exists for this email, a reset code has been sent."
        });
      }

      const otp =
        Math.floor(
          100000 +
          Math.random() * 900000
        ).toString();

      passwordResetStore.set(
        email,
        {
          otp,
          expiresAt:
            Date.now() +
            10 * 60 * 1000
        }
      );

      await sendPasswordResetEmail(
        email,
        user.name,
        otp
      );

      res.json({
        success: true,
        message:
          "Password reset code sent to your email."
      });

    } catch (error) {
      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to send password reset code."
      });
    }
  }
);

/* =========================================================
   FORGOT PASSWORD - RESET
========================================================= */

app.post(
  "/api/auth/reset-password",
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      const otp =
        String(
          req.body.otp || ""
        ).trim();

      const newPassword =
        String(
          req.body.password ||
          req.body.newPassword ||
          ""
        );

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email address."
        });
      }

      if (!otp) {
        return res.status(400).json({
          success: false,
          message:
            "Enter the reset code."
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters."
        });
      }

      const reset =
        passwordResetStore.get(
          email
        );

      if (!reset) {
        return res.status(400).json({
          success: false,
          message:
            "Reset code not found. Request a new code."
        });
      }

      if (
        Date.now() >
        reset.expiresAt
      ) {
        passwordResetStore.delete(
          email
        );

        return res.status(400).json({
          success: false,
          message:
            "Reset code has expired."
        });
      }

      if (
        reset.otp !== otp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Incorrect reset code."
        });
      }

      const users =
        readJSON(
          USERS_FILE,
          []
        );

      const index =
        users.findIndex(
          user =>
            normalizeEmail(
              user.email
            ) === email
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message:
            "Account not found."
        });
      }

      users[index].password =
        await bcrypt.hash(
          newPassword,
          10
        );

      users[index].passwordUpdatedAt =
        new Date().toISOString();

      writeJSON(
        USERS_FILE,
        users
      );

      passwordResetStore.delete(
        email
      );

      res.json({
        success: true,
        message:
          "Password reset successfully. You can now login."
      });

    } catch (error) {
      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to reset password."
      });
    }
  }
);

/* =========================================================
   AUTH - ME
========================================================= */

app.get(
  "/api/auth/me",
  authMiddleware,
  (req, res) => {
    const user =
      findUserById(
        req.user.id
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found."
      });
    }

    res.json({
      success: true,
      user:
        safeUser(user)
    });
  }
);

/* =========================================================
   PROFILE
========================================================= */

app.patch(
  "/api/account/profile",
  authMiddleware,
  (req, res) => {
    const users =
      readJSON(
        USERS_FILE,
        []
      );

    const index =
      users.findIndex(
        user =>
          String(user.id) ===
          String(req.user.id)
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message:
          "User not found."
      });
    }

    const name =
      req.body.name !== undefined
        ? String(
            req.body.name
          ).trim()
        : users[index].name;

    const phone =
      req.body.phone !== undefined
        ? normalizePhone(
            req.body.phone
          )
        : users[index].phone;

    if (!name) {
      return res.status(400).json({
        success: false,
        message:
          "Name cannot be empty."
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid Nigerian phone number."
      });
    }

    users[index].name = name;
    users[index].phone = phone;
    users[index].updatedAt =
      new Date().toISOString();

    writeJSON(
      USERS_FILE,
      users
    );

    res.json({
      success: true,
      message:
        "Profile updated successfully.",
      user:
        safeUser(users[index])
    });
  }
);

/* =========================================================
   CHANGE PASSWORD
========================================================= */

app.post(
  "/api/account/change-password",
  authMiddleware,
  async (req, res) => {
    try {
      const currentPassword =
        String(
          req.body.currentPassword ||
          ""
        );

      const newPassword =
        String(
          req.body.newPassword ||
          ""
        );

      if (
        currentPassword.length < 1 ||
        newPassword.length < 6
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your current password and a new password of at least 6 characters."
        });
      }

      const users =
        readJSON(
          USERS_FILE,
          []
        );

      const index =
        users.findIndex(
          user =>
            String(user.id) ===
            String(req.user.id)
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message:
            "User not found."
        });
      }

      const valid =
        await bcrypt.compare(
          currentPassword,
          users[index].password
        );

      if (!valid) {
        return res.status(401).json({
          success: false,
          message:
            "Current password is incorrect."
        });
      }

      users[index].password =
        await bcrypt.hash(
          newPassword,
          10
        );

      users[index].passwordUpdatedAt =
        new Date().toISOString();

      writeJSON(
        USERS_FILE,
        users
      );

      res.json({
        success: true,
        message:
          "Password changed successfully."
      });

    } catch (error) {
      console.error(
        "CHANGE PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to change password."
      });
    }
  }
);

/* =========================================================
   WALLET
========================================================= */

app.get(
  "/api/wallet",
  authMiddleware,
  (req, res) => {
    const wallet =
      getWallet(
        req.user.id
      );

    res.json({
      success: true,
      wallet
    });
  }
);

app.get(
  "/api/wallet/balance",
  authMiddleware,
  (req, res) => {
    const wallet =
      getWallet(
        req.user.id
      );

    res.json({
      success: true,

      balance:
        numberValue(
          wallet.balance
        ),

      bonus:
        numberValue(
          wallet.bonus
        ),

      cashback:
        numberValue(
          wallet.cashback
        ),

      wallet
    });
  }
);

/* =========================================================
   FUND WALLET - CREATE FUNDING REQUEST
========================================================= */

app.post(
  "/api/wallet/fund",
  authMiddleware,
  (req, res) => {
    const amount =
      numberValue(
        req.body.amount
      );

    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message:
          "Minimum funding amount is ₦100."
      });
    }

    const funding =
      readJSON(
        FUNDING_FILE,
        []
      );

    const fundingId =
      makeId("FUND");

    const record = {
      id: fundingId,
      userId: req.user.id,
      amount,
      status: "pending",
      provider:
        process.env.PAYMENT_PROVIDER ||
        "PENDING",
      createdAt:
        new Date().toISOString()
    };

    funding.unshift(record);

    writeJSON(
      FUNDING_FILE,
      funding
    );

    saveTransaction({
      id: fundingId,
      userId: req.user.id,
      type: "funding",
      service: "Wallet Funding",
      amount,
      status: "pending",
      createdAt:
        new Date().toISOString()
    });

    createNotification({
      userId: req.user.id,
      title:
        "Funding request created",
      message:
        `Your ₦${amount.toLocaleString()} wallet funding request is pending.`,
      type: "info"
    });

    res.status(201).json({
      success: true,
      message:
        "Funding request created. Payment provider integration is pending.",
      funding: record
    });
  }
);

/* =========================================================
   FUNDING HISTORY
========================================================= */

app.get(
  "/api/wallet/funding",
  authMiddleware,
  (req, res) => {
    const funding =
      readJSON(
        FUNDING_FILE,
        []
      );

    res.json({
      success: true,
      funding:
        funding.filter(
          item =>
            String(item.userId) ===
            String(req.user.id)
        )
    });
  }
);

/* =========================================================
   DEV WALLET TEST
========================================================= */

app.post(
  "/api/dev/add-wallet",
  authMiddleware,
  (req, res) => {
    const amount =
      numberValue(
        req.body.amount
      );

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid amount."
      });
    }

    const wallet =
      addWalletBalance(
        req.user.id,
        amount
      );

    saveTransaction({
      id: makeId("DEVFUND"),
      userId: req.user.id,
      type: "dev_funding",
      service:
        "Development Wallet Credit",
      amount,
      status: "successful",
      createdAt:
        new Date().toISOString()
    });

    res.json({
      success: true,
      message:
        "Development wallet updated.",
      wallet
    });
  }
);

/* =========================================================
   BONUS / CASHBACK
========================================================= */

app.post(
  "/api/wallet/redeem-bonus",
  authMiddleware,
  (req, res) => {
    const wallet =
      getWallet(
        req.user.id
      );

    const amount =
      numberValue(
        req.body.amount
      );

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid bonus amount."
      });
    }

    if (
      numberValue(wallet.bonus) <
      amount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Insufficient bonus balance."
      });
    }

    const updated =
      updateWallet(
        req.user.id,
        {
          bonus:
            wallet.bonus - amount,

          balance:
            wallet.balance + amount
        }
      );

    saveTransaction({
      id: makeId("BONUS"),
      userId: req.user.id,
      type: "bonus_redemption",
      service: "Bonus",
      amount,
      status: "successful",
      createdAt:
        new Date().toISOString()
    });

    res.json({
      success: true,
      message:
        "Bonus redeemed successfully.",
      wallet: updated
    });
  }
);

app.post(
  "/api/wallet/redeem-cashback",
  authMiddleware,
  (req, res) => {
    const wallet =
      getWallet(
        req.user.id
      );

    const amount =
      numberValue(
        req.body.amount
      );

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid cashback amount."
      });
    }

    if (
      numberValue(wallet.cashback) <
      amount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Insufficient cashback balance."
      });
    }

    const updated =
      updateWallet(
        req.user.id,
        {
          cashback:
            wallet.cashback - amount,

          balance:
            wallet.balance + amount
        }
      );

    saveTransaction({
      id: makeId("CASH"),
      userId: req.user.id,
      type: "cashback_redemption",
      service: "Cashback",
      amount,
      status: "successful",
      createdAt:
        new Date().toISOString()
    });

    res.json({
      success: true,
      message:
        "Cashback redeemed successfully.",
      wallet: updated
    });
  }
);

/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get(
  "/api/notifications",
  authMiddleware,
  (req, res) => {
    const notifications =
      readJSON(
        NOTIFICATIONS_FILE,
        []
      );

    const userNotifications =
      notifications.filter(
        item =>
          String(item.userId) ===
          String(req.user.id)
      );

    res.json({
      success: true,
      notifications:
        userNotifications,

      unread:
        userNotifications.filter(
          item => !item.read
        ).length
    });
  }
);

app.post(
  "/api/notifications/:id/read",
  authMiddleware,
  (req, res) => {
    const notifications =
      readJSON(
        NOTIFICATIONS_FILE,
        []
      );

    const notification =
      notifications.find(
        item =>
          String(item.id) ===
            String(req.params.id) &&
          String(item.userId) ===
            String(req.user.id)
      );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Notification not found."
      });
    }

    notification.read = true;

    writeJSON(
      NOTIFICATIONS_FILE,
      notifications
    );

    res.json({
      success: true,
      message:
        "Notification marked as read."
    });
  }
);

/* =========================================================
   VTUPLUG AIRTIME NETWORKS
========================================================= */

app.get(
  "/api/provider/airtime-networks",
  authMiddleware,
  async (req, res) => {
    try {
      const result =
        await vtuGet(
          "/get-networks?service=airtime"
        );

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Unable to load airtime networks."
      });
    }
  }
);

/* =========================================================
   VTUPLUG DATA NETWORKS
========================================================= */

app.get(
  "/api/provider/data-networks",
  authMiddleware,
  async (req, res) => {
    try {
      const result =
        await vtuGet(
          "/get-networks?service=data"
        );

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Unable to load data networks."
      });
    }
  }
);

/* =========================================================
   DATA PLANS
========================================================= */

app.get(
  "/api/data/plans",
  authMiddleware,
  async (req, res) => {
    try {
      const network =
        req.query.network;

      let endpoint =
        "/get-networks?service=data";

      if (network) {
        endpoint +=
          `&network=${encodeURIComponent(network)}`;
      }

      const result =
        await vtuGet(endpoint);

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Unable to load data plans."
      });
    }
  }
);

/* =========================================================
   AIRTIME PURCHASE
========================================================= */

app.post(
  "/api/airtime/purchase",
  authMiddleware,
  async (req, res) => {
    try {
      const network =
        Number(
          req.body.network
        );

      const phone =
        normalizePhone(
          req.body.phone
        );

      const amount =
        numberValue(
          req.body.amount
        );

      if (!network) {
        return res.status(400).json({
          success: false,
          message:
            "Select a network."
        });
      }

      if (!isValidPhone(phone)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid Nigerian phone number."
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid amount."
        });
      }

      const wallet =
        getWallet(
          req.user.id
        );

      if (
        wallet.balance <
        amount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      const requestId =
        makeId("AIR");

      const result =
        await vtuPost(
          "/airtime",
          {
            network,
            phone,
            amount,
            type: "VTU",
            bypass: false,
            "request-id":
              requestId
          }
        );

      if (
        !providerSuccess(result)
      ) {
        return res
          .status(
            providerHttpStatus(result)
          )
          .json({
            success: false,
            message:
              providerMessage(result),
            provider:
              result.data
          });
      }

      const deducted =
        deductWalletBalance(
          req.user.id,
          amount
        );

      if (!deducted.success) {
        return res.status(400).json({
          success: false,
          message:
            "Wallet balance changed before completion."
        });
      }

      saveTransaction({
        id: requestId,
        userId:
          req.user.id,
        type: "airtime",
        service: "Airtime",
        amount,
        phone,
        network,
        status:
          "successful",
        providerResponse:
          result.data,
        createdAt:
          new Date().toISOString()
      });

      createNotification({
        userId:
          req.user.id,
        title:
          "Airtime purchase successful",
        message:
          `₦${amount.toLocaleString()} airtime was sent to ${phone}.`,
        type:
          "success"
      });

      res.json({
        success: true,
        message:
          providerMessage(result),
        wallet:
          deducted.wallet,
        transaction:
          result.data
      });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Airtime purchase failed."
      });
    }
  }
);

/* =========================================================
   DATA PURCHASE
========================================================= */

app.post(
  "/api/data/purchase",
  authMiddleware,
  async (req, res) => {
    try {
      const network =
        Number(
          req.body.network
        );

      const phone =
        normalizePhone(
          req.body.phone
        );

      const plan =
        req.body.plan ||
        req.body.plan_id;

      const amount =
        numberValue(
          req.body.amount
        );

      if (!network) {
        return res.status(400).json({
          success: false,
          message:
            "Select a network."
        });
      }

      if (!isValidPhone(phone)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid Nigerian phone number."
        });
      }

      if (
        plan === undefined ||
        plan === null ||
        String(plan).trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Select a data plan."
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid plan amount."
        });
      }

      const wallet =
        getWallet(
          req.user.id
        );

      if (
        wallet.balance <
        amount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      const requestId =
        makeId("DATA");

      const result =
        await vtuPost(
          "/data",
          {
            network,
            phone,
            plan,
            amount,
            "request-id":
              requestId
          }
        );

      if (
        !providerSuccess(result)
      ) {
        return res
          .status(
            providerHttpStatus(result)
          )
          .json({
            success: false,
            message:
              providerMessage(result),
            provider:
              result.data
          });
      }

      const deducted =
        deductWalletBalance(
          req.user.id,
          amount
        );

      if (!deducted.success) {
        return res.status(400).json({
          success: false,
          message:
            "Wallet balance changed before completion."
        });
      }

      saveTransaction({
        id: requestId,
        userId:
          req.user.id,
        type: "data",
        service: "Data",
        amount,
        phone,
        network,
        plan,
        status:
          "successful",
        providerResponse:
          result.data,
        createdAt:
          new Date().toISOString()
      });

      createNotification({
        userId:
          req.user.id,
        title:
          "Data purchase successful",
        message:
          `Data purchase of ₦${amount.toLocaleString()} was successful.`,
        type:
          "success"
      });

      res.json({
        success: true,
        message:
          providerMessage(result),
        wallet:
          deducted.wallet,
        transaction:
          result.data
      });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Data purchase failed."
      });
    }
  }
);

/* =========================================================
   CABLE TV
========================================================= */

app.get(
  "/api/cable/providers",
  authMiddleware,
  async (req, res) => {
    try {
      const cable =
        req.query.cable ||
        "Gotv";

      const result =
        await vtuGet(
          `/get-cable-providers?cable=${encodeURIComponent(cable)}`
        );

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Unable to load cable providers."
      });
    }
  }
);

app.post(
  "/api/cable/validate",
  authMiddleware,
  async (req, res) => {
    try {
      const cable =
        Number(
          req.body.cable
        );

      const iuc =
        String(
          req.body.iuc || ""
        ).trim();

      if (!cable || !iuc) {
        return res.status(400).json({
          success: false,
          message:
            "Enter the cable provider and IUC number."
        });
      }

      const result =
        await vtuPost(
          "/cable/cable-validation",
          {
            cable,
            iuc
          }
        );

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Cable validation failed."
      });
    }
  }
);

app.post(
  "/api/cable/purchase",
  authMiddleware,
  async (req, res) => {
    try {
      const cable =
        Number(
          req.body.cable
        );

      const iuc =
        String(
          req.body.iuc || ""
        ).trim();

      const cablePlan =
        String(
          req.body.cable_plan ||
          req.body.plan ||
          ""
        ).trim();

      const amount =
        numberValue(
          req.body.amount
        );

      if (
        !cable ||
        !iuc ||
        !cablePlan
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Complete the cable TV details."
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid subscription amount."
        });
      }

      const wallet =
        getWallet(
          req.user.id
        );

      if (
        wallet.balance <
        amount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      const requestId =
        makeId("CABLE");

      const result =
        await vtuPost(
          "/cable",
          {
            cable,
            iuc,
            cable_plan:
              cablePlan,
            "request-id":
              requestId
          }
        );

      if (
        !providerSuccess(result)
      ) {
        return res
          .status(
            providerHttpStatus(result)
          )
          .json({
            success: false,
            message:
              providerMessage(result),
            provider:
              result.data
          });
      }

      const providerAmount =
        numberValue(
          result.data.amount
        );

      const finalAmount =
        providerAmount > 0
          ? providerAmount
          : amount;

      const deducted =
        deductWalletBalance(
          req.user.id,
          finalAmount
        );

      if (!deducted.success) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      saveTransaction({
        id: requestId,
        userId:
          req.user.id,
        type: "cable",
        service: "Cable TV",
        amount:
          finalAmount,
        iuc,
        cable,
        plan:
          cablePlan,
        status:
          "successful",
        providerResponse:
          result.data,
        createdAt:
          new Date().toISOString()
      });

      res.json({
        success: true,
        message:
          providerMessage(result),
        wallet:
          deducted.wallet,
        transaction:
          result.data
      });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Cable TV purchase failed."
      });
    }
  }
);

/* =========================================================
   ELECTRICITY
========================================================= */

app.get(
  "/api/electricity/providers",
  authMiddleware,
  async (req, res) => {
    try {
      const result =
        await vtuGet(
          "/get-bill"
        );

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Unable to load electricity providers."
      });
    }
  }
);

app.post(
  "/api/electricity/validate",
  authMiddleware,
  async (req, res) => {
    try {
      const disco =
        Number(
          req.body.disco
        );

      const meterNumber =
        String(
          req.body.meter_number ||
          req.body.meterNumber ||
          ""
        ).trim();

      const meterType =
        String(
          req.body.meter_type ||
          req.body.meterType ||
          ""
        ).toLowerCase();

      if (
        !disco ||
        !meterNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter the electricity provider and meter number."
        });
      }

      if (
        meterType !== "prepaid" &&
        meterType !== "postpaid"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Meter type must be prepaid or postpaid."
        });
      }

      const result =
        await vtuPost(
          "/bill/bill-validation",
          {
            disco,
            meter_number:
              meterNumber,
            meter_type:
              meterType
          }
        );

      res
        .status(
          providerHttpStatus(result)
        )
        .json({
          success:
            providerSuccess(result),
          ...result.data
        });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Electricity validation failed."
      });
    }
  }
);

app.post(
  "/api/electricity/purchase",
  authMiddleware,
  async (req, res) => {
    try {
      const disco =
        Number(
          req.body.disco
        );

      const meterNumber =
        String(
          req.body.meter_number ||
          req.body.meterNumber ||
          ""
        ).trim();

      const meterType =
        String(
          req.body.meter_type ||
          req.body.meterType ||
          ""
        ).toLowerCase();

      const amount =
        numberValue(
          req.body.amount
        );

      if (
        !disco ||
        !meterNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Complete the electricity details."
        });
      }

      if (
        meterType !== "prepaid" &&
        meterType !== "postpaid"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Meter type must be prepaid or postpaid."
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid amount."
        });
      }

      const wallet =
        getWallet(
          req.user.id
        );

      if (
        wallet.balance <
        amount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      const requestId =
        makeId("ELEC");

      const result =
        await vtuPost(
          "/bill",
          {
            disco,
            meter_number:
              meterNumber,
            meter_type:
              meterType,
            amount,
            "request-id":
              requestId
          }
        );

      if (
        !providerSuccess(result)
      ) {
        return res
          .status(
            providerHttpStatus(result)
          )
          .json({
            success: false,
            message:
              providerMessage(result),
            provider:
              result.data
          });
      }

      const deducted =
        deductWalletBalance(
          req.user.id,
          amount
        );

      if (!deducted.success) {
        return res.status(400).json({
          success: false,
          message:
            "Wallet balance changed before completion."
        });
      }

      saveTransaction({
        id: requestId,
        userId:
          req.user.id,
        type:
          "electricity",
        service:
          "Electricity",
        amount,
        disco,
        meterNumber,
        meterType,
        token:
          result.data.token ||
          null,
        status:
          "successful",
        providerResponse:
          result.data,
        createdAt:
          new Date().toISOString()
      });

      res.json({
        success: true,
        message:
          providerMessage(result),
        token:
          result.data.token ||
          null,
        wallet:
          deducted.wallet,
        transaction:
          result.data
      });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Electricity payment failed."
      });
    }
  }
);

/* =========================================================
   RECHARGE PIN
========================================================= */

app.post(
  "/api/recharge-pin/purchase",
  authMiddleware,
  async (req, res) => {
    try {
      const network =
        Number(
          req.body.network
        );

      const amount =
        numberValue(
          req.body.amount
        );

      const quantity =
        Math.max(
          1,
          Number(
            req.body.quantity || 1
          )
        );

      const businessName =
        String(
          req.body.business_name ||
          "SIH DATA SUB"
        ).trim();

      const total =
        amount * quantity;

      if (!network) {
        return res.status(400).json({
          success: false,
          message:
            "Select a PIN network."
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid PIN amount."
        });
      }

      if (
        quantity < 1 ||
        quantity > 50
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Quantity must be between 1 and 50."
        });
      }

      const wallet =
        getWallet(
          req.user.id
        );

      if (
        wallet.balance <
        total
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      const requestId =
        makeId("APIN");

      const result =
        await vtuPost(
          "/recharge_card",
          {
            network,
            amount:
              String(amount),
            quantity,
            business_name:
              businessName,
            "request-id":
              requestId
          }
        );

      if (
        !providerSuccess(result)
      ) {
        return res
          .status(
            providerHttpStatus(result)
          )
          .json({
            success: false,
            message:
              providerMessage(result),
            provider:
              result.data
          });
      }

      const providerAmount =
        numberValue(
          result.data.amount
        );

      const finalAmount =
        providerAmount > 0
          ? providerAmount
          : total;

      const deducted =
        deductWalletBalance(
          req.user.id,
          finalAmount
        );

      if (!deducted.success) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      saveTransaction({
        id: requestId,
        userId:
          req.user.id,
        type:
          "airtime_pin",
        service:
          "Recharge PIN",
        amount:
          finalAmount,
        network,
        quantity,
        status:
          "successful",
        pins:
          result.data.pin ||
          null,
        serial:
          result.data.serial ||
          null,
        providerResponse:
          result.data,
        createdAt:
          new Date().toISOString()
      });

      res.json({
        success: true,
        message:
          providerMessage(result),
        pins:
          result.data.pin ||
          null,
        serial:
          result.data.serial ||
          null,
        wallet:
          deducted.wallet,
        transaction:
          result.data
      });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Recharge PIN purchase failed."
      });
    }
  }
);

/* =========================================================
   DATA PIN
========================================================= */

app.post(
  "/api/data-pin/purchase",
  authMiddleware,
  async (req, res) => {
    try {
      const network =
        Number(
          req.body.network
        );

      const amount =
        numberValue(
          req.body.amount
        );

      const quantity =
        Math.max(
          1,
          Number(
            req.body.quantity || 1
          )
        );

      const businessName =
        String(
          req.body.business_name ||
          "SIH DATA SUB"
        ).trim();

      const total =
        amount * quantity;

      if (!network) {
        return res.status(400).json({
          success: false,
          message:
            "Select a data PIN network."
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid PIN amount."
        });
      }

      if (
        quantity < 1 ||
        quantity > 50
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Quantity must be between 1 and 50."
        });
      }

      const wallet =
        getWallet(
          req.user.id
        );

      if (
        wallet.balance <
        total
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      const requestId =
        makeId("DPIN");

      const result =
        await vtuPost(
          "/data_card",
          {
            network,
            amount:
              String(amount),
            quantity,
            business_name:
              businessName,
            "request-id":
              requestId
          }
        );

      if (
        !providerSuccess(result)
      ) {
        return res
          .status(
            providerHttpStatus(result)
          )
          .json({
            success: false,
            message:
              providerMessage(result),
            provider:
              result.data
          });
      }

      const providerAmount =
        numberValue(
          result.data.amount
        );

      const finalAmount =
        providerAmount > 0
          ? providerAmount
          : total;

      const deducted =
        deductWalletBalance(
          req.user.id,
          finalAmount
        );

      if (!deducted.success) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance."
        });
      }

      saveTransaction({
        id: requestId,
        userId:
          req.user.id,
        type:
          "data_pin",
        service:
          "Data PIN",
        amount:
          finalAmount,
        network,
        quantity,
        status:
          "successful",
        pins:
          result.data.pin ||
          null,
        serial:
          result.data.serial ||
          null,
        providerResponse:
          result.data,
        createdAt:
          new Date().toISOString()
      });

      res.json({
        success: true,
        message:
          providerMessage(result),
        pins:
          result.data.pin ||
          null,
        serial:
          result.data.serial ||
          null,
        wallet:
          deducted.wallet,
        transaction:
          result.data
      });

    } catch (error) {
      res.status(502).json({
        success: false,
        message:
          error.message ||
          "Data PIN purchase failed."
      });
    }
  }
);

/* =========================================================
   EDU PIN
========================================================= */

app.post(
  "/api/edu-pin/purchase",
  authMiddleware,
  async (req, res) => {
    res.status(501).json({
      success: false,
      providerConfigured:
        providerConfigured(),
      message:
        "Edu PIN is ready for frontend integration but the exact VTUPLUG Exam PIN API fields are required before purchase can be enabled."
    });
  }
);

/* =========================================================
   BULK SMS
========================================================= */

app.post(
  "/api/bulk-sms/send",
  authMiddleware,
  async (req, res) => {
    res.status(501).json({
      success: false,
      providerConfigured:
        providerConfigured(),
      message:
        "Bulk SMS is ready for frontend integration but the exact VTUPLUG Bulk SMS API fields are required before sending can be enabled."
    });
  }
);

/* =========================================================
   AIRTIME SWAP
========================================================= */

app.post(
  "/api/airtime-swap",
  authMiddleware,
  async (req, res) => {
    res.status(501).json({
      success: false,
      providerConfigured:
        providerConfigured(),
      message:
        "Airtime Swap is pending provider/API configuration."
    });
  }
);

/* =========================================================
   TRANSACTIONS
========================================================= */

app.get(
  "/api/transactions",
  authMiddleware,
  (req, res) => {
    const transactions =
      readJSON(
        TRANSACTIONS_FILE,
        []
      );

    const userTransactions =
      transactions.filter(
        item =>
          String(item.userId) ===
          String(req.user.id)
      );

    res.json({
      success: true,
      transactions:
        userTransactions
    });
  }
);

app.get(
  "/api/transactions/:id",
  authMiddleware,
  (req, res) => {
    const transactions =
      readJSON(
        TRANSACTIONS_FILE,
        []
      );

    const transaction =
      transactions.find(
        item =>
          String(item.id) ===
            String(req.params.id) &&
          String(item.userId) ===
            String(req.user.id)
      );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message:
          "Transaction not found."
      });
    }

    res.json({
      success: true,
      transaction
    });
  }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/api/auth/logout",
  authMiddleware,
  (req, res) => {
    res.json({
      success: true,
      message:
        "Logout successful. Remove the token from the frontend."
    });
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      message:
        "API route not found.",
      path:
        req.originalUrl
    });
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "SERVER ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Internal server error."
    });
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      "          SIH DATA SUB BACKEND"
    );
    console.log(
      "=========================================="
    );

    console.log(
      `Server: http://localhost:${PORT}`
    );

    console.log(
      "Version: 4.0.0"
    );

    console.log(
      `Gmail OTP: ${
        mailTransporter
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      `VTUPLUG: ${
        providerConfigured()
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      `VTUPLUG URL: ${VTUPLUG_BASE_URL}`
    );

    console.log(
      "=========================================="
    );
    console.log("");
  }
);