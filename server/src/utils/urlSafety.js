/**
 * Destination checks for shorten, edit, and redirect.
 *
 * Four signals:
 * - suspicious URL shape (tricks, obfuscation, risky file types)
 * - domain reputation (blocklist, abused TLDs, random-looking names)
 * - phishing indicators (brand lookalikes, login bait)
 * - known malicious destinations (local list, optional Safe Browsing)
 *
 * Extra blocked hosts: BLOCKED_DOMAINS=evil.test,phish.example
 * Live reputation: GOOGLE_SAFE_BROWSING_API_KEY
 */

const BLOCKED_DOMAINS = new Set([
  // Google Safe Browsing demo hosts — useful for verifying the block path
  'malware.testing.google.test',
  'testsafebrowsing.appspot.com',
  // Long-standing malware / phishing infrastructure called out in public feeds
  'coinhive.com',
  'coin-hive.com',
  'auth.login-secure.com',
  'secure-paypal-login.com',
  'paypal-account-limited.com',
  'appleid-verify.com',
  'icloud-account-locked.com',
  'microsoft-account-alert.com',
  'office365-login-secure.com',
  'amazon-security-update.com',
  'netflix-billing-update.com',
  'wellsfargo-secure-login.com',
  'chase-online-verify.com',
  'dhl-parcel-tracking.com',
  'fedex-delivery-update.com',
]);

const SUSPICIOUS_TLDS = new Set([
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'zip',
  'mov',
  'buzz',
  'rest',
  'country',
  'download',
  'click',
]);

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
  'tiny.cc',
  'rebrand.ly',
  'trib.al',
]);

const RISKY_EXTENSIONS = new Set([
  'exe',
  'scr',
  'bat',
  'cmd',
  'msi',
  'apk',
  'ps1',
  'vbs',
  'hta',
  'jar',
  'iso',
  'img',
  'lnk',
  'dll',
]);

const PHISHING_WORDS = [
  'login',
  'log-in',
  'signin',
  'sign-in',
  'verify',
  'verification',
  'account',
  'secure',
  'security',
  'update',
  'confirm',
  'password',
  'wallet',
  'billing',
  'suspended',
  'unlock',
  'invoice',
  'credential',
  'webscr',
];

/** Brand name → official registrable domains. Subdomains of these are trusted. */
const BRANDS = {
  paypal: ['paypal.com'],
  apple: ['apple.com', 'icloud.com'],
  microsoft: ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'office365.com'],
  google: ['google.com', 'gmail.com', 'youtube.com'],
  amazon: ['amazon.com'],
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  netflix: ['netflix.com'],
  linkedin: ['linkedin.com'],
  dropbox: ['dropbox.com'],
  whatsapp: ['whatsapp.com'],
  binance: ['binance.com'],
  coinbase: ['coinbase.com'],
  steam: ['steampowered.com', 'steamcommunity.com'],
  chase: ['chase.com'],
  wellsfargo: ['wellsfargo.com'],
  dhl: ['dhl.com'],
  fedex: ['fedex.com'],
  adobe: ['adobe.com'],
};

const CONFUSABLES = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  і: 'i',
  ї: 'i',
  ѕ: 's',
  һ: 'h',
  ν: 'v',
  ο: 'o',
  τ: 't',
  α: 'a',
};

const MULTI_TLDS = new Set(['co.uk', 'com.au', 'co.in', 'com.br', 'co.jp', 'com.mx', 'co.za']);

function extraBlockedDomains() {
  const raw = process.env.BLOCKED_DOMAINS || '';
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
}

function hostnameBlocked(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const lists = [...BLOCKED_DOMAINS, ...extraBlockedDomains()];
  return lists.find((domain) => host === domain || host.endsWith(`.${domain}`)) || null;
}

function registrableDomain(hostname) {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  const tail = parts.slice(-2).join('.');
  if (MULTI_TLDS.has(tail) && parts.length >= 3) return parts.slice(-3).join('.');
  return tail;
}

function isOfficialHost(hostname, domains) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function fold(value) {
  let out = '';
  for (const char of value.toLowerCase()) {
    out += CONFUSABLES[char] || char;
  }
  return out.replace(/[^a-z0-9]/g, '');
}

function hasConfusable(value) {
  return [...value].some((char) => {
    const mapped = CONFUSABLES[char];
    if (!mapped || char.charCodeAt(0) < 128) return false;
    return mapped !== char.toLowerCase();
  });
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, corner + cost);
      corner = next;
    }
  }
  return prev[b.length];
}

