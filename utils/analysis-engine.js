const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

class AnalysisEngine {
  constructor() {
    this.remediationActionsPath = path.join(__dirname, '../rules/remediation-actions.json');
  }

  async detectProjectType(dir) {
    try {
      const files = await fs.readdir(dir);
      
      // Check for .NET
      if (files.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) {
        return 'dotnet';
      }
      
      // Check for Java
      if (files.some(f => f === 'pom.xml' || f === 'build.gradle')) {
        return 'java';
      }
      
      // Recursive check in subdirectories
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory() && !file.startsWith('.')) {
          const subType = await this.detectProjectType(fullPath);
          if (subType) return subType;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  calculateComplexityFactor(findings, projectType) {
    const totalFiles = new Set(findings.map(f => f.filename)).size;
    const totalIssues = findings.length;
    
    // Base complexity factors
    let complexityFactor = 1.0;
    
    // File count factor (more files = higher complexity)
    if (totalFiles > 100) complexityFactor += 0.5;
    else if (totalFiles > 50) complexityFactor += 0.3;
    else if (totalFiles > 20) complexityFactor += 0.1;
    
    // Issue density factor (issues per file)
    const issueDensity = totalIssues / Math.max(totalFiles, 1);
    if (issueDensity > 10) complexityFactor += 0.4;
    else if (issueDensity > 5) complexityFactor += 0.2;
    
    // High severity issue factor
    const highSeverityCount = findings.filter(f => f.severity === 'high').length;
    const highSeverityRatio = highSeverityCount / Math.max(totalIssues, 1);
    if (highSeverityRatio > 0.5) complexityFactor += 0.3;
    
    // Project type factor
    if (projectType === 'java') complexityFactor += 0.1; // Java typically more complex
    
    return Math.round(complexityFactor * 10) / 10; // Round to 1 decimal
  }

  async loadRemediationActions() {
    try {
      const content = await fs.readFile(this.remediationActionsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to load remediation actions', error);
      throw error;
    }
  }

  async generateActionReport(findings, projectName, complexityFactor) {
    const remediationData = await this.loadRemediationActions();
    const actionMap = new Map();
    const oneTimeActions = new Set();
    
    // Process each finding to build action requirements
    findings.forEach(finding => {
      // Map pattern to actions (simplified - using category for now)
      const patternId = this.getPatternIdByCategory(finding.category);
      const actions = remediationData.remediationActions[patternId];
      
      if (actions) {
        actions.actions.forEach(action => {
          const actionKey = action.id;
          
          if (!actionMap.has(actionKey)) {
            actionMap.set(actionKey, {
              id: action.id,
              description: action.description,
              category: action.actionCategory,
              impactType: action.impactType,
              impactSeverity: action.impactSeverity,
              baseWeight: action.weight,
              adjustedWeight: Math.round(action.weight * complexityFactor * 10) / 10,
              occurrences: 0,
              subActions: action.subActions || [],
              affectedFindings: []
            });
          }
          
          const actionData = actionMap.get(actionKey);
          if (action.impactType === 'One-time') {
            oneTimeActions.add(actionKey);
          } else {
            actionData.occurrences++;
          }
          actionData.affectedFindings.push({
            filename: finding.filename,
            function: finding.function,
            lineNum: finding.lineNum
          });
        });
      }
    });
    
    // Calculate final effort for each action
    const actionReport = Array.from(actionMap.values()).map(action => ({
      ...action,
      finalEffort: action.impactType === 'One-time' ? 
        action.adjustedWeight : 
        action.adjustedWeight * action.occurrences,
      totalOccurrences: action.impactType === 'One-time' ? 1 : action.occurrences
    }));
    
    // Save action report to temp folder
    const actionFilePath = path.join(__dirname, '../temp', `${projectName}-actions.json`);
    await fs.writeFile(actionFilePath, JSON.stringify({
      projectName,
      complexityFactor,
      scanDate: new Date().toISOString(),
      totalActions: actionReport.length,
      totalEffort: actionReport.reduce((sum, action) => sum + action.finalEffort, 0),
      actions: actionReport
    }, null, 2));
    
    return actionReport;
  }

  getPatternIdByCategory(category) {
    // Simplified mapping - in production, this should use actual pattern matching
    const categoryMap = {
      'Session State': '1',
      'Static Mutable Field': '7',
      'In-Process Cache': '9',
      'Application State': '3',
      'Thread-Local Storage': '25',
      'Database Connection State': '14',
      'Configuration State': '17'
    };
    return categoryMap[category] || '1';
  }

  generateSummaryAndDetails(findings, complexityFactor) {
    const summaryMap = new Map();
    
    findings.forEach((finding, index) => {
      const key = `${finding.category}-${finding.severity}-${finding.remediation}`;
      
      if (!summaryMap.has(key)) {
        // Calculate base effort for this category
        const patternId = this.getPatternIdByCategory(finding.category);
        const baseEffort = this.getBaseEffortForPattern(patternId);
        
        summaryMap.set(key, {
          id: summaryMap.size + 1,
          category: finding.category,
          severity: finding.severity,
          remediation: finding.remediation,
          occurrences: 0,
          baseEffort: baseEffort,
          effortScore: 0,
          detailIds: []
        });
      }
      
      const summary = summaryMap.get(key);
      summary.occurrences++;
      summary.detailIds.push(index + 1);
      
      // Calculate effort score with complexity factor
      summary.effortScore = Math.round(summary.baseEffort * complexityFactor * 10) / 10;
    });
    
    const summaryArray = Array.from(summaryMap.values());
    
    const detailedFindings = findings.map((finding, index) => ({
      id: index + 1,
      filename: finding.filename,
      function: finding.function,
      lineNum: finding.lineNum,
      code: finding.code,
      category: finding.category,
      severity: finding.severity,
      remediation: finding.remediation
    }));
    
    return {
      summary: summaryArray,
      detailed: detailedFindings,
      stats: {
        totalFiles: new Set(findings.map(f => f.filename)).size,
        totalIssues: findings.length,
        highSeverity: findings.filter(f => f.severity === 'high').length,
        mediumSeverity: findings.filter(f => f.severity === 'medium').length,
        lowSeverity: findings.filter(f => f.severity === 'low').length,
        complexityFactor: complexityFactor,
        totalEffortScore: summaryArray.reduce((sum, item) => sum + item.effortScore, 0)
      }
    };
  }

  getBaseEffortForPattern(patternId) {
    // Simplified base effort mapping
    const effortMap = {
      '1': 25, '2': 19, '7': 10, '9': 18, '19': 30, '23': 7, '25': 12, '28': 20
    };
    return effortMap[patternId] || 15;
  }

  async enrichFindings(data, complexityFactor) {
    const result = this.generateSummaryAndDetails(data.findings, complexityFactor);
    
    return {
      projectName: data.projectName || 'uploaded-json',
      projectType: data.projectType || 'unknown',
      scanDate: new Date().toISOString(),
      complexityFactor: complexityFactor,
      stats: result.stats,
      summary: result.summary,
      detailed: result.detailed
    };
  }
}

module.exports = { AnalysisEngine };