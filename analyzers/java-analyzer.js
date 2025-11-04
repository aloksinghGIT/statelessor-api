// analyzers/java-analyzer.js
// Pattern-based analyzer for Java stateful code
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

// Load patterns from rules file
let JAVA_PATTERNS = [];

async function loadPatterns() {
  if (JAVA_PATTERNS.length === 0) {
    const rulesPath = path.join(__dirname, '../rules/stateful-patterns.json');
    const rulesContent = await fs.readFile(rulesPath, 'utf-8');
    const rules = JSON.parse(rulesContent);
    JAVA_PATTERNS = rules.patterns
      .filter(p => p.language === 'java')
      .map(p => ({ ...p, regex: new RegExp(p.regex, 'g') }));
  }
}

async function analyzeJavaCode(projectPath) {
  const findings = [];
  
  try {
    // Load patterns from rules file
    await loadPatterns();
    
    // Find all Java files recursively
    const javaFiles = await findFiles(projectPath, '.java');
    
    logger.log(`Found ${javaFiles.length} Java files to analyze`);
    
    for (const file of javaFiles) {
      const relativeFile = path.relative(projectPath, file);
      const fileFindings = await analyzeFile(file, relativeFile);
      findings.push(...fileFindings);
    }
    
    logger.log(`Analysis complete. Found ${findings.length} issues`);
    return findings;
    
  } catch (error) {
    logger.error('Error analyzing Java code', error);
    throw error;
  }
}

async function findFiles(dir, extension) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip common directories
      if (entry.isDirectory()) {
        if (!['node_modules', 'target', 'build', '.git', '.idea', 'out'].includes(entry.name)) {
          const subFiles = await findFiles(fullPath, extension);
          files.push(...subFiles);
        }
      } else if (entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    logger.error(`Error reading directory ${dir}`, error);
  }
  
  return files;
}

async function analyzeFile(filePath, relativeFilePath) {
  const findings = [];
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Analyze each line
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      JAVA_PATTERNS.forEach(pattern => {
        const matches = line.match(pattern.regex);
        if (matches) {
          // Extract function/method name
          const functionName = extractFunctionName(lines, index);
          
          findings.push({
            filename: relativeFilePath,
            function: functionName,
            lineNum,
            code: line.trim(),
            category: pattern.category,
            severity: pattern.severity,
            remediation: pattern.remediation
          });
        }
      });
    });
    
  } catch (error) {
    logger.error(`Error analyzing file ${filePath}`, error);
  }
  
  return findings;
}

function extractFunctionName(lines, currentLine) {
  // Look backwards to find the enclosing method
  for (let i = currentLine; i >= 0 && i > currentLine - 50; i--) {
    const line = lines[i];
    
    // Match method declarations: public void methodName(...) or public String methodName(...)
    const methodMatch = line.match(/\b(?:public|private|protected)\s+(?:static\s+)?(?:synchronized\s+)?[\w<>,\[\]\s]+\s+(\w+)\s*\(/);
    if (methodMatch && !line.includes('class') && !line.includes('interface')) {
      return methodMatch[1];
    }
  }
  
  // If no method found, check if it's class-level
  for (let i = currentLine; i >= 0; i--) {
    const line = lines[i];
    const classMatch = line.match(/\b(?:public|)\s*class\s+(\w+)/);
    if (classMatch) {
      return `ClassLevel: ${classMatch[1]}`;
    }
  }
  
  return 'Unknown';
}

module.exports = { analyzeJavaCode };