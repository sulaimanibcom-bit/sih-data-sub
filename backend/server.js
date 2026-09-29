"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const {
  getBonusAccount,
  addBonus,
  useBonus,
  getBonusTransactions
} = require("./bonus");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 5100;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "CHANGE_THIS_SECRET_BEFORE_PRODUCTION";

const USERS_FILE =
  path.join(__dirname, "users.json");

const WALLETS_FILE =
  path.join(__dirname, "wallets.json");

const TRANSACTIONS_FILE =
  path.join(__dirname, "transactions.json");

const FUNDING_FILE =
  path.join(__dirname, "funding.json");

const OTP_EXPIRY_MS =
  10 * 60 * 1000;

const FUNDING_FEE = 50;

const MIN_FUNDING = 100;

const MAX_FUNDING = 1000000;

/*
  These are intentionally NOT connected to fake providers.
  They will be connected to legitimate providers later.
*/

const SUPPORTED_SERVICES = [
  "data",
  "airtime",
  "cable",
  "electricity",
  "education",
  "bulksms"
];

const otpStore = new Map();

/* =========================================================
   EXPRESS
========================================================= */

app.use(cors());

app.use(
  express.json({
    limit: "1mb"
  })
);

/* =========================================================
   GENERAL HELPERS
========================================================= */

function nowISO() {
  return new Date().toISOString();
}

function generateReference(prefix) {
  const time =
    Date.now().toString(36).toUpperCase();

  const random =
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

  return `${prefix}-${time}-${random}`;
}

function money(value) {
  return Number(
    Number(value || 0).toFixed(2)
  );
}

/* =========================================================
   USER DATABASE
========================================================= */

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(
      USERS_FILE,
      "[]"
    );
  }

  try {
    const data =
      fs.readFileSync(
        USERS_FILE,
        "utf8"
      );

    const users =
      JSON.parse(data);

    return Array.isArray(users)
      ? users
      : [];
  } catch (error) {
    console.error(
      "USER DATABASE ERROR:",
      error.message
    );

    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(
      users,
      null,
      2
    )
  );
}

function cleanEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function validEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
    email
  );
}

/* =========================================================
   GMAIL
========================================================= */

function getTransporter() {
  const gmailUser =
    process.env.GMAIL_USER;

  const gmailPassword =
    process.env.GMAIL_APP_PASSWORD;

  if (
    !gmailUser ||
    !gmailPassword
  ) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword
    }
  });
}

/* =========================================================
   JWT AUTHENTICATION
========================================================= */

function authenticateToken(
  req,
  res,
  next
) {
  const authHeader =
    req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith(
      "Bearer "
    )
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
        "Invalid or expired login session."
    });
  }
}

/* =========================================================
   FILE DATABASE HELPERS
========================================================= */

function readJSONFile(
  file,
  defaultValue
) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(
        defaultValue,
        null,
        2
      )
    );
  }

  try {
    const data =
      fs.readFileSync(
        file,
        "utf8"
      );

    return JSON.parse(data);
  } catch (error) {
    console.error(
      `DATABASE ERROR (${path.basename(file)}):`,
      error.message
    );

    return defaultValue;
  }
}