function shannon(value) {
  if (!value) return 0;
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function looksRandom(label) {
  if (label.length < 12) return false;
  const vowels = (label.match(/[aeiou]/g) || []).length;
  return shannon(label) >= 3.3 && vowels / label.length < 0.25;
}

function isIpHost(hostname) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(':');
}

function add(indicators, category, severity, message) {
  indicators.push({ category, severity, message });
}

function localInspect(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const indicators = [];
  let risk = 0;
  let block = false;

  const blocked = hostnameBlocked(hostname);
  if (blocked) {
    risk += 100;
    block = true;
    add(
      indicators,
      'malicious',
      'high',
      `Destination host matches a known malicious domain (${blocked})`
    );
  }

  if (url.username || url.password) {
    risk += 60;
    block = true;
    add(
      indicators,
      'phishing',
      'high',
      'URL hides the real host behind an @ sign (username trick)'
    );
  }

  if (isIpHost(hostname)) {
    risk += 35;
    add(indicators, 'suspicious', 'medium', 'Host is a raw IP address instead of a domain name');
    add(indicators, 'reputation', 'medium', 'IP destinations have no domain reputation to trust');
  }

  const tld = hostname.split('.').pop();
  if (SUSPICIOUS_TLDS.has(tld)) {
    risk += 25;
    add(indicators, 'reputation', 'medium', `.${tld} is commonly abused for short-lived malicious sites`);
  }

  if (hostname.startsWith('xn--') || hostname.includes('.xn--')) {
    risk += 30;
    add(indicators, 'suspicious', 'medium', 'Host uses punycode, which can disguise lookalike characters');
  }

  if (hasConfusable(hostname)) {
    risk += 40;
    add(indicators, 'phishing', 'high', 'Host mixes lookalike characters (homoglyphs) into the name');
  }

  const labels = hostname.split('.').filter(Boolean);
  if (labels.length > 4) {
    risk += 15;
    add(indicators, 'suspicious', 'low', 'Unusually deep subdomain chain');
  }

  const registrable = registrableDomain(hostname);
  const nameLabel = registrable.split('.')[0] || '';
  if (looksRandom(fold(nameLabel))) {
    risk += 20;
    add(indicators, 'reputation', 'medium', 'Domain name looks machine-generated');
  }

  if (SHORTENERS.has(registrable) || SHORTENERS.has(hostname)) {
    risk += 20;
    add(indicators, 'suspicious', 'medium', 'Destination is another short link (hides the real target)');
  }

  const pathExt = url.pathname.split('.').pop()?.toLowerCase();
  if (pathExt && RISKY_EXTENSIONS.has(pathExt)) {
    risk += 30;
    add(indicators, 'suspicious', 'medium', `Path offers a risky download (.${pathExt})`);
  }

  if ((rawUrl.match(/%25/gi) || []).length > 0) {
    risk += 15;
    add(indicators, 'suspicious', 'low', 'URL is double-encoded, which can hide the real path');
  }

  const encoded = (rawUrl.match(/%[0-9a-f]{2}/gi) || []).length;
  if (encoded >= 8) {
    risk += 12;
    add(indicators, 'suspicious', 'low', 'Heavy percent-encoding in the URL');
  }

  if (url.port && !['80', '443'].includes(url.port)) {
    risk += 10;
    add(indicators, 'suspicious', 'low', `Non-standard port :${url.port}`);
  }

  if (rawUrl.length > 300) {
    risk += 8;
    add(indicators, 'suspicious', 'low', 'Unusually long URL');
  }

  const officialHost = Object.values(BRANDS).some((domains) => isOfficialHost(hostname, domains));
  const haystack = `${hostname}${url.pathname}`.toLowerCase();
  const keywordHits = officialHost
    ? []
    : PHISHING_WORDS.filter((word) => haystack.includes(word));
  if (keywordHits.length) {
    risk += Math.min(36, keywordHits.length * 12);
    add(
      indicators,
      'phishing',
      keywordHits.length >= 2 ? 'medium' : 'low',
      `Phishing wording in the URL: ${keywordHits.slice(0, 4).join(', ')}`
    );
  }

  const sensitiveParams = ['password', 'passwd', 'pwd', 'ssn', 'cvv', 'otp'];
  const hitParam = sensitiveParams.find((name) => url.searchParams.has(name));
  if (hitParam) {
    risk += 15;
    add(indicators, 'phishing', 'medium', `Query string asks for a sensitive field (${hitParam})`);
  }

  const redirectParams = ['url', 'redirect', 'redirect_uri', 'next', 'dest', 'destination', 'return', 'goto', 'continue'];
  for (const name of redirectParams) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    try {
      const target = new URL(value, url);
      if (target.hostname && target.hostname !== hostname) {
        risk += 15;
        add(indicators, 'suspicious', 'medium', `Open-redirect parameter sends visitors to ${target.hostname}`);
        break;
      }
    } catch {
      // ignore unparsable param values
    }
  }

  if (!blocked && !officialHost) {
  for (const [brand, domains] of Object.entries(BRANDS)) {
    if (isOfficialHost(hostname, domains)) continue;
    const foldedHost = fold(hostname);
    const exactOrClose = labels.slice(0, -1).some((original) => {
      const label = fold(original);
      if (!label) return false;
      if (label === brand) return true;
      if (brand.length < 6) return false;
      if (levenshtein(label, brand) !== 1) return false;
      return /\d/.test(original) || hasConfusable(original);
    });
    const embedded = foldedHost.includes(brand) && brand.length >= 5;

    if (exactOrClose) {
      risk += 55;
      block = true;
      add(
        indicators,
        'phishing',
        'high',
        `Host imitates ${brand} but is not an official ${brand} domain`
      );
    } else if (embedded && keywordHits.length) {
      risk += 50;
      block = true;
      add(
        indicators,
        'phishing',
        'high',
        `Host uses the ${brand} name together with login or account wording`
      );
    } else if (embedded) {
      risk += 28;
      add(indicators, 'phishing', 'medium', `Host mentions ${brand} outside the official domain`);
    }
  }
  }

  if (isIpHost(hostname) && keywordHits.length) {
    block = true;
    add(indicators, 'phishing', 'high', 'Login-style page hosted on a raw IP address');
  }

  risk = Math.max(0, Math.min(100, risk));

  let reputation = 'unknown';
  if (blocked || risk >= 72) reputation = 'malicious';
  else if (risk >= 28) reputation = 'low';
  else if (risk < 12 && indicators.length === 0) reputation = 'clean';

  if (risk >= 72) block = true;

  const verdict = block ? 'block' : indicators.length ? 'warn' : 'allow';

  return {
    verdict,
    risk,
    reputation,
    domain: hostname,
    summary: summaryFor(verdict, reputation),
    indicators,
  };
}

