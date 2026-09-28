"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const ADMIN_PORT =
  process.env.ADMIN_PORT || 5200;

const ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET ||
  "CHANGE_ADMIN_SECRET_BEFORE_PRODUCTION";

const USERS_FILE =
  path.join(__dirname, "users.json");

const WALLETS_FILE =
  path.join(__dirname, "wallets.json");

const TRANSACTIONS_FILE =
  path.join(
    __dirname,
    "transactions.json"
  );

const FUNDING_FILE =
  path.join(__dirname, "funding.json");

const ADMIN_EMAIL =
  String(
    process.env.ADMIN_EMAIL || ""
  )
    .trim()
    .toLowerCase();

const ADMIN_PASSWORD =
  String(
    process.env.ADMIN_PASSWORD || ""
  );

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
   FILE HELPERS
========================================================= */

function readJSON(
  file,
  fallback
) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(
        fallback,
        null,
        2
      )
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      `DATABASE ERROR: ${path.basename(file)}`,
      error.message
    );

    return fallback;
  }
}

function writeJSON(
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

function readUsers() {
  return readJSON(
    USERS_FILE,
    []
  );
}

function readWallets() {
  return readJSON(
    WALLETS_FILE,
    {}
  );
}

function readTransactions() {
  return readJSON(
    TRANSACTIONS_FILE,
    []
  );
}

function readFunding() {
  return readJSON(
    FUNDING_FILE,
    []
  );
}

/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

function adminConfigured() {
  return Boolean(
    ADMIN_EMAIL &&
    ADMIN_PASSWORD &&
    process.env.ADMIN_JWT_SECRET
  );
}

function authenticateAdmin(
  req,
  res,
  next
) {
  const header =
    req.headers.authorization;

  if (
    !header ||
    !header.startsWith(
      "Bearer "
    )
  ) {
    return res.status(401).json({
      success: false,
      message:
        "Admin authentication required."
    });
  }

  const token =
    header.substring(7);

  try {
    const decoded =
      jwt.verify(
        token,
        ADMIN_JWT_SECRET
      );

    if (
      decoded.role !==
      "admin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required."
      });
    }

    req.admin = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired admin session."
    });
  }
}

/* =========================================================
   HOME
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,
      app:
        "SIH DATA SUB ADMIN",
      message:
        "Admin server is running.",
      port: ADMIN_PORT
    });
  }
);

/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post(
  "/api/admin/login",
  async (req, res) => {
    try {
      if (!adminConfigured()) {
        return res.status(503).json({
          success: false,
          message:
            "Admin credentials are not configured."
        });
      }

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

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
            "Enter admin email and password."
        });
      }

      if (
        email !==
        ADMIN_EMAIL
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid admin credentials."
        });
      }

      /*
        ADMIN_PASSWORD is expected to be a
        bcrypt hash.

        Never put a normal admin password
        directly into the source code.
      */

      const passwordCorrect =
        await bcrypt.compare(
          password,
          ADMIN_PASSWORD
        );

      if (!passwordCorrect) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid admin credentials."
        });
      }

      const token =
        jwt.sign(
          {
            role: "admin",
            email:
              ADMIN_EMAIL
          },
          ADMIN_JWT_SECRET,
          {
            expiresIn: "2h"
          }
        );

      res.json({
        success: true,
        message:
          "Admin login successful.",
        token
      });

    } catch (error) {
      console.error(
        "ADMIN LOGIN ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Admin login failed."
      });
    }
  }
);

/* =========================================================
   ADMIN STATUS
========================================================= */

app.get(
  "/api/admin/status",
  authenticateAdmin,
  (req, res) => {
    res.json({
      success: true,

      admin: {
        email:
          req.admin.email,

        role:
          req.admin.role
      }
    });
  }
);

/* =========================================================
   DASHBOARD SUMMARY
========================================================= */

app.get(
  "/api/admin/dashboard",
  authenticateAdmin,
  (req, res) => {
    try {
      const users =
        readUsers();

      const wallets =
        readWallets();

      const transactions =
        readTransactions();

      const funding =
        readFunding();

      let totalWalletBalance = 0;

      Object.values(
        wallets
      ).forEach(
        wallet => {
          totalWalletBalance +=
            Number(
              wallet.balance || 0
            );
        }
      );

      const completedTransactions =
        transactions.filter(
          transaction =>
            transaction.status ===
            "completed"
        );

      const pendingFunding =
        funding.filter(
          item =>
            item.status ===
            "pending"
        );

      res.json({
        success: true,

        dashboard: {
          totalUsers:
            users.length,

          totalWalletBalance:
            Number(
              totalWalletBalance.toFixed(
                2
              )
            ),

          totalTransactions:
            transactions.length,

          completedTransactions:
            completedTransactions.length,

          pendingFunding:
            pendingFunding.length
        }
      });

    } catch (error) {
      console.error(
        "ADMIN DASHBOARD ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load dashboard."
      });
    }
  }
);