function writeJSONFile(
  file,
  data
) {
  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

/* =========================================================
   HOME
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,
      app: "SIH DATA SUB",
      version: "2.0.0",
      message:
        "SIH DATA SUB backend is running."
    });
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/api/health",
  async (req, res) => {
    const transporter =
      getTransporter();

    let gmailReady = false;

    if (transporter) {
      try {
        await transporter.verify();

        gmailReady = true;
      } catch (error) {
        console.log(
          "Gmail verification:",
          error.message
        );
      }
    }

    res.json({
      success: true,

      server: true,

      app: "SIH DATA SUB",

      version: "2.0.0",

      gmailConfigured:
        !!transporter,

      gmailReady,

      paymentProvider:
        "PENDING",

      vtuProvider:
        "PENDING",

      smsProvider:
        "PENDING"
    });
  }
);

/* =========================================================
   REQUEST OTP
========================================================= */

app.post(
  "/api/auth/request-otp",
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const email =
        cleanEmail(
          req.body.email
        );

      const phone =
        String(
          req.body.phone || ""
        ).trim();

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your full name."
        });
      }

      if (!validEmail(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email address."
        });
      }

      const users =
        readUsers();

      if (
        users.some(
          user =>
            user.email === email
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this email already exists."
        });
      }

      if (
        phone &&
        users.some(
          user =>
            user.phone === phone
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this phone number already exists."
        });
      }

      const transporter =
        getTransporter();

      if (!transporter) {
        return res.status(503).json({
          success: false,
          message:
            "Gmail OTP is not configured on the server."
        });
      }

      const otp =
        String(
          Math.floor(
            100000 +
              Math.random() *
                900000
          )
        );

      otpStore.set(
        email,
        {
          otp,
          name,
          email,
          phone,
          expiresAt:
            Date.now() +
            OTP_EXPIRY_MS
        }
      );

      await transporter.sendMail({
        from:
          `"SIH DATA SUB" <${process.env.GMAIL_USER}>`,

        to: email,

        subject:
          "Your SIH DATA SUB verification code",

        text:
`Hello ${name},

Your SIH DATA SUB verification code is:

${otp}

This code expires in 10 minutes.

Do not share this code with anyone.

SIH DATA SUB
Fast • Secure • Reliable`
      });

      console.log(
        `Gmail OTP sent to ${email}`
      );

      res.json({
        success: true,
        message:
          "OTP sent to your Gmail."
      });

    } catch (error) {
      console.error(
        "GMAIL OTP ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to send OTP right now."
      });
    }
  }
);

/* =========================================================
   VERIFY OTP + CREATE ACCOUNT
========================================================= */

app.post(
  "/api/auth/verify-otp",
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const email =
        cleanEmail(
          req.body.email
        );

      const phone =
        String(
          req.body.phone || ""
        ).trim();

      const otp =
        String(
          req.body.otp || ""
        ).trim();

      const password =
        String(
          req.body.password || ""
        );

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your full name."
        });
      }

      if (!validEmail(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email address."
        });
      }

      if (!/^\d{6}$/.test(otp)) {
        return res.status(400).json({
          success: false,
          message:
            "Enter the 6-digit OTP."
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 8 characters."
        });
      }

      const record =
        otpStore.get(email);

      if (!record) {
        return res.status(400).json({
          success: false,
          message:
            "OTP is missing or expired. Request a new OTP."
        });
      }

      if (
        record.expiresAt <
        Date.now()
      ) {
        otpStore.delete(email);

        return res.status(400).json({
          success: false,
          message:
            "OTP has expired. Request a new OTP."
        });
      }

      if (record.otp !== otp) {
        return res.status(400).json({
          success: false,
          message:
            "Incorrect OTP."
        });
      }

      const users =
        readUsers();

      if (
        users.some(
          user =>
            user.email === email
        )
      ) {
        otpStore.delete(email);

        return res.status(409).json({
          success: false,
          message:
            "An account with this email already exists."
        });
      }

      if (
        phone &&
        users.some(
          user =>
            user.phone === phone
        )
      ) {
        otpStore.delete(email);

        return res.status(409).json({
          success: false,
          message:
            "An account with this phone number already exists."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const user = {
        id:
          Date.now().toString(),

        name,

        phone,

        email,

        passwordHash,

        createdAt:
          nowISO()
      };

      users.push(user);

      writeUsers(users);

      otpStore.delete(email);

      /*
        Create the user's wallet immediately.
        Starting balance is zero.
      */

      getWallet(user.id);

      const token =
        jwt.sign(
          {
            id: user.id,
            email: user.email,
            phone:
              user.phone || ""
          },
          JWT_SECRET,
          {
            expiresIn: "7d"
          }
        );

      res.json({
        success: true,

        message:
          "Account created successfully.",

        token,

        user: {
          id: user.id,
          name: user.name,
          phone:
            user.phone || "",
          email: user.email
        }
      });

    } catch (error) {
      console.error(
        "VERIFY OTP ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to create account."
      });
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const email =
        cleanEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      if (
        !validEmail(email) ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter your email and password."
        });
      }

      const users =
        readUsers();

      const user =
        users.find(
          item =>
            item.email === email
        );

      if (!user) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password."
        });
      }

      const passwordCorrect =
        await bcrypt.compare(
          password,
          user.passwordHash
        );

      if (!passwordCorrect) {
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
            email: user.email,
            phone:
              user.phone || ""
          },
          JWT_SECRET,
          {
            expiresIn: "7d"
          }
        );

      getWallet(user.id);

      res.json({
        success: true,

        message:
          "Login successful.",

        token,

        user: {
          id: user.id,
          name: user.name,
          phone:
            user.phone || "",
          email: user.email
        }
      });

    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Login failed."
      });
    }
  }
);

