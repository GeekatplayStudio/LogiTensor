// DEMO PASTE-IN #1 — OAuth token + role/permission checker.
//
// This file is INTENTIONALLY messy: deeply nested if/else, a role switch,
// loops over scopes, a retry loop, magic numbers, and flags mutated from
// three places. It is the "legacy code someone emailed you" scenario.
//
// Try it: open the code panel → pencil → paste this file → Build Logic.
// The tangle becomes a visible flow of compare/branch/loop/counter nodes
// you can actually follow — then modify and clean up visually.

const TOKEN_AGE_SECONDS = 4210;
const MAX_TOKEN_AGE = 3600;
const RETRY_LIMIT = 3;
const ROLE = "editor";
const SCOPES = ["read", "write", "billing", "admin:keys"];
const REQUIRED_SCOPE = "write";
const FAILED_LOGINS_TODAY = 2;

let accessGranted = false;
let refreshedOk = false;
let auditTrail = "";
let riskScore = 0;
let scopeHits = 0;

// --- token freshness, with a retry tangle -------------------------------
if (TOKEN_AGE_SECONDS > MAX_TOKEN_AGE) {
  let attempt = 0;
  while (attempt < RETRY_LIMIT) {
    attempt = attempt + 1;
    // pretend the 2nd refresh attempt succeeds
    if (attempt === 2) {
      refreshedOk = true;
      break;
    }
  }
  if (refreshedOk) {
    auditTrail = "token expired but refresh succeeded on attempt " + attempt;
  } else {
    auditTrail = "token expired and refresh failed";
    riskScore = riskScore + 40;
  }
} else {
  refreshedOk = true;
  if (TOKEN_AGE_SECONDS > MAX_TOKEN_AGE - 300) {
    auditTrail = "token close to expiry";
    riskScore = riskScore + 5;
  } else {
    auditTrail = "token fresh";
  }
}

// --- role tier ----------------------------------------------------------
let roleTier = 0;
switch (ROLE) {
  case "owner":
    roleTier = 4;
    break;
  case "admin":
    roleTier = 3;
    break;
  case "editor":
    roleTier = 2;
    break;
  case "viewer":
    roleTier = 1;
    break;
  default:
    roleTier = 0;
    riskScore = riskScore + 25;
    break;
}

// --- scope walk (the loop everyone forgets to read) ---------------------
for (let i = 0; i < SCOPES.length; i++) {
  const scope = SCOPES[i];
  if (scope === REQUIRED_SCOPE) {
    scopeHits = scopeHits + 1;
  } else {
    if (scope === "admin:keys") {
      if (roleTier < 3) {
        // scope present that the role should not even hold
        riskScore = riskScore + 15;
      }
    }
  }
}

// --- behavioral risk ----------------------------------------------------
if (FAILED_LOGINS_TODAY > 5) {
  riskScore = riskScore + 30;
} else {
  if (FAILED_LOGINS_TODAY > 0) {
    riskScore = riskScore + FAILED_LOGINS_TODAY * 4;
  }
}

// --- the final verdict nobody can follow at a glance --------------------
if (refreshedOk) {
  if (scopeHits > 0) {
    if (roleTier >= 2) {
      if (riskScore < 50) {
        accessGranted = true;
      } else {
        accessGranted = false;
        auditTrail = auditTrail + " | blocked: risk " + riskScore;
      }
    } else {
      accessGranted = false;
      auditTrail = auditTrail + " | blocked: role tier " + roleTier + " too low";
    }
  } else {
    accessGranted = false;
    auditTrail = auditTrail + " | blocked: missing scope " + REQUIRED_SCOPE;
  }
} else {
  accessGranted = false;
  auditTrail = auditTrail + " | blocked: no valid token";
}

console.log("access granted: " + accessGranted);
console.log("risk score: " + riskScore);
console.log("audit: " + auditTrail);
