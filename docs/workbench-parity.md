# Workbench parity

How Box CMIS Lab maps to Apache Chemistry OpenCMIS Workbench.

| Workbench surface | Lab MVP | Notes |
| --- | --- | --- |
| Login / Expert connection | Connect dialog | Browser Binding only; optional HTTP Basic |
| Folder browse + children table | Folder tree panel | Path bar, Up, expandable tree grid |
| Details tabs | Details panel | Object, Properties, ACL, Versions, Renditions |
| Download content | Download button | Documents only |
| Query frame | Query panel | Enabled from `capabilityQuery` |
| Log frame | HTTP Inspector | Request/response bodies, not Log4j |
| Create object dialogs | Deferred | Phase 2 |
| Actions panel (CRUD, checkout, …) | Deferred | Phase 2, capability-gated |
| Types browser | Deferred | |
| Change log | Deferred | |
| Groovy console | Out of scope | |
| OpenCMIS TCK runner | Out of scope | Use existing `box-cmis-tck` harness |
| AtomPub / Web Services | Out of scope | Browser Binding only |