/* =========================================================
   WALLET DATABASE
========================================================= */

function readWallets() {
  return readJSONFile(
    WALLETS_FILE,
    {}
  );
}

function writeWallets(wallets) {
  writeJSONFile(
    WALLETS_FILE,
    wallets
  );
}

function getWallet(userId) {
  const wallets =
    readWallets();

  if (!wallets[userId]) {
    wallets[userId] = {
      userId,

      balance: 0,

      currency: "NGN",

      updatedAt:
        nowISO()
    };

    writeWallets(wallets);
  }

  return wallets[userId];
}

/* =========================================================
   TRANSACTION DATABASE
========================================================= */

function readTransactions() {
  return readJSONFile(
    TRANSACTIONS_FILE,
    []
  );
}

function writeTransactions(
  transactions
) {
  writeJSONFile(
    TRANSACTIONS_FILE,
    transactions
  );
}

/* =========================================================
   TRANSACTION LEDGER
========================================================= */

/*
  This is the central wallet ledger.

  type:
    credit = money added
    debit  = money removed

  status:
    completed
    pending
    failed
    reversed

  No public endpoint can directly credit a user's wallet.
  Future verified payment/provider callbacks will use
  these internal functions.
*/

function createLedgerTransaction({
  userId,
  type,
  amount,
  category,
  description,
  reference,
  status = "completed",
  metadata = {}
}) {
  const numericAmount =
    money(amount);

  if (
    !userId ||
    !["credit", "debit"].includes(
      type
    )
  ) {
    throw new Error(
      "Invalid ledger transaction."
    );
  }

  if (
    !Number.isFinite(
      numericAmount
    ) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Transaction amount must be greater than zero."
    );
  }

  const wallets =
    readWallets();

  if (!wallets[userId]) {
    wallets[userId] = {
      userId,
      balance: 0,
      currency: "NGN",
      updatedAt:
        nowISO()
    };
  }

  const wallet =
    wallets[userId];

  const balanceBefore =
    money(wallet.balance);

  if (
    type === "debit" &&
    balanceBefore < numericAmount
  ) {
    throw new Error(
      "Insufficient wallet balance."
    );
  }

  const balanceAfter =
    type === "credit"
      ? money(
          balanceBefore +
            numericAmount
        )
      : money(
          balanceBefore -
            numericAmount
        );

  wallet.balance =
    balanceAfter;

  wallet.updatedAt =
    nowISO();

  wallets[userId] =
    wallet;

  writeWallets(
    wallets
  );

  const transaction = {
    id:
      generateReference("TXN"),

    reference:
      reference ||
      generateReference("REF"),

    userId,

    type,

    amount:
      numericAmount,

    category:
      category || "general",

    description:
      description ||
      "",

    status,

    balanceBefore,

    balanceAfter,

    currency: "NGN",

    metadata,

    createdAt:
      nowISO()
  };

  const transactions =
    readTransactions();

  transactions.push(
    transaction
  );

  writeTransactions(
    transactions
  );

  return transaction;
}

/* =========================================================
   GET WALLET
========================================================= */

app.get(
  "/api/wallet",
  authenticateToken,
  (req, res) => {
    try {
      const wallet =
        getWallet(
          req.user.id
        );

      res.json({
        success: true,

        wallet: {
          balance:
            money(
              wallet.balance
            ),

          currency:
            wallet.currency,

          updatedAt:
            wallet.updatedAt
        }
      });

    } catch (error) {
      console.error(
        "WALLET ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load wallet."
      });
    }
  }
);

/* =========================================================
   GET TRANSACTION HISTORY
========================================================= */

