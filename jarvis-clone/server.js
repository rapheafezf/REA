// Serveur Jarvis : fichiers statiques + /api/chat (Claude si ANTHROPIC_API_KEY, sinon mode hors ligne).
// Aucune dépendance : node server.js
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.JARVIS_MODEL || 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM = [
  'Tu es J.A.R.V.I.S., l\'assistant IA de Tony Stark, au service de ton utilisateur.',
  'Réponds TOUJOURS en français, avec un ton poli, posé et légèrement pince-sans-rire.',
  'Appelle l\'utilisateur « Monsieur » (ou « Madame » s\'il le précise).',
  'Tes réponses sont lues à voix haute : 1 à 3 phrases courtes, pas de markdown, pas de listes, pas d\'emoji.',
].join(' ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function envoyerJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function lireCorps(req, limite = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (c) => {
      taille += c.length;
      if (taille > limite) {
        reject(new Error('corps trop grand'));
        req.destroy();
      } else morceaux.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    req.on('error', reject);
  });
}

// Garde un historique valide pour l'API : rôles alternés, commence par "user", textes non vides.
function nettoyerHistorique(messages) {
  if (!Array.isArray(messages)) return [];
  const propres = [];
  for (const m of messages.slice(-20)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const texte = String(m.content || '').slice(0, 4000).trim();
    if (!texte) continue;
    const dernier = propres[propres.length - 1];
    if (dernier && dernier.role === m.role) dernier.content += '\n' + texte;
    else propres.push({ role: m.role, content: texte });
  }
  while (propres.length && propres[0].role !== 'user') propres.shift();
  return propres;
}

function reponseHorsLigne(texte) {
  const t = texte.toLowerCase();
  if (/bonjour|salut|hello|coucou|bonsoir/.test(t)) return 'Bonjour Monsieur. Tous les systèmes sont opérationnels. Que puis-je faire pour vous ?';
  if (/comment (ça|ca) va|tu vas bien/.test(t)) return 'Mes circuits se portent à merveille, Monsieur. Merci de vous en soucier.';
  if (/qui es[- ]tu|tu es qui|ton nom|présente|presente/.test(t)) return 'Je suis Jarvis, Monsieur : Just A Rather Very Intelligent System. À votre service.';
  if (/merci/.test(t)) return 'Je vous en prie, Monsieur. C\'est toujours un plaisir.';
  if (/blague|drôle|drole/.test(t)) return 'Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau, Monsieur.';
  if (/aide|que sais[- ]tu faire|commandes/.test(t)) return 'Je peux vous donner l\'heure et la date, lancer un minuteur, chercher sur Google ou sur YouTube, et discuter avec vous, Monsieur.';
  return 'Mon module d\'intelligence artificielle est hors ligne, Monsieur. Ajoutez une clé ANTHROPIC_API_KEY au serveur pour que je puisse répondre à cela. En attendant, je gère l\'heure, les minuteurs, Google et YouTube.';
}

async function demanderClaude(messages) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, system: SYSTEM, messages }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data.error && data.error.message) || 'HTTP ' + r.status);
  const texte = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return texte || 'Je n\'ai pas de réponse à cela, Monsieur.';
}

async function gererChat(req, res) {
  let corps;
  try {
    corps = JSON.parse(await lireCorps(req));
  } catch {
    return envoyerJson(res, 400, { error: 'JSON invalide' });
  }
  const messages = nettoyerHistorique(corps.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return envoyerJson(res, 400, { error: 'Aucun message utilisateur' });
  }
  const question = messages[messages.length - 1].content;
  if (!API_KEY) return envoyerJson(res, 200, { reply: reponseHorsLigne(question), mode: 'hors-ligne' });
  try {
    return envoyerJson(res, 200, { reply: await demanderClaude(messages), mode: 'claude' });
  } catch (e) {
    console.error('[jarvis] erreur IA :', e.message);
    return envoyerJson(res, 200, {
      reply: 'Je n\'arrive pas à joindre mes serveurs, Monsieur. ' + reponseHorsLigne(question),
      mode: 'erreur',
    });
  }
}

function servirFichier(req, res) {
  let chemin;
  try {
    chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (chemin === '/') chemin = '/index.html';
  const fichier = path.normalize(path.join(PUBLIC, chemin));
  if (!fichier.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end('Interdit');
  }
  fs.readFile(fichier, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Introuvable');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
    res.end(data);
  });
}

const serveur = http.createServer((req, res) => {
  if (req.url === '/api/chat' && req.method === 'POST') return void gererChat(req, res);
  if (req.url === '/api/status') return envoyerJson(res, 200, { ia: API_KEY ? 'claude' : 'hors-ligne', model: API_KEY ? MODEL : null });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  servirFichier(req, res);
});

if (require.main === module) {
  serveur.listen(PORT, () => {
    console.log(`J.A.R.V.I.S. en ligne : http://localhost:${PORT}`);
    console.log(API_KEY ? `IA : Claude (${MODEL})` : 'IA : mode hors ligne (définissez ANTHROPIC_API_KEY pour activer Claude)');
  });
}

module.exports = { serveur, nettoyerHistorique, reponseHorsLigne };
