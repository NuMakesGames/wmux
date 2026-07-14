# Security Policy

wmux grants terminal access to configured machines. It is intended for one
trusted user behind loopback, Tailscale, or another private network boundary.
Public-Internet or multi-tenant deployment is not supported.

## Reporting a Vulnerability

Use [GitHub private vulnerability reporting](https://github.com/gisenberg/wmux/security/advisories/new)
for suspected vulnerabilities. Do not open a public issue with exploit details
or sensitive deployment information.

Include, where possible:

- the affected release or commit;
- operating system, browser, and session backend;
- minimal reproduction steps and expected impact;
- sanitized configuration relevant to the issue; and
- any mitigation or proposed fix you have identified.

Remove tokens, credentials, private hosts, usernames, terminal contents, and
other personal deployment details. Reports are handled on a best-effort basis;
please allow time to reproduce and assess the issue before public disclosure.

## Supported Versions and Scope

Security fixes target the latest release and current `main`; older releases do
not receive a guaranteed maintenance window.

The documented private-network assumptions are not themselves vulnerabilities.
However, bypasses of wmux's bind, Host, Origin, authentication, proxy,
WebSocket, helper-endpoint, secret-redaction, or session-isolation controls are
in scope. General hardening ideas and non-sensitive defects can use the public
issue tracker.

Known limitations are documented in the README and AGENTS.md. A documented
limitation should still be reported privately if it has a materially greater
security impact than described.