app.get(
  "/api/transactions",
  authenticateToken,
  (req, res) => {
    try {
      const limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit
            ) || 50,
            1
          ),
          100
        );

      const transactions =
        readTransactions();

      const userTransactions =
        transactions
          .filter(
            transaction =>
              transaction.userId ===
              req.user.id
          )
          .sort(
            (a, b) =>
              new Date(
                b.createdAt
              ) -
              new Date(
                a.createdAt
              )
          )
          .slice(
            0,
            limit
          );

      res.json({
        success: true,

        transactions:
          userTransactions,

        count:
          userTransactions.length
      });

    } catch (error) {
      console.error(
        "TRANSACTION HISTORY ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load transaction history."
      });
    }
  }
);

/* =========================================================
   GET ONE TRANSACTION
========================================================= */

app.get(
  "/api/transactions/:reference",
  authenticateToken,
  (req, res) => {
    try {
      const reference =
        String(
          req.params.reference || ""
        ).trim();

      const transactions =
        readTransactions();

      const transaction =
        transactions.find(
          item =>
            item.userId ===
              req.user.id &&
            (
              item.reference ===
                reference ||
              item.id ===
                reference
            )
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

    } catch (error) {
      console.error(
        "TRANSACTION LOOKUP ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load transaction."
      });
    }
  }
);

/* =========================================================
   FUNDING DATABASE
========================================================= */

function readFunding() {
  return readJSONFile(
    FUNDING_FILE,
    []
  );
}

function writeFunding(records) {
  writeJSONFile(
    FUNDING_FILE,
    records
  );
}

/* =========================================================
   FUNDING QUOTE
========================================================= */

app.post(
  "/api/funding/quote",
  authenticateToken,
  (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      if (
        !Number.isFinite(amount) ||
        amount < MIN_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Minimum wallet funding is ₦${MIN_FUNDING.toLocaleString()}.`
        });
      }

      if (
        amount > MAX_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Maximum wallet funding is ₦${MAX_FUNDING.toLocaleString()}.`
        });
      }

      const walletCredit =
        Math.floor(amount);

      const fee =
        FUNDING_FEE;

      const totalToPay =
        walletCredit + fee;

      res.json({
        success: true,

        quote: {
          walletCredit,

          fee,

          totalToPay,

          currency: "NGN"
        }
      });

    } catch (error) {
      console.error(
        "FUNDING QUOTE ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to calculate funding quote."
      });
    }
  }
);

/* =========================================================
   CREATE FUNDING REQUEST
========================================================= */

app.post(
  "/api/funding/create",
  authenticateToken,
  (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      if (
        !Number.isFinite(amount) ||
        amount < MIN_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Minimum wallet funding is ₦${MIN_FUNDING.toLocaleString()}.`
        });
      }

      if (
        amount > MAX_FUNDING
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Maximum wallet funding is ₦${MAX_FUNDING.toLocaleString()}.`
        });
      }

      const walletCredit =
        Math.floor(amount);

      const fee =
        FUNDING_FEE;

      const totalToPay =
        walletCredit + fee;

      const funding = {
        id:
          generateReference("FND"),

        userId:
          req.user.id,

        walletCredit,

        fee,

        totalToPay,

        currency: "NGN",

        status: "pending",

        paymentProvider:
          null,

        providerReference:
          null,

        createdAt:
          nowISO(),

        verifiedAt:
          null
      };

      const records =
        readFunding();

      records.push(
        funding
      );

      writeFunding(
        records
      );

      res.status(201).json({
        success: true,

        message:
          "Funding request created. Your wallet will only be credited after verified payment.",

        funding
      });

    } catch (error) {
      console.error(
        "CREATE FUNDING ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to create funding request."
      });
    }
  }
);

/* =========================================================
   FUNDING HISTORY
========================================================= */

app.get(
  "/api/funding/history",
  authenticateToken,
  (req, res) => {
    try {
      const records =
        readFunding();

      const userRecords =
        records
          .filter(
            record =>
              record.userId ===
              req.user.id
          )
          .sort(
            (a, b) =>
              new Date(
                b.createdAt
              ) -
              new Date(
                a.createdAt
              )
          );

      res.json({
        success: true,

        funding:
          userRecords
      });

    } catch (error) {
      console.error(
        "FUNDING HISTORY ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load funding history."
      });
    }
  }
);

/* =========================================================
   SERVICE LIST
========================================================= */

