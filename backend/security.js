"use strict";

/*
=========================================================
SIH DATA SUB
SECURITY CONFIGURATION
=========================================================

This file contains security helpers that can be used by
the backend when the production security layer is enabled.

IMPORTANT:
- Never store Gmail passwords, API keys, payment secrets,
  or JWT secrets in this file.
- Keep private credentials inside .env.
- Never expose .env to the frontend.
=========================================================
*/

const crypto = require("crypto");

/* =========================================================
   SECURITY CONSTANTS
========================================================= */

const SECURITY = {
  MIN_PASSWORD_LENGTH: 8,

  MAX_PASSWORD_LENGTH: 128,

  OTP_LENGTH: 6,

  OTP_EXPIRY_MINUTES: 10,

  LOGIN_TOKEN_DAYS: 7,

  ADMIN_TOKEN_HOURS: 2,

  MAX_JSON_BODY: "1mb",

  MAX_TRANSACTION_AMOUNT: 1000000,

  CURRENCY: "NGN"
};

/* =========================================================
   RANDOM SECURE REFERENCE
========================================================= */

function secureReference(
  prefix = "REF"
) {
  const random =
    crypto
      .randomBytes(8)
      .toString("hex")
      .toUpperCase();

  const time =
    Date.now().toString(36)
      .toUpperCase();

  return `${prefix}-${time}-${random}`;
}

/* =========================================================
   SECURE RANDOM OTP
========================================================= */

function generateOTP() {
  const minimum = 100000;

  const maximum = 999999;

  const range =
    maximum - minimum + 1;

  const random =
    crypto.randomInt(
      0,
      range
    );

  return String(
    minimum + random
  );
}

/* =========================================================
   PASSWORD VALIDATION
========================================================= */

function validatePassword(
  password
) {
  const value =
    String(password || "");

  if (
    value.length <
    SECURITY.MIN_PASSWORD_LENGTH
  ) {
    return {
      valid: false,
      message:
        `Password must be at least ${SECURITY.MIN_PASSWORD_LENGTH} characters.`
    };
  }

  if (
    value.length >
    SECURITY.MAX_PASSWORD_LENGTH
  ) {
    return {
      valid: false,
      message:
        `Password cannot exceed ${SECURITY.MAX_PASSWORD_LENGTH} characters.`
    };
  }

  return {
    valid: true,
    message:
      "Password is valid."
  };
}

/* =========================================================
   EMAIL VALIDATION
========================================================= */

function validateEmail(
  email
) {
  const value =
    String(email || "")
      .trim()
      .toLowerCase();

  const valid =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/
      .test(value);

  return {
    valid,
    email: value,

    message: valid
      ? "Email is valid."
      : "Enter a valid email address."
  };
}

/* =========================================================
   PHONE CLEANING
========================================================= */

function cleanPhone(
  phone
) {
  return String(phone || "")
    .trim()
    .replace(
      /[\s()-]/g,
      ""
    );
}

/* =========================================================
   AMOUNT VALIDATION
========================================================= */

function validateAmount(
  amount,
  minimum = 1,
  maximum =
    SECURITY.MAX_TRANSACTION_AMOUNT
) {
  const value =
    Number(amount);

  if (
    !Number.isFinite(value)
  ) {
    return {
      valid: false,
      amount: 0,
      message:
        "Enter a valid amount."
    };
  }

  if (
    value < minimum
  ) {
    return {
      valid: false,
      amount: value,
      message:
        `Minimum amount is ₦${minimum.toLocaleString()}.`
    };
  }

  if (
    value > maximum
  ) {
    return {
      valid: false,
      amount: value,
      message:
        `Maximum amount is ₦${maximum.toLocaleString()}.`
    };
  }

  return {
    valid: true,

    amount:
      Number(
        value.toFixed(2)
      ),

    message:
      "Amount is valid."
  };
}

/* =========================================================
   SAFE MONEY
========================================================= */

function money(
  value
) {
  const number =
    Number(value || 0);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Number(
    number.toFixed(2)
  );
}

/* =========================================================
   TIMING-SAFE SECRET CHECK
========================================================= */

