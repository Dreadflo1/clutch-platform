# Clutch — Roadmap

Plateforme de paris **peer-to-peer skill-gaming** : deux joueurs se défient sur un
vrai match (LoL/Valorant, Dota 2, Clash Royale/Brawl Stars), misent des jetons
**CLU**, le gagnant empoche la cagnotte (fee plateforme 2,5 %).

_Dernière éval : 2026-08-11 · v1.0.0 · déployé sur Vercel (`clutch-wine.vercel.app`)_

---

## Où on en est (fait ✅)

- **Front** statique servi par Vercel : `index.html` (monolithe ~316 Ko), `hub.js`
  (hub esport/news), `p2p.js` (UI défis), `api.js`/`config.js` (data sportive).
- **Backend serverless** (`api/`) :
  - Auth : MetaMask (nonce + signature) et Telegram (widget) → JWT.
  - Défis : create / accept / settle, avec **escrow côté serveur** et défi signé HMAC.
  - Wallet : balance / deposit / transactions.
  - Verify : proxies Riot / Dota2 / Supercell lisant les vraies APIs de jeu.
  - News.
- **Persistance** Vercel KV (`api/_kv.js`).
- **Sécurité durcie** : CSP, HSTS, rate-limit, sanitize, headers, JWT.

## Ce qui bloque un lancement "vrai argent" (constats)

| # | Constat | Fichier | Gravité |
|---|---------|---------|---------|
| 1 | Deposits en **mode démo** (crédite du CLU sans paiement réel) | `api/wallet/deposit.js` | 🔴 |
| 2 | **Aucun endpoint withdraw** — l'argent entre, ne sort pas | `api/wallet/` | 🔴 |
| 3 | Settlement **à l'honneur** ; `verify/*` non câblé dans le settle | `api/challenges/settle.js` | 🔴 |
| 4 | Statut `disputed` **sans résolution** (pas d'admin ni d'auto-verify) | `api/challenges/settle.js` | 🔴 |
| 5 | `bal.version` incrémenté mais **jamais vérifié** → race / double-dépense | `wallet` + `challenges` | 🔴 |
| 6 | KV **fallback silencieux en mémoire** si env vars absentes → soldes perdus au cold start | `api/_kv.js` | 🔴 |
| 7 | Secrets par défaut (`CHALLENGE_SECRET='dev-...-change-me'`, JWT) à durcir en prod | `api/challenges/index.js`, `_jwt.js` | 🟠 |
| 8 | Code **démo legacy** (pool virtuel, timer fake, feed/poll fictifs) | `p2p.js`, `hub.js` | 🟠 |
| 9 | Aucun cadre **légal** (gambling, KYC/AML, âge, geo-blocage) | — | 🔴 (légal) |
| 10 | Aucun **test**, aucune **CI** | — | 🟠 |
| 11 | `index.html` monolithe 316 Ko (maintenabilité) | `index.html` | 🟡 |
| 12 | Dossier parasite `C:Usersf_chuDocumentstrae_projectscivio` à supprimer | racine | 🟡 |

---

## Phase 0 — Stabiliser la prod _(quick wins, avant tout le reste)_

- [x] `_kv.js` **fail-loud en prod** si `KV_REST_API_URL`/`_TOKEN` manquent (plus de fallback mémoire silencieux ; le fallback ne sert qu'en dev). _(2026-08-11)_
- [ ] Confirmer côté Vercel que **KV est réellement provisionné** et branché (action dashboard, hors code).
- [ ] Définir tous les **secrets** en env Vercel : `CHALLENGE_SECRET`, secret JWT (`JWT_SECRET`), `TELEGRAM_BOT_TOKEN`, clés jeux (`RIOT_API_KEY`, `STEAM_API_KEY`, `CLASH_ROYALE_API_KEY`, `BRAWL_STARS_API_KEY`).
- [ ] Retirer / isoler le **code démo** (`p2p.js` pool virtuel + timer fake, feed & sondages fictifs de `hub.js`) derrière un flag `DEMO_MODE`.
- [x] Supprimer le dossier parasite `C:Users...civio` à la racine. _(2026-08-11)_

## Phase 1 — Intégrité de l'argent _(non négociable)_

- [x] **Mutations de solde atomiques** (`api/_balance.js`) : `mutateBalance` + `settleEscrow` via Lua EVAL (atomique dans Redis) ; check de suffisance dans le script → plus de race / double-accept / double-settle. Fallback mémoire synchrone pour le dev. Câblé dans deposit, withdraw, challenges create/accept et settle. _(2026-08-11)_
- [x] **Locks atomiques** (`kvLock` = SET NX EX) sur accept et settle → un seul gagnant en cas d'appels concurrents. _(2026-08-11)_
- [x] Endpoint **`/api/wallet/withdraw`** avec plafonds (min/max + cap journalier) et journalisation. _(2026-08-11)_
- [x] Corrigé un **bug bloquant** dans `settle.js` : le 2e joueur était rejeté par `status !== 'active'` (le statut passe à `awaiting_result` après le 1er) → le settlement ne pouvait jamais se terminer. _(2026-08-11)_
- [ ] Rendre l'escrow **idempotent** (clés de tx déterministes) pour survivre aux retries serverless.
- [ ] **Test live contre KV réel** : les scripts Lua ne sont validés qu'en mémoire (11/11 sur le smoke test) ; à rejouer avec un vrai backend Upstash avant confiance totale.
- [ ] Réconciliation : total available + escrow doit être invariant ; ajouter un check périodique.

## Phase 2 — Settlement de confiance _(le cœur du produit)_

- [x] **`verify/*` câblé dans `settle.js`** via `api/_verify.js` (source unique, endpoints riot/dota2 factorisés dessus) : voie auto-vérifiée `{ challengeId, matchId, handle, region? }` — les 2 joueurs soumettent le matchId + leur handle, le serveur exige le **même matchId**, lit le **vrai résultat** (Riot match-v5 / Steam GetMatchDetails) et paie le vainqueur réel. Fallback honor-system conservé pour les jeux non vérifiables. _(2026-08-11)_
- [x] **Anti-triche de base** : fenêtre de fraîcheur du match (≥ `acceptedAt − 6h`, sinon `disputed:stale_match`), consensus matchId (`disputed:match_id_mismatch`), cohérence 1v1 un seul gagnant (`disputed:inconsistent_outcome`). Échec d'API → 502 sans finaliser (retry possible). _(2026-08-11)_
- [x] **Fonds jamais piégés** (le trou le plus sévère) : `ch:<id>` persisté **sans TTL** tant qu'il détient de l'escrow (avant : TTL 48h → escrow orphelin) ; endpoint **cancel** (créateur récupère sa mise d'un défi non accepté) ; **deadline de règlement** (24h) + **auto-refund draw** au timeout (opportuniste dans `settle` + cron `maintenance.js` quotidien) → un no-show/grief ne peut plus geler la mise adverse ; refunds atomiques idempotents (`refundEscrow`/`refundDraw`/`cancelOpen` dans `_challenges.js`). Test 18/18. _(2026-08-11)_
- [x] Corrigé ma **régression de fraîcheur** : fenêtre 6h → 5min (le match doit démarrer après l'acceptation, anti pré-jeu). _(2026-08-11)_
- [x] **Résolution active de dispute** : endpoint admin `POST /api/challenges/resolve` `{challengeId, resolution: creator|opponent|draw}` (gate `ADMIN_SECRET`, refuse en prod si non configuré) → paie un camp ou rembourse en nul, sur défi `disputed` uniquement, idempotent. Paiement/sauvegarde factorisés (`settleToWinner`/`saveChallenge` dans `_challenges.js`). Test 12/12. _(2026-08-11)_
- [x] **Vérif réseau sortie du lock** (G) : `settle` prend le lock → enregistre la soumission → **libère** → appelle les APIs de jeu → **re-prend** le lock pour finaliser (re-check statut terminal). Corrige aussi le **bug de retry** (après un échec de vérif, aucun joueur ne pouvait relancer). _(2026-08-11)_
- [x] **Durcissement** : `maintenance` (cron) et `resolve` (admin) refusent de tourner en prod sans secret (avant : `maintenance` était ouvert à tous si `CRON_SECRET` absent). _(2026-08-11)_
- [x] **Commission prélevée même en dispute** : un défi en statut `disputed` dénoué en nul (admin draw ou dispute qui expire) prélève quand même la commission (chaque camp = mise − sa moitié du fee) — identique au fee d'un règlement gagné. Timeout jamais disputé = remboursement intégral. Refunds désormais journalisés (tx type `refund`, champ `fee`). Test 10/10. _(2026-08-11)_
- [ ] Étendre l'auto-verify à **Valorant** (Riot val-match-v1, API différente) et **Supercell** (battlelog sans matchId → matcher par timestamp/adversaire).
- [ ] **Ownership du compte de jeu** : aujourd'hui on fait confiance au handle saisi. Prouver la propriété (lier handle ↔ compte Clutch de façon vérifiée) pour fermer la triche résiduelle.
- [ ] **Test live** des chemins réseau (Riot/Steam) — seuls les extracteurs purs + la logique de décision sont testés (13/13).

## Phase 3 — Paiements réels (on/off-ramp)

- [ ] Deposit réel : soit **on-chain** (vérifier la tx avant de créditer), soit **Stripe** — remplacer le mode démo.
- [ ] Off-ramp / retrait réel relié à la Phase 1.
- [ ] Définir clairement le statut de **CLU** (jetons internes vs stablecoin) et le taux.

## Phase 4 — Conformité & confiance

- [ ] Cadrage **légal** du wagering skill-based selon juridictions cibles (⚠️ à trancher tôt, ça conditionne tout).
- [ ] **KYC/AML**, vérification d'âge, **geo-blocage** des zones interdites.
- [ ] ToS, politique de jeu responsable, limites de dépôt (le cap journalier existe déjà côté deposit).

## Phase 5 — Qualité & scale

- [ ] Découper le monolithe `index.html` (modules JS/build).
- [ ] **Tests** (unitaires escrow/settle, e2e du flux défi) + **CI** GitHub Actions.
- [ ] Observabilité : logs structurés, alertes sur disputes / soldes négatifs.

---

## Prochaine action recommandée

**Phase 0 puis Phase 1** : sans KV confirmé + verrouillage optimiste + withdraw,
tout le reste repose sur des soldes non fiables. Le différenciateur produit
(settlement auto-vérifié, Phase 2) ne vaut que si l'argent en dessous est solide.