app.get(
  "/api/services",
  authenticateToken,
  (req, res) => {
    res.json({
      success: true,

      services:
        SUPPORTED_SERVICES.map(
          service => ({
            id: service,

            name:
              service === "bulksms"
                ? "Bulk SMS"
                : service
                    .charAt(0)
                    .toUpperCase() +
                  service.slice(1),

            available: false,

            status:
              "PROVIDER_REQUIRED"
          })
        )
    });
  }
);

/* =========================================================
   SERVICE REQUEST FRAMEWORK
========================================================= */

/*
  This endpoint does NOT perform a fake VTU purchase.

  Until a legitimate provider is connected,
  the backend returns a clear message.

  Once a real provider is selected,
  the provider integration will:
    1. validate the request
    2. check wallet balance
    3. create a pending transaction
    4. call the provider
    5. debit only according to verified result
    6. save provider reference
    7. update transaction status
*/

app.post(
  "/api/services/purchase",
  authenticateToken,
  (req, res) => {
    const service =
      String(
        req.body.service || ""
      )
        .trim()
        .toLowerCase();

    if (
      !SUPPORTED_SERVICES.includes(
        service
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Unsupported service."
      });
    }

    res.status(503).json({
      success: false,

      code:
        "PROVIDER_NOT_CONNECTED",

      message:
        "This service is not live yet. A legitimate service provider must be connected before purchases can be processed."
    });
  }
);

/* =========================================================
   BONUS DATABASE
========================================================= */

const BONUS_FILE =
  path.join(
    __dirname,
    "bonus.json"
  );

function readBonus() {
  return readJSONFile(
    BONUS_FILE,
    {}
  );
}

function writeBonus(data) {
  writeJSONFile(
    BONUS_FILE,
    data
  );
}

function getBonus(userId) {
  const bonuses =
    readBonus();

  if (!bonuses[userId]) {
    bonuses[userId] = {
      userId,

      balance: 0,

      currency: "NGN",

      updatedAt:
        nowISO()
    };

    writeBonus(
      bonuses
    );
  }

  return bonuses[userId];
}

/* =========================================================
   BONUS BALANCE
========================================================= */

app.get(
  "/api/bonus",
  authenticateToken,
  (req, res) => {
    try {
      const bonus =
        getBonus(
          req.user.id
        );

      res.json({
        success: true,

        bonus: {
          balance:
            money(
              bonus.balance
            ),

          currency:
            bonus.currency,

          updatedAt:
            bonus.updatedAt
        }
      });

    } catch (error) {
      console.error(
        "BONUS ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load bonus balance."
      });
    }
  }
);

/* =========================================================
   ACCOUNT
========================================================= */

app.get(
  "/api/account",
  authenticateToken,
  (req, res) => {
    try {
      const users =
        readUsers();

      const user =
        users.find(
          item =>
            item.id ===
            req.user.id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "Account not found."
        });
      }

      res.json({
        success: true,

        user: {
          id: user.id,

          name: user.name,

          phone:
            user.phone || "",

          email: user.email,

          createdAt:
            user.createdAt
        }
      });

    } catch (error) {
      console.error(
        "ACCOUNT ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load account."
      });
    }
  }
);

/* =========================================================
   LOGOUT INFORMATION
========================================================= */

app.post(
  "/api/auth/logout",
  authenticateToken,
  (req, res) => {
    /*
      JWT is stateless.

      The frontend should remove its local token.
      Token revocation can be added later if needed.
    */

    res.json({
      success: true,
      message:
        "Logout successful."
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
        "Endpoint not found."
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

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      message:
        "Internal server error."
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");

    console.log(
      "======================================"
    );

    console.log(
      "          SIH DATA SUB"
    );

    console.log(
      "        BACKEND SERVER"
    );

    console.log(
      "======================================"
    );

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `http://localhost:${PORT}`
    );

    console.log(
      `Gmail OTP: ${
        getTransporter()
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      "Wallet Ledger: READY"
    );

    console.log(
      "Transaction History: READY"
    );

    console.log(
      "Funding Verification: PENDING PROVIDER"
    );

    console.log(
      "VTU Provider: PENDING"
    );

    console.log(
      "Paystack: NOT CONNECTED"
    );

    console.log(
      "SMS OTP: REMOVED"
    );

    console.log(
      "======================================"
    );

    console.log("");
  }
);