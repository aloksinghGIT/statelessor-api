const fs = require('fs').promises;
const path = require('path');

class ScriptGenerator {
  constructor() {
    this.rulesPath = path.join(__dirname, '../rules/stateful-patterns.json');
    this.templatesPath = path.join(__dirname, '../templates');
  }

  async loadRules() {
    try {
      const content = await fs.readFile(this.rulesPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error('Failed to load rules: ' + error.message);
    }
  }

  convertToGrepRegex(jsRegex) {
    // Convert JavaScript regex to grep-compatible ERE (Extended Regular Expression)
    let grepRegex = jsRegex;
    
    // Replace \s with [[:space:]]
    grepRegex = grepRegex.replace(/\\s/g, '[[:space:]]');
    
    // Remove negative lookahead (?!.*pattern) - grep doesn't support it
    // For patterns like "public\s+static(?!.*readonly).*=", we'll use grep -v to exclude
    grepRegex = grepRegex.replace(/\(\?!.*?\)/g, '');
    
    return grepRegex;
  }

  needsNegativeFilter(jsRegex) {
    // Check if pattern has negative lookahead that needs filtering
    const match = jsRegex.match(/\(\?!\.\.\*([^)]+)\)/);
    return match ? match[1] : null;
  }

  async generateBashScript(rules, requestId) {
    const template = await fs.readFile(path.join(this.templatesPath, 'analyzer.sh'), 'utf8');
    const dotnetPatterns = rules.patterns.filter(p => p.language === 'dotnet');
    const javaPatterns = rules.patterns.filter(p => p.language === 'java');
    
    const dotnetCode = dotnetPatterns.map(pattern => {
      const grepRegex = this.convertToGrepRegex(pattern.regex);
      const negativeFilter = this.needsNegativeFilter(pattern.regex);
      
      if (negativeFilter) {
        return `        # ${pattern.category}
        while IFS= read -r line_info; do
            line_num=$(echo "$line_info" | cut -d: -f1)
            code=$(echo "$line_info" | cut -d: -f2-)
            # Check negative condition
            if ! echo "$code" | grep -q "${negativeFilter}"; then
                function=$(extract_function_name "$file" "$line_num")
                add_finding "$relative_file" "$function" "$line_num" "$code" "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
                ((issues_found++))
            fi
        done < <(grep -nE '${grepRegex}' "$file" 2>/dev/null || true)`;
      } else {
        return `        # ${pattern.category}
        while IFS= read -r line_info; do
            line_num=$(echo "$line_info" | cut -d: -f1)
            code=$(echo "$line_info" | cut -d: -f2-)
            function=$(extract_function_name "$file" "$line_num")
            add_finding "$relative_file" "$function" "$line_num" "$code" "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
            ((issues_found++))
        done < <(grep -nE '${grepRegex}' "$file" 2>/dev/null || true)`;
      }
    }).join('\n        \n');
    
    const javaCode = javaPatterns.map(pattern => {
      const grepRegex = this.convertToGrepRegex(pattern.regex);
      const negativeFilter = this.needsNegativeFilter(pattern.regex);
      
      if (negativeFilter) {
        return `        # ${pattern.category}
        while IFS= read -r line_info; do
            line_num=$(echo "$line_info" | cut -d: -f1)
            code=$(echo "$line_info" | cut -d: -f2-)
            # Check negative condition
            if ! echo "$code" | grep -q "${negativeFilter}"; then
                function=$(extract_function_name "$file" "$line_num")
                add_finding "$relative_file" "$function" "$line_num" "$code" "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
                ((issues_found++))
            fi
        done < <(grep -nE '${grepRegex}' "$file" 2>/dev/null || true)`;
      } else {
        return `        # ${pattern.category}
        while IFS= read -r line_info; do
            line_num=$(echo "$line_info" | cut -d: -f1)
            code=$(echo "$line_info" | cut -d: -f2-)
            function=$(extract_function_name "$file" "$line_num")
            add_finding "$relative_file" "$function" "$line_num" "$code" "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
            ((issues_found++))
        done < <(grep -nE '${grepRegex}' "$file" 2>/dev/null || true)`;
      }
    }).join('\n        \n');
    
    const script = template
      .replace('{{GENERATION_DATE}}', new Date().toISOString())
      .replace('{{RULES_COUNT}}', rules.patterns.length)
      .replace('{{DOTNET_PATTERNS}}', dotnetCode)
      .replace('{{JAVA_PATTERNS}}', javaCode);
    
    // Save to temp folder
    const tempDir = path.join(__dirname, '../temp', requestId);
    await fs.mkdir(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, 'analyzer.sh');
    await fs.writeFile(scriptPath, script);
    
    return script;
  }

  async generatePowerShellScript(rules, requestId) {
    const template = await fs.readFile(path.join(this.templatesPath, 'analyzer.ps1'), 'utf8');
    const dotnetPatterns = rules.patterns.filter(p => p.language === 'dotnet');
    const javaPatterns = rules.patterns.filter(p => p.language === 'java');
    
    const dotnetCode = dotnetPatterns.map(pattern => {
      // PowerShell uses .NET regex which supports the same syntax as JavaScript
      // Just need to escape single quotes for PowerShell string
      const psRegex = pattern.regex.replace(/'/g, "''");
      return `        # ${pattern.category}
        for ($i = 0; $i -lt $content.Length; $i++) {
            if ($content[$i] -match '${psRegex}') {
                $function = Get-FunctionName $file.FullName ($i + 1)
                Add-Finding $relativeFile $function ($i + 1) $content[$i].Trim() "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
                $issuesFound++
            }
        }`;
    }).join('\n        \n');
    
    const javaCode = javaPatterns.map(pattern => {
      // PowerShell uses .NET regex which supports the same syntax as JavaScript
      // Just need to escape single quotes for PowerShell string
      const psRegex = pattern.regex.replace(/'/g, "''");
      return `        # ${pattern.category}
        for ($i = 0; $i -lt $content.Length; $i++) {
            if ($content[$i] -match '${psRegex}') {
                $function = Get-FunctionName $file.FullName ($i + 1)
                Add-Finding $relativeFile $function ($i + 1) $content[$i].Trim() "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
                $issuesFound++
            }
        }`;
    }).join('\n        \n');
    
    const script = template
      .replace('{{GENERATION_DATE}}', new Date().toISOString())
      .replace('{{RULES_COUNT}}', rules.patterns.length)
      .replace('{{DOTNET_PATTERNS}}', dotnetCode)
      .replace('{{JAVA_PATTERNS}}', javaCode);
    
    // Save to temp folder
    const tempDir = path.join(__dirname, '../temp', requestId);
    await fs.mkdir(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, 'analyzer.ps1');
    await fs.writeFile(scriptPath, script);
    
    return script;
  }
}

module.exports = { ScriptGenerator };