# Security policy

## Supported versions

Security fixes target the latest published release and the `main` branch. Older versions do not have a separate maintenance commitment. Use the [latest release](https://github.com/owlCoder/kova/releases/latest) and review its notes before upgrading.

## Report a vulnerability privately

Use GitHub's [Report a vulnerability](https://github.com/owlCoder/kova/security/advisories/new) form. Private vulnerability reporting is enabled for this repository. Please do not post exploit details, credentials, private project data or security-sensitive reproductions in public issues or pull requests before coordination.

Include:

- Kova extension version, VS Code version, operating system and architecture.
- The affected component and expected security boundary.
- Minimal reproduction steps using dummy data and a disposable project.
- Observed impact and any proposed fix or mitigation.

Reports are reviewed by the maintainers on a best-effort basis; there is no guaranteed response time or bug-bounty program. Coordinate public disclosure through the private report.

## Security boundaries

Kova's webview is isolated from direct Node.js access, and built-in workspace file tools validate paths. Credentials use VS Code SecretStorage. These controls do not make arbitrary project code or model output safe.

Approved commands, hooks and MCP servers run with your user privileges. They are not OS-sandboxed and may access resources outside the project. Open trusted projects and review their integration configuration. AI requests transmit the context needed for the active task to the provider endpoint you select. See [privacy and trust](README.md#privacy-and-trust).

Download VSIX packages from this repository's releases and use the accompanying checksums to verify file integrity.
