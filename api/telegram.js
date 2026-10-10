/**
 * POST /api/telegram — webhook for the Clutch Telegram bot.
 *
 * The bot only ever answers a message someone sent it; it never writes first.
 * Nothing about the person is stored: the reply goes back in the webhook
 * response itself (Telegram's "reply in webhook" mode), so no chat id is kept.
 *
 *   /start            → what Clutch is, 500 free CLU, the Discord
 *   /start d_<id>     → the duel behind a shared invite, with an Accept button
 *   /stop, /privacy   → what the bot keeps (nothing) and how to block it
 *   anything else     → the /start answer
 *
 * Setup: set TELEGRAM_WEBHOOK_SECRET, then register the webhook once with
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://www.clutch.best/api/telegram&secret_token=<SECRET>&allowed_updates=["message"]
 * Telegram sends the secret back on every call; anything without it is refused.
 */
import crypto from 'crypto';
import { kvGet } from './_kv.js';

const SITE = 'https://www.clutch.best';
const DISCORD = 'https://discord.gg/abyzAXMKu';

const GAME_NAMES = {
  valorant: 'Valorant', lol: 'League of Legends', dota2: 'Dota 2', clashroyale: 'Clash Royale',
  brawlstars: 'Brawl Stars', cs2: 'Counter-Strike 2', fortnite: 'Fortnite', apex: 'Apex Legends',
  ow2: 'Overwatch 2', rl: 'Rocket League', fifa: 'EA FC', cod: 'Call of Duty',
};

const COPY = {
  en: {
    welcome: 'CLUTCH is 1v1 duels on the games you already play: Valorant, League, Clash Royale and more. Challenge a friend, play your match, and the result is checked through the game\'s own API where it can be.\n\nSign up in 30 seconds and 500 free CLU land in your account.',
    play: 'Claim my 500 free CLU',
    discord: 'Join the Discord',
    duel: (g, cond, entry) => `You've been challenged to a 1v1 on ${g}.\nCondition: ${cond}\nEntry: ${entry}\n\nNew players get 500 free CLU when they sign up.`,
    free: 'free',
    accept: 'Accept the duel',
    gone: 'That duel is no longer open (it was taken, cancelled or expired). You can start your own in a few seconds.',
    stop: 'This bot never messages you first and keeps nothing about you, so there is nothing to unsubscribe from. To block it anyway, open the bot\'s profile and tap Stop bot.',
  },
  fr: {
    welcome: 'CLUTCH, ce sont des duels 1v1 sur les jeux auxquels tu joues déjà : Valorant, League, Clash Royale et d\'autres. Tu défies un pote, vous jouez votre match, et le résultat est vérifié via l\'API du jeu quand c\'est possible.\n\nInscription en 30 secondes, et 500 CLU gratuits arrivent sur ton compte.',
    play: 'Récupérer mes 500 CLU',
    discord: 'Rejoindre le Discord',
    duel: (g, cond, entry) => `On te défie en 1v1 sur ${g}.\nCondition : ${cond}\nEntrée : ${entry}\n\nLes nouveaux joueurs reçoivent 500 CLU gratuits à l'inscription.`,
    free: 'gratuite',
    accept: 'Accepter le duel',
    gone: 'Ce duel n\'est plus ouvert (déjà pris, annulé ou expiré). Tu peux lancer le tien en quelques secondes.',
    stop: 'Ce bot ne t\'écrit jamais en premier et ne garde rien sur toi, donc il n\'y a rien à désactiver. Pour le bloquer quand même, ouvre le profil du bot et appuie sur Arrêter le bot.',
  },
};

function lang(from) {
  return from && typeof from.language_code === 'string' && from.language_code.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function buttons(rows) {
  return { inline_keyboard: rows.map(([text, url]) => [{ text, url }]) };
}

function welcome(t) {
  return {
    text: t.welcome,
    reply_markup: buttons([[t.play, `${SITE}/?ref=telegram-bot`], [t.discord, DISCORD]]),
  };
}

/** Builds the reply for an incoming message. Exported for tests. */
export async function replyFor(message) {
  const t = COPY[lang(message.from)];
  const text = String(message.text || '').trim();
  const [cmd, arg] = text.split(/\s+/);
  const command = (cmd || '').split('@')[0].toLowerCase();

  if (command === '/stop' || command === '/privacy') return { text: t.stop };

  if (command === '/start' && arg && /^d_CH_\d+_[0-9a-f]{8}$/.test(arg)) {
    const ch = await kvGet(`ch:${arg.slice(2)}`);
    if (!ch || ch.status !== 'open' || (ch.expiresAt && ch.expiresAt < Date.now())) {
      return { text: t.gone, reply_markup: buttons([[t.play, `${SITE}/?ref=telegram-bot`]]) };
    }
    // Same code the site's share modal puts in ?join= (see api/challenges/index.js).
    const code = Buffer.from(JSON.stringify({ id: ch.id, sig: ch.sig })).toString('base64url');
    const entry = ch.stake ? `${Number(ch.stake).toLocaleString('en-US')} CLU` : t.free;
    const cond = ch.condition || ch.mode || ch.modeLabel || '1v1';
    return {
      text: t.duel(GAME_NAMES[ch.game] || ch.game, cond, entry),
      reply_markup: buttons([[t.accept, `${SITE}/?join=${encodeURIComponent(code)}`]]),
    };
  }

  return welcome(t);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !safeEqual(req.headers['x-telegram-bot-api-secret-token'], secret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let update;
  try { update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { update = null; }
  const message = update && update.message;
  // Private chats only: the bot is not meant to talk in groups.
  if (!message || !message.chat || message.chat.type !== 'private' || typeof message.text !== 'string') {
    return res.status(200).json({ ok: true });
  }

  try {
    const reply = await replyFor(message);
    return res.status(200).json({ method: 'sendMessage', chat_id: message.chat.id, disable_web_page_preview: true, ...reply });
  } catch (e) {
    console.warn('[telegram] reply failed', e?.message);
    return res.status(200).json({ ok: true });
  }
}
