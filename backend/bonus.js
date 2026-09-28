"use strict";

const fs = require("fs");
const path = require("path");

const BONUS_FILE = path.join(
  __dirname,
  "bonus.json"
);

const BONUS_CURRENCY = "NGN";

/* =========================================================
   DATABASE
========================================================= */

function readBonusDatabase() {
  if (!fs.existsSync(BONUS_FILE)) {
    fs.writeFileSync(
      BONUS_FILE,
      "{}"
    );
  }

  try {
    const data = fs.readFileSync(
      BONUS_FILE,
      "utf8"
    );

    const parsed =
      JSON.parse(data);

    return parsed &&
      typeof parsed === "object"
      ? parsed
      : {};
  } catch (error) {
    console.error(
      "BONUS DATABASE ERROR:",
      error.message
    );

    return {};
  }
}

function writeBonusDatabase(
  database
) {
  fs.writeFileSync(
    BONUS_FILE,
    JSON.stringify(
      database,
      null,
      2
    )
  );
}

/* =========================================================
   HELPERS
========================================================= */

function money(value) {
  return Number(
    Number(value || 0).toFixed(2)
  );
}

function generateBonusReference() {
  return (
    "BON-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()
  );
}

/* =========================================================
   GET BONUS ACCOUNT
========================================================= */

function getBonusAccount(userId) {
  if (!userId) {
    throw new Error(
      "User ID is required."
    );
  }

  const database =
    readBonusDatabase();

  if (!database[userId]) {
    database[userId] = {
      userId,

      balance: 0,

      currency:
        BONUS_CURRENCY,

      transactions: [],

      updatedAt:
        new Date().toISOString()
    };

    writeBonusDatabase(
      database
    );
  }

  return database[userId];
}

/* =========================================================
   ADD BONUS
========================================================= */

function addBonus({
  userId,
  amount,
  reason,
  source = "system",
  metadata = {}
}) {
  const numericAmount =
    money(amount);

  if (!userId) {
    throw new Error(
      "User ID is required."
    );
  }

  if (
    !Number.isFinite(
      numericAmount
    ) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Bonus amount must be greater than zero."
    );
  }

  const database =
    readBonusDatabase();

  const account =
    database[userId] ||
    {
      userId,

      balance: 0,

      currency:
        BONUS_CURRENCY,

      transactions: [],

      updatedAt:
        new Date().toISOString()
    };

  const balanceBefore =
    money(account.balance);

  const balanceAfter =
    money(
      balanceBefore +
      numericAmount
    );

  const transaction = {
    id:
      generateBonusReference(),

    userId,

    type: "credit",

    amount:
      numericAmount,

    reason:
      reason ||
      "Bonus",

    source,

    balanceBefore,

    balanceAfter,

    currency:
      BONUS_CURRENCY,

    metadata,

    createdAt:
      new Date().toISOString()
  };

  account.balance =
    balanceAfter;

  account.transactions.push(
    transaction
  );

  account.updatedAt =
    transaction.createdAt;

  database[userId] =
    account;

  writeBonusDatabase(
    database
  );

  return transaction;
}

/* =========================================================
   USE BONUS
========================================================= */

function useBonus({
  userId,
  amount,
  reason,
  metadata = {}
}) {
  const numericAmount =
    money(amount);

  if (!userId) {
    throw new Error(
      "User ID is required."
    );
  }

  if (
    !Number.isFinite(
      numericAmount
    ) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Bonus amount must be greater than zero."
    );
  }

  const database =
    readBonusDatabase();

  const account =
    database[userId];

  if (!account) {
    throw new Error(
      "Bonus account not found."
    );
  }

  const balanceBefore =
    money(account.balance);

  if (
    balanceBefore <
    numericAmount
  ) {
    throw new Error(
      "Insufficient bonus balance."
    );
  }

  const balanceAfter =
    money(
      balanceBefore -
      numericAmount
    );

  const transaction = {
    id:
      generateBonusReference(),

    userId,

    type: "debit",

    amount:
      numericAmount,

    reason:
      reason ||
      "Bonus used",

    source:
      "system",

    balanceBefore,

    balanceAfter,

    currency:
      BONUS_CURRENCY,

    metadata,

    createdAt:
      new Date().toISOString()
  };

  account.balance =
    balanceAfter;

  account.transactions.push(
    transaction
  );

  account.updatedAt =
    transaction.createdAt;

  database[userId] =
    account;

  writeBonusDatabase(
    database
  );

  return transaction;
}

/* =========================================================
   GET BONUS TRANSACTIONS
========================================================= */

function getBonusTransactions(
  userId,
  limit = 50
) {
  const account =
    getBonusAccount(
      userId
    );

  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 50,
        1
      ),
      100
    );

  return [
    ...account.transactions
  ]
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
      safeLimit
    );
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  getBonusAccount,
  addBonus,
  useBonus,
  getBonusTransactions
};