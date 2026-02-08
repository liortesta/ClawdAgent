import winston from 'winston';
import config from '../config.js';

const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'clawdagent' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 50_000_000, maxFiles: 3 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 50_000_000, maxFiles: 5 }),
  ],
});

if (config.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

export default logger;
