# Conti

PWA personale per le finanze personali e professionali (regime forfettario), offline-first, con un Google Sheet come database.

> Il README completo (Google Sheet, Apps Script, deploy, installazione come PWA) arriverà nella fase 8.

## Sviluppo locale

Requisiti: Node 20 o superiore.

```bash
npm install
npm run dev        # http://localhost:5173 (con -- --host anche da cellulare in LAN)
npm test           # test Vitest
npm run lint && npm run typecheck
npm run build && npm run preview   # build di produzione con service worker (prova offline)
```