function summaryFor(verdict, reputation) {
  if (verdict === 'block') {
    return reputation === 'malicious'
      ? 'Blocked. This destination looks malicious or is on the block list.'
      : 'Blocked. This destination matches high-confidence phishing signals.';
  }
  if (verdict === 'warn') {
    return 'Allowed with warnings. Review the indicators before you share this short link.';
  }
  if (reputation === 'clean') return 'No suspicious signals on this destination.';
  return 'No clear threats. Reputation is unknown because this domain is not on a list we trust.';
}

async function checkSafeBrowsing(rawUrl) {
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          client: { clientId: 'shortly', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: rawUrl }],
          },
        }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.matches?.[0]?.threatType || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectUrl(rawUrl) {
  const report = localInspect(rawUrl);
  if (!report) {
    return {
      verdict: 'block',
      risk: 100,
      reputation: 'unknown',
      domain: '',
      summary: 'URL could not be parsed.',
      indicators: [
        { category: 'suspicious', severity: 'high', message: 'Destination is not a valid URL' },
      ],
    };
  }

  const threat = await checkSafeBrowsing(rawUrl);
  if (threat) {
    report.risk = 100;
    report.verdict = 'block';
    report.reputation = 'malicious';
    report.indicators.unshift({
      category: 'malicious',
      severity: 'high',
      message: `Google Safe Browsing flags this URL as ${threat.replace(/_/g, ' ').toLowerCase()}`,
    });
    report.summary = summaryFor('block', 'malicious');
  }

  return report;
}

export function safetyError(report) {
  const malicious = report.indicators.some((item) => item.category === 'malicious');
  return malicious
    ? 'This URL is blocked because it matches a known malicious destination'
    : 'This URL is blocked because it matches phishing indicators';
}