function safeSecretCompare(
  first,
  second
) {
  const firstBuffer =
    Buffer.from(
      String(first || "")
    );

  const secondBuffer =
    Buffer.from(
      String(second || "")
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

/* =========================================================
   REQUEST ID
========================================================= */

function requestId() {
  return secureReference(
    "REQ"
  );
}

/* =========================================================
   MASK SENSITIVE DATA
========================================================= */

function maskEmail(
  email
) {
  const value =
    String(email || "");

  const at =
    value.indexOf("@");

  if (
    at <= 0
  ) {
    return "***";
  }

  const name =
    value.substring(
      0,
      at
    );

  const domain =
    value.substring(
      at
    );

  if (
    name.length <= 2
  ) {
    return (
      "*" +
      domain
    );
  }

  return (
    name.substring(
      0,
      2
    ) +
    "***" +
    domain
  );
}

/* =========================================================
   MASK PHONE
========================================================= */

function maskPhone(
  phone
) {
  const value =
    cleanPhone(phone);

  if (
    value.length < 7
  ) {
    return "***";
  }

  return (
    value.substring(
      0,
      3
    ) +
    "****" +
    value.substring(
      value.length - 3
    )
  );
}

/* =========================================================
   REMOVE SECRET FIELDS
========================================================= */

function removeSecrets(
  object
) {
  if (
    !object ||
    typeof object !==
      "object"
  ) {
    return object;
  }

  const clone =
    Array.isArray(object)
      ? [...object]
      : {
          ...object
        };

  const secretFields = [
    "password",
    "passwordHash",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "secret",
    "appPassword",
    "gmailPassword",
    "GMAIL_APP_PASSWORD",
    "JWT_SECRET",
    "ADMIN_JWT_SECRET"
  ];

  secretFields.forEach(
    field => {
      if (
        Object.prototype.hasOwnProperty.call(
          clone,
          field
        )
      ) {
        delete clone[field];
      }
    }
  );

  return clone;
}

/* =========================================================
   SECURITY HEADERS
========================================================= */

function securityHeaders(
  req,
  res,
  next
) {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "X-Frame-Options",
    "DENY"
  );

  res.setHeader(
    "Referrer-Policy",
    "no-referrer"
  );

  res.setHeader(
    "X-XSS-Protection",
    "0"
  );

  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  next();
}

/* =========================================================
   SIMPLE RATE LIMITER
========================================================= */

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  maxRequests = 100
} = {}) {
  const requests =
    new Map();

  return function rateLimiter(
    req,
    res,
    next
  ) {
    const forwarded =
      req.headers[
        "x-forwarded-for"
      ];

    const ip =
      String(
        forwarded ||
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown"
      )
        .split(",")[0]
        .trim();

    const now =
      Date.now();

    const existing =
      requests.get(ip);

    if (
      !existing ||
      now - existing.start >=
        windowMs
    ) {
      requests.set(
        ip,
        {
          start: now,
          count: 1
        }
      );

      return next();
    }

    existing.count += 1;

    if (
      existing.count >
      maxRequests
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Too many requests. Please try again later."
      });
    }

    next();
  };
}

/* =========================================================
   AUTH RATE LIMITER
========================================================= */

const authRateLimiter =
  createRateLimiter({
    windowMs:
      15 * 60 * 1000,

    maxRequests: 20
  });

/* =========================================================
   OTP RATE LIMITER
========================================================= */

const otpRateLimiter =
  createRateLimiter({
    windowMs:
      10 * 60 * 1000,

    maxRequests: 5
  });

/* =========================================================
   PAYMENT RATE LIMITER
========================================================= */

const paymentRateLimiter =
  createRateLimiter({
    windowMs:
      10 * 60 * 1000,

    maxRequests: 30
  });

/* =========================================================
   SECURITY LOG
========================================================= */

function securityLog(
  event,
  details = {}
) {
  const safeDetails =
    removeSecrets(
      details
    );

  console.log(
    JSON.stringify({
      time:
        new Date().toISOString(),

      event,

      details:
        safeDetails
    })
  );
}

/* =========================================================
   ENVIRONMENT CHECK
========================================================= */

function checkProductionSecrets() {
  const warnings = [];

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length <
      32
  ) {
    warnings.push(
      "JWT_SECRET should be a long random production secret."
    );
  }

  if (
    !process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET.length <
      32
  ) {
    warnings.push(
      "ADMIN_JWT_SECRET should be a long random production secret."
    );
  }

  if (
    !process.env.GMAIL_USER ||
    !process.env.GMAIL_APP_PASSWORD
  ) {
    warnings.push(
      "Gmail OTP credentials are not completely configured."
    );
  }

  return {
    secure:
      warnings.length === 0,

    warnings
  };
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  SECURITY,

  secureReference,

  generateOTP,

  validatePassword,

  validateEmail,

  cleanPhone,

  validateAmount,

  money,

  safeSecretCompare,

  requestId,

  maskEmail,

  maskPhone,

  removeSecrets,

  securityHeaders,

  createRateLimiter,

  authRateLimiter,

  otpRateLimiter,

  paymentRateLimiter,

  securityLog,

  checkProductionSecrets
};