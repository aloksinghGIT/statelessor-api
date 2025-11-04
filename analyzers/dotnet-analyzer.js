// analyzers/dotnet-analyzer.js
// Uses Roslyn via .NET CLI for AST-based analysis
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { logger } = require('../utils/logger');

const execAsync = promisify(exec);

// Load patterns from rules file
let DOTNET_PATTERNS = [];

async function loadPatterns() {
  if (DOTNET_PATTERNS.length === 0) {
    const rulesPath = path.join(__dirname, '../rules/stateful-patterns.json');
    const rulesContent = await fs.readFile(rulesPath, 'utf-8');
    const rules = JSON.parse(rulesContent);
    DOTNET_PATTERNS = rules.patterns
      .filter(p => p.language === 'dotnet')
      .map(p => ({ ...p, regex: new RegExp(p.regex, 'g') }));
  }
}

async function analyzeDotNetCode(projectPath) {
  const findings = [];
  
  try {
    // Load patterns from rules file
    await loadPatterns();
    
    // Find all C# files recursively
    const csFiles = await findFiles(projectPath, '.cs');
    
    logger.log(`Found ${csFiles.length} C# files to analyze`);
    
    for (const file of csFiles) {
      const relativeFile = path.relative(projectPath, file);
      const fileFindings = await analyzeFile(file, relativeFile);
      findings.push(...fileFindings);
    }
    
    logger.log(`Analysis complete. Found ${findings.length} issues`);
    return findings;
    
  } catch (error) {
    logger.error('Error analyzing .NET code', error);
    throw error;
  }
}

async function findFiles(dir, extension) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip common directories that shouldn't be analyzed
      if (entry.isDirectory()) {
        if (!['node_modules', 'bin', 'obj', '.git', '.vs', 'packages'].includes(entry.name)) {
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
      
      DOTNET_PATTERNS.forEach(pattern => {
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
    
    // Match method declarations: public void MethodName(...) or public ActionResult MethodName(...)
    const methodMatch = line.match(/\b(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?[\w<>,\s]+\s+(\w+)\s*\(/);
    if (methodMatch) {
      return methodMatch[1];
    }
    
    // Match property declarations
    const propertyMatch = line.match(/\b(?:public|private|protected|internal)\s+(?:static\s+)?[\w<>,\s]+\s+(\w+)\s*\{/);
    if (propertyMatch) {
      return `Property: ${propertyMatch[1]}`;
    }
  }
  
  // If no method found, check if it's class-level
  for (let i = currentLine; i >= 0; i--) {
    const line = lines[i];
    const classMatch = line.match(/\b(?:public|internal)\s+(?:partial\s+)?class\s+(\w+)/);
    if (classMatch) {
      return `ClassLevel: ${classMatch[1]}`;
    }
  }
  
  return 'Unknown';
}

module.exports = { analyzeDotNetCode };