# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in ClawdAgent, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to Report

1. Email: Open a private security advisory on GitHub (Settings > Security > Advisories)
2. Include: Description, steps to reproduce, potential impact
3. Response time: We aim to respond within 48 hours

### Scope

The following are in scope:
- Prompt injection bypasses in content-guard
- Social engineering detection bypasses
- Memory tampering / checksum bypass
- Authentication/authorization flaws in the web dashboard
- Command injection via tool executor
- Secrets exposure in logs or responses

### Security Architecture

ClawdAgent implements defense-in-depth:

- **Content Guard**: 20+ injection patterns, social engineering detection
- **Memory Integrity**: SHA-256 checksums on all stored memories
- **Audit Chain**: Tamper-evident hash chain on all operations
- **Command Guard**: Dangerous command blocking
- **Rate Limiting**: Per-endpoint and per-user limits
- **RBAC**: Role-based access control
- **Encryption**: At-rest encryption for sensitive data
- **Key Rotation**: Automatic key rotation support
- **Kill Switch**: Emergency stop mechanism
- **Approval Gate**: Human-in-the-loop for critical actions

### Supported Versions

| Version | Supported |
|---------|-----------|
| 5.x     | Yes       |
| < 5.0   | No        |
