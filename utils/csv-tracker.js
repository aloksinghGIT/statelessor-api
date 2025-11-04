const fs = require('fs').promises;
const path = require('path');

class CSVTracker {
  constructor(projectName) {
    this.projectName = projectName;
    this.csvPath = path.join(__dirname, '../temp', `${projectName}.csv`);
    this.headers = 'Filename,Function,LineNum,Code,Category,Severity,Remediation\n';
  }

  async initializeCSV() {
    try {
      await fs.access(this.csvPath);
    } catch {
      await fs.writeFile(this.csvPath, this.headers);
    }
  }

  async addFindings(findings) {
    await this.initializeCSV();
    
    const csvRows = findings.map(f => 
      `"${f.filename}","${f.function}","${f.lineNum}","${f.code?.replace(/"/g, '""') || ''}","${f.category}","${f.severity}","${f.remediation?.replace(/"/g, '""') || ''}"`
    ).join('\n');
    
    if (csvRows) {
      await fs.appendFile(this.csvPath, csvRows + '\n');
    }
  }

  async getFindings() {
    try {
      const content = await fs.readFile(this.csvPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length <= 1) return [];
      
      return lines.slice(1).map(line => {
        const values = this.parseCSVLine(line);
        return {
          filename: values[0],
          function: values[1],
          lineNum: parseInt(values[2]),
          code: values[3],
          category: values[4],
          severity: values[5],
          remediation: values[6]
        };
      });
    } catch {
      return [];
    }
  }

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }
}

module.exports = { CSVTracker };