# Clutch — Roadmap

Plateforme de **défis skill-based peer-to-peer** (compétition e-sport, **pas** un
jeu de hasard) : deux joueurs se défient sur un vrai match (LoL/Valorant, Dota 2,
Clash Royale/Brawl Stars), engagent des jetons **CLU**, et le **plus performant**
remporte la cagnotte (frais plateforme 2,5 %). L'issue dépend de la maîtrise du
jeu — aucun RNG, aucun aléa ne décide du résultat.

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
| 9 | Aucun cadre **légal** de concours skill-based (âge, geo-blocage, KYC/AML off-ramp) | — | 🔴 (légal) |
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
- [x] **Commission prélevée sur tout défi accepté dénoué** : `refundDraw` prélève toujours la commission (chaque camp = mise − sa moitié du fee, identique au fee d'un règlement gagné) — que ce soit une **dispute** en nul **ou un no-show au timeout** (verrouiller puis abandonner ne doit pas être gratuit). Seule l'**annulation d'un défi jamais accepté** (`cancelOpen`, aucun adversaire) reste remboursée intégralement. Warnings serveur (`console.warn`) + champ `warning` dans la réponse API sur no-show et annulation. Refunds journalisés (tx `refund` + champ `fee`). Tests 10/10 + 19/19. _(2026-08-11)_
- [x] **Valorant auto-vérifié** (Riot **val-match-v1**) dans `_verify.js` : shard routing (na/eu/ap/kr/latam/br) + résolution puuid via account-v1 continental, `extractValorantResult` (win = `teams[player.teamId].won`). **Lancement trustless = LoL + Dota 2 + Valorant.** _(2026-08-11)_
- [ ] **Supercell** (Clash Royale) : battlelog sans matchId + whitelist IP → reste honor-system en V1.
- [ ] **Ownership du compte de jeu** : aujourd'hui on fait confiance au handle saisi. Prouver la propriété (lier handle ↔ compte Clutch de façon vérifiée) pour fermer la triche résiduelle.
- [ ] **Test live** des chemins réseau (Riot/Steam) — seuls les extracteurs purs + la logique de décision sont testés.

## Phase 3 — Paiements réels (on/off-ramp) — **hybride NOWPayments (crypto) + Stripe (fiat)**

Décision : CLU = **crédits internes** (registre `bal:<user>`), taux `CLU_USD_RATE`
(défaut 0,10 → 1 USD = 10 CLU). Deux rails managés vérifiés — **aucune clé de hot
wallet ni gas géré côté serveur** (on a abandonné l'auto-hébergé on-chain).

- [x] **Socle commun idempotent** `api/_payments.js` : conversion CLU↔USD,
  `creditDeposit` (exactement-une-fois via marqueur `pay:<provider>:<ref>` en
  `SET NX` permanent → les retries webhook / double-submit ne re-créditent jamais),
  `createPayoutRequest` (débit atomique + file `payouts:pending`). Primitive KV
  `kvSetNx` ajoutée. Test 15/15. _(2026-08-11)_
- [x] **Rail 1 — crypto : NOWPayments** (managé, zéro hot wallet). `nowpayments-create.js`
  (crée une invoice hébergée, aucun crédit ici) + `nowpayments-ipn.js` (seul endroit
  qui crédite, **après vérif de signature HMAC-SHA512** sur JSON trié contre
  `NOWPAYMENTS_IPN_SECRET`, crédite sur `finished`, idempotent par `payment_id`,
  raw-body). Test signature 13/13. _(2026-08-11)_
- [x] **Rail 2 — fiat : Stripe** : `stripe-checkout.js` + `stripe-webhook.js` (crédit
  uniquement sur webhook signé HMAC, idempotent par session id). Zéro SDK. Test 11/11. _(2026-08-11)_
- [x] **Withdraw** : `wallet/withdraw.js` → **demande de payout** (débit CLU atomique
  anti-overdraft + file `payouts:pending`, rail `crypto`|`stripe`, adresse+devise
  validées pour crypto). Deposit démo **désactivé en prod** (410). _(2026-08-11)_
- [x] **Off-ramp ops-fulfilled** `wallet/payouts-admin.js` (gate `ADMIN_SECRET`) :
  liste la file de retraits ; l'ops envoie via le dashboard NOWPayments/Stripe puis
  marque `sent` (avec ref tx) ou `failed` (**refund auto de la mise en CLU**, idempotent).
  Choix V1 assumé : **aucune clé/mot de passe provider sur le serveur** + revue
  anti-fraude/AML manuelle des retraits. Test 23/23. _(2026-08-11)_
- [x] **Réconciliation dépôts** `wallet/deposits-reconcile.js` (admin) : dépôts
  `status:'crediting'` bloqués → `credit`/`abandon` humain. _(2026-08-11)_
- [ ] **Auto-payout NOWPayments** (Mass Payout API) — nécessite auth JWT + 2FA :
  follow-up pour automatiser l'off-ramp crypto.
- [ ] **Tests live** : invoice + IPN NOWPayments réels, webhook Stripe réel, Lua vs vrai Upstash.

## Phase 4 — Conformité & confiance _(cadre concours skill-based, PAS gambling)_

Positionnement : **compétition de compétence** (skill-based contest / e-sport),
pas un jeu de hasard. L'argument central = **résultat déterminé par la performance
du joueur, sans élément matériel de hasard** (test « skill dominant »). La
conformité vise donc le régime des **concours à prix / compétitions**, pas la loi
des casinos — mais engager de l'argent réel sur du skill reste encadré selon les
juridictions, donc à cadrer explicitement.

- [ ] Cadrage **légal** en tant que **concours skill-based** selon juridictions cibles : documenter l'absence d'aléa, exclure les États/pays qui assimilent quand même skill-money-contest à du gambling (⚠️ à trancher tôt).
- [ ] **Preuve d'absence de hasard** : s'appuyer sur la vérification on-chain/API du résultat réel (déjà en place) comme garantie que c'est la performance, pas le hasard, qui décide.
- [ ] Vérification d'**âge**, **geo-blocage** des zones interdites, et **KYC/AML** proportionné aux seuils de retrait (obligation off-ramp, pas « pari »).
- [ ] ToS de **compétition**, intégrité anti-triche, limites de dépôt (le cap journalier existe déjà côté deposit).

## Phase 5 — Qualité & scale

- [ ] Découper le monolithe `index.html` (modules JS/build).
- [ ] **Tests** (unitaires escrow/settle, e2e du flux défi) + **CI** GitHub Actions.
- [ ] Observabilité : logs structurés, alertes sur disputes / soldes négatifs.

---

## Prochaine action recommandée

**Phase 0 puis Phase 1** : sans KV confirmé + verrouillage optimiste + withdraw,
tout le reste repose sur des soldes non fiables. Le différenciateur produit
(settlement auto-vérifié, Phase 2) ne vaut que si l'argent en dessous est solide.
