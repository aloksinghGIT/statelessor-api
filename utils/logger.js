const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.scriptDownloadLog = path.join(this.logsDir, 'script-downloads.csv');
    this.ensureLogsDir();
  }

  async ensureLogsDir() {
    try {
      await fs.access(this.logsDir);
    } catch {
      await fs.mkdir(this.logsDir, { recursive: true });
    }
  }

  async logSourceUpload(projectName, type, status, details = '') {
    const logFile = path.join(this.logsDir, `source-${projectName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
    
    try {
      await fs.access(logFile);
    } catch {
      await fs.writeFile(logFile, 'Timestamp,ProjectName,Type,Status,Details\n');
    }
    
    const logEntry = `${new Date().toISOString()},"${projectName}","${type}","${status}","${details.replace(/"/g, '""')}"\n`;
    await fs.appendFile(logFile, logEntry);
  }

  async logScriptDownload(scriptType, userAgent = '', ip = '') {
    try {
      await fs.access(this.scriptDownloadLog);
    } catch {
      await fs.writeFile(this.scriptDownloadLog, 'Timestamp,ScriptType,UserAgent,IP\n');
    }
    
    const logEntry = `${new Date().toISOString()},"${scriptType}","${userAgent.replace(/"/g, '""')}","${ip}"\n`;
    await fs.appendFile(this.scriptDownloadLog, logEntry);
  }

  async logError(category, error, context = {}) {
    const errorLog = path.join(this.logsDir, 'errors.csv');
    
    try {
      await fs.access(errorLog);
    } catch {
      await fs.writeFile(errorLog, 'Timestamp,Category,Error,Context\n');
    }
    
    const logEntry = `${new Date().toISOString()},"${category}","${error.toString().replace(/"/g, '""')}","${JSON.stringify(context).replace(/"/g, '""')}"\n`;
    await fs.appendFile(errorLog, logEntry);
  }

  // Development vs Production logging
  log(message, data = null) {
    if (process.env.NODE_ENV === 'production') {
      // In production, log to file
      this.logInfo('general', message, data);
    } else {
      // In development, use console
      console.log(message, data || '');
    }
  }

  error(message, error = null, context = {}) {
    if (process.env.NODE_ENV === 'production') {
      this.logError('general', new Error(message), { error: error?.message, ...context });
    } else {
      console.error(message, error || '');
    }
  }

  async logInfo(category, message, data = null) {
    const infoLog = path.join(this.logsDir, 'info.csv');
    
    try {
      await fs.access(infoLog);
    } catch {
      await fs.writeFile(infoLog, 'Timestamp,Category,Message,Data\n');
    }
    
    const dataStr = data ? JSON.stringify(data).replace(/"/g, '""') : '';
    const logEntry = `${new Date().toISOString()},"${category}","${message.replace(/"/g, '""')}","${dataStr}"\n`;
    await fs.appendFile(infoLog, logEntry);
  }
}

// Singleton instance
const logger = new Logger();

module.exports = { logger };