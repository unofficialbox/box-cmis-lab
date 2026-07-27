## Learned User Preferences

- Prefer Bun + Vite for this browser SPA.
- Prefer `@unofficialbox/box-open-elements` components before custom UI; use `box-tree-grid` for the folder browser with columns for CMIS base type, Object ID, and last modified; follow the community design in that repo’s `docs-site/DESIGN.md`.
- Connect auth modes should be OAuth 2.0, Client Credentials Grant, and JWT; mask client secrets and do not show access/refresh tokens on the OAuth login form.
- For CCG, use Box Subject Type (`enterprise` | `user`) and Box Subject Id instead of separate Enterprise Id / User Id fields.
- For JWT, use a config `.json` file picker plus a beautified paste textarea; omit individual JWT key/passphrase inputs.
- Default CMIS service URL should be `http://127.0.0.1:8080/cmis`.
- Keep the connect form succinct; align Load repositories with the Succinct JSON toggle; avoid extra helper copy.
- Put Connect / Disconnect and multi-account switching in an upper-right avatar/profile menu (GitHub-inspired); mark the active account with a green circle and soft halo (not a checkmark).
- On connect, show the folder tree (~60%) on the left and Repo Info/details (~40%) on the right; render object fields from CMIS properties.
- In the folder tree, folder click loads details and expands children; file click loads details; selection must not scroll the tree back to the top.
- Put the HTTP Inspector in a collapsible, user-resizable terminal-style shelf pinned to the bottom of the page (not a primary top-nav view).

## Learned Workspace Facts

- Box CMIS Lab is a modern CMIS Browser Binding lab SPA, a web successor to Apache Chemistry OpenCMIS Workbench aimed at the Box CMIS Connector and other CMIS 1.1 Browser Binding endpoints.
- UI chrome comes from `@unofficialbox/box-open-elements` (`https://github.com/unofficialbox/box-open-elements`); a local clone often lives under `/Users/massnerder/Developer/Code/box-open-elements`.
- The classic Workbench reference lives at `/Users/massnerder/Developer/Code/box-cmis/chemistry-opencmis-workbench`.
- Vite proxies `/cmis` (local connector) and `/box-api` (Box API) to avoid browser CORS during development.
- Connect form auth can be seeded from a gitignored Vite `.env` (see `.env.sample`); JWT config may be injected via `VITE_JWT_CONFIG_FILE`.
- Repo Info Box Enterprise ID comes from Box `/users/me` with `fields=enterprise` (not CMIS repositoryId).