/* =========================================================
   USERS
========================================================= */

app.get(
  "/api/admin/users",
  authenticateAdmin,
  (req, res) => {
    try {
      const users =
        readUsers();

      const wallets =
        readWallets();

      const safeUsers =
        users.map(
          user => ({
            id:
              user.id,

            name:
              user.name,

            phone:
              user.phone || "",

            email:
              user.email,

            createdAt:
              user.createdAt,

            walletBalance:
              Number(
                wallets[
                  user.id
                ]?.balance || 0
              )
          })
        );

      res.json({
        success: true,
        users:
          safeUsers
      });

    } catch (error) {
      console.error(
        "ADMIN USERS ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load users."
      });
    }
  }
);

/* =========================================================
   SINGLE USER
========================================================= */

app.get(
  "/api/admin/users/:id",
  authenticateAdmin,
  (req, res) => {
    try {
      const userId =
        String(
          req.params.id || ""
        );

      const users =
        readUsers();

      const wallets =
        readWallets();

      const transactions =
        readTransactions();

      const user =
        users.find(
          item =>
            item.id ===
            userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found."
        });
      }

      const userTransactions =
        transactions.filter(
          transaction =>
            transaction.userId ===
            userId
        );

      res.json({
        success: true,

        user: {
          id:
            user.id,

          name:
            user.name,

          phone:
            user.phone || "",

          email:
            user.email,

          createdAt:
            user.createdAt,

          wallet:
            wallets[userId] || {
              balance: 0,
              currency: "NGN"
            },

          transactionCount:
            userTransactions.length
        }
      });

    } catch (error) {
      console.error(
        "ADMIN USER ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load user."
      });
    }
  }
);

/* =========================================================
   ALL TRANSACTIONS
========================================================= */

app.get(
  "/api/admin/transactions",
  authenticateAdmin,
  (req, res) => {
    try {
      const transactions =
        readTransactions();

      const sorted =
        transactions
          .slice()
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

        transactions:
          sorted
      });

    } catch (error) {
      console.error(
        "ADMIN TRANSACTIONS ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load transactions."
      });
    }
  }
);

/* =========================================================
   FUNDING REQUESTS
========================================================= */

app.get(
  "/api/admin/funding",
  authenticateAdmin,
  (req, res) => {
    try {
      const funding =
        readFunding();

      const sorted =
        funding
          .slice()
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
          sorted
      });

    } catch (error) {
      console.error(
        "ADMIN FUNDING ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load funding requests."
      });
    }
  }
);

/* =========================================================
   SEARCH USERS
========================================================= */

app.get(
  "/api/admin/search-users",
  authenticateAdmin,
  (req, res) => {
    try {
      const query =
        String(
          req.query.q || ""
        )
          .trim()
          .toLowerCase();

      if (!query) {
        return res.json({
          success: true,
          users: []
        });
      }

      const users =
        readUsers();

      const wallets =
        readWallets();

      const results =
        users
          .filter(
            user =>
              String(
                user.name || ""
              )
                .toLowerCase()
                .includes(query) ||
              String(
                user.email || ""
              )
                .toLowerCase()
                .includes(query) ||
              String(
                user.phone || ""
              )
                .toLowerCase()
                .includes(query)
          )
          .map(
            user => ({
              id:
                user.id,

              name:
                user.name,

              email:
                user.email,

              phone:
                user.phone || "",

              walletBalance:
                Number(
                  wallets[
                    user.id
                  ]?.balance || 0
                )
            })
          );

      res.json({
        success: true,
        users:
          results
      });

    } catch (error) {
      console.error(
        "ADMIN SEARCH ERROR:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to search users."
      });
    }
  }
);

/* =========================================================
   SECURITY RULE
========================================================= */

/*
  IMPORTANT:

  This admin server intentionally does NOT expose
  an endpoint that allows an administrator or a client
  to simply add money to a user's wallet.

  Wallet credits must come from a verified payment
  or another legitimate server-side business event.

  This prevents accidental or unauthorized balance
  creation.
*/

/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/api/admin/logout",
  authenticateAdmin,
  (req, res) => {
    res.json({
      success: true,
      message:
        "Admin logout successful."
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
        "Admin endpoint not found."
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
      "ADMIN SERVER ERROR:",
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
        "Internal admin server error."
    });
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  ADMIN_PORT,
  () => {
    console.log("");

    console.log(
      "======================================"
    );

    console.log(
      "       SIH DATA SUB ADMIN"
    );

    console.log(
      "          SERVER"
    );

    console.log(
      "======================================"
    );

    console.log(
      `Admin server running on port ${ADMIN_PORT}`
    );

    console.log(
      `http://localhost:${ADMIN_PORT}`
    );

    console.log(
      `Admin credentials: ${
        adminConfigured()
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      "======================================"
    );

    console.log("");
  }
);