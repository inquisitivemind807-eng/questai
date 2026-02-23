/**
 * Logger utility for Indeed Auto-Apply Bot
 */

import { Logger } from './types';
import * as fs from 'fs';

export class IndeedLogger implements Logger {
  private logFile: string;

  constructor(logFile: string = 'indeed_apply.log') {
    this.logFile = logFile;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${level}: ${message}`;
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message: string): void {
    const formattedMessage = this.formatMessage('INFO', message);
    console.log(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  warning(message: string): void {
    const formattedMessage = this.formatMessage('WARNING', message);
    console.warn(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  error(message: string): void {
    const formattedMessage = this.formatMessage('ERROR', message);
    console.error(formattedMessage);
    this.writeToFile(formattedMessage);
  }
}
