// lib/logger.js — Structured logging with pino (M4)
// Replaces ad-hoc console.log/error with leveled, parseable JSON logs.
//
// Usage:
//   const log = require('./lib/logger');
//   log.info({ userId: u.id }, 'login success');
//   log.warn('rate limit hit');
//   log.error({ err }, 'failed to write file');
//
// Production: ship to stdout (Vercel/Cloudflare collects automatically).
// Dev: pretty-printed (install pino-pretty separately if desired).

let pinoModule;
try {
    pinoModule = require('pino');
} catch (e) {
    // Fallback shim if pino not installed yet
    const fallback = (level) => (...args) => {
        const obj = typeof args[0] === 'object' ? args[0] : null;
        const msg = obj ? args.slice(1).join(' ') : args.join(' ');
        const ts = new Date().toISOString();
        const meta = obj ? ' ' + JSON.stringify(obj) : '';
        const fn = (level === 'error' || level === 'fatal') ? console.error : console.log;
        fn(`[${ts}] [${level}] ${msg}${meta}`);
    };
    module.exports = {
        trace: fallback('trace'),
        debug: fallback('debug'),
        info: fallback('info'),
        warn: fallback('warn'),
        error: fallback('error'),
        fatal: fallback('fatal'),
        child: () => module.exports
    };
    return;
}

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const baseConfig = {
    level,
    base: { pid: process.pid, hostname: undefined }, // strip noisy hostname
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    redact: {
        // Never log secrets/passwords/tokens
        paths: [
            'password', '*.password',
            'passwordHash', '*.passwordHash',
            'token', '*.token',
            'authorization', 'req.headers.authorization',
            'apiKey', '*.apiKey',
            'secret', '*.secret'
        ],
        censor: '[REDACTED]'
    }
};

const logger = pinoModule(baseConfig);

// Express middleware factory
function httpLogger() {
    return (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const dur = Date.now() - start;
            const meta = {
                method: req.method,
                path: req.path,
                status: res.statusCode,
                ms: dur,
                ip: req.ip
            };
            // Skip noise (static assets, healthcheck)
            if (/\.(?:css|js|svg|woff2?|ico|png|jpg|webp|map)$/.test(req.path)) return;
            if (req.path === '/api/health') return;
            if (res.statusCode >= 500) logger.error(meta, 'request failed');
            else if (res.statusCode >= 400) logger.warn(meta, 'request rejected');
            else logger.info(meta, 'request ok');
        });
        next();
    };
}

logger.httpLogger = httpLogger;
module.exports = logger;
