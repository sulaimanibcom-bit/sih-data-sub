"use strict";

const CACHE_NAME = "sih-data-sub-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

/* =========================================================
   INSTALL
========================================================= */

self.addEventListener(
  "install",
  event => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache =>
          cache.addAll(APP_FILES)
        )
        .then(() =>
          self.skipWaiting()
        )
    );
  }
);

/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener(
  "activate",
  event => {
    event.waitUntil(
      caches
        .keys()
        .then(cacheNames =>
          Promise.all(
            cacheNames
              .filter(
                name =>
                  name !== CACHE_NAME
              )
              .map(name =>
                caches.delete(name)
              )
          )
        )
        .then(() =>
          self.clients.claim()
        )
    );
  }
);

/* =========================================================
   FETCH
========================================================= */

self.addEventListener(
  "fetch",
  event => {
    const request =
      event.request;

    /*
      API requests should always go
      to the real backend.

      We do not cache API responses,
      wallet balances, transactions,
      login requests, OTP requests,
      or payment information.
    */

    if (
      request.url.includes(
        "/api/"
      )
    ) {
      return;
    }

    /*
      App files:
      Network first, then cached copy.
    */

    event.respondWith(
      fetch(request)
        .then(response => {
          if (
            response &&
            response.status === 200 &&
            response.type ===
              "basic"
          ) {
            const responseCopy =
              response.clone();

            caches
              .open(CACHE_NAME)
              .then(cache => {
                cache.put(
                  request,
                  responseCopy
                );
              });
          }

          return response;
        })
        .catch(() =>
          caches.match(request)
        )
    );
  }
);