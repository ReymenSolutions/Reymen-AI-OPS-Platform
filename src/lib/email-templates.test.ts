import { describe, it, expect } from "vitest";
import {
  escalationAlertEmail,
  automationFailureEmail,
  newClientRequestEmail,
  teamInviteEmail,
} from "./email-templates";

const XSS_PAYLOAD = `<img src=x onerror="alert('pwned')"><a href="https://evil.example/phish">click</a>`;

describe("email-templates — HTML injection protection", () => {
  it("escapes an attacker-controlled contact name in escalationAlertEmail", () => {
    const email = escalationAlertEmail("Acme Org", XSS_PAYLOAD, "https://app.example/portal");
    expect(email.html).not.toContain("<img src=x onerror=");
    expect(email.html).not.toContain('<a href="https://evil.example/phish">');
    expect(email.html).toContain("&lt;img src=x onerror=");
  });

  it("escapes an attacker-controlled org name in escalationAlertEmail", () => {
    const email = escalationAlertEmail(XSS_PAYLOAD, "Ana García", "https://app.example/portal");
    expect(email.html).not.toContain("<img src=x onerror=");
  });

  it("escapes an attacker-controlled automation name in automationFailureEmail", () => {
    const email = automationFailureEmail("Acme Org", XSS_PAYLOAD, "https://app.example/admin");
    expect(email.html).not.toContain("<img src=x onerror=");
  });

  it("escapes an attacker-controlled request title in newClientRequestEmail", () => {
    const email = newClientRequestEmail("Acme Org", XSS_PAYLOAD, "https://app.example/admin");
    expect(email.html).not.toContain("<img src=x onerror=");
  });

  it("escapes an attacker-controlled org name in teamInviteEmail", () => {
    const email = teamInviteEmail(XSS_PAYLOAD, "https://app.example/login");
    expect(email.html).not.toContain("<img src=x onerror=");
  });

  it("still renders a normal, benign name unescaped-looking (no double-encoding of ordinary text)", () => {
    const email = escalationAlertEmail("Clínica San Rafael", "María López", "https://app.example/portal");
    expect(email.html).toContain("María López");
    expect(email.html).toContain("Clínica San Rafael");
  });
});
