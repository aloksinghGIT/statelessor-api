const fs = require('fs').promises;
const path = require('path');

class ScriptGenerator {
  constructor() {
    this.rulesPath = path.join(__dirname, '../rules/stateful-patterns.json');
  }

  async loadRules() {
    try {
      const content = await fs.readFile(this.rulesPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error('Failed to load rules: ' + error.message);
    }
  }

  generateBashScript(rules) {
    const dotnetPatterns = rules.patterns.filter(p => p.language === 'dotnet');
    const javaPatterns = rules.patterns.filter(p => p.language === 'java');
    
    return `#!/bin/bash
# Stateful Code Analyzer - Generated Script
# Auto-generated from rules on ${new Date().toISOString()}

set -e

SCRIPT_DIR="$(cd "$(dirname "\\${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/stateful-analysis.json"
TEMP_FINDINGS="$SCRIPT_DIR/.findings_temp.json"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m'

echo -e "\\${BLUE}╔═══════════════════════════════════════════════╗\\${NC}"
echo -e "\\${BLUE}║   Stateful Code Analyzer v2.0                ║\\${NC}"
echo -e "\\${BLUE}║   Generated with ${rules.patterns.length} rules                     ║\\${NC}"
echo -e "\\${BLUE}╚═══════════════════════════════════════════════╝\\${NC}"
echo ""

# Detect project type
PROJECT_TYPE="unknown"
if [ -f *.csproj ] || [ -f *.sln ] || find . -maxdepth 3 -name "*.csproj" | grep -q .; then
    PROJECT_TYPE="dotnet"
    echo -e "\\${GREEN}✓ Detected .NET project\\${NC}"
elif [ -f pom.xml ] || [ -f build.gradle ]; then
    PROJECT_TYPE="java"
    echo -e "\\${GREEN}✓ Detected Java project\\${NC}"
else
    echo -e "\\${RED}✗ Could not detect project type\\${NC}"
    exit 1
fi

# Initialize findings
echo "[]" > "$TEMP_FINDINGS"

# Function to add finding
add_finding() {
    local file="$1"
    local function="$2" 
    local line_num="$3"
    local code="$4"
    local category="$5"
    local severity="$6"
    local remediation="$7"
    
    code=$(echo "$code" | sed 's/"/\\\\"/g')
    remediation=$(echo "$remediation" | sed 's/"/\\\\"/g')
    
    local finding=$(cat <<EOF
{
  "filename": "$file",
  "function": "$function", 
  "lineNum": $line_num,
  "code": "$code",
  "category": "$category",
  "severity": "$severity",
  "remediation": "$remediation"
}
EOF
)
    
    local current=$(cat "$TEMP_FINDINGS")
    if [ "$current" = "[]" ]; then
        echo "[$finding]" > "$TEMP_FINDINGS"
    else
        echo "$current" | jq ". += [$finding]" > "$TEMP_FINDINGS.tmp"
        mv "$TEMP_FINDINGS.tmp" "$TEMP_FINDINGS"
    fi
}

# Extract function name
extract_function_name() {
    local file="$1"
    local line_num="$2"
    local start=$((line_num - 30))
    [ $start -lt 1 ] && start=1
    
    awk -v start="$start" -v end="$line_num" '
        NR >= start && NR <= end {
            if (match($0, /(public|private|protected|internal).*\\\\s+\\\\w+\\\\s*\\\\(/)) {
                if (match($0, /\\\\s+(\\\\w+)\\\\s*\\\\(/, arr)) {
                    print arr[1]
                    exit
                }
            }
        }
        END { if (NR < end) print "Unknown" }
    ' "$file" | tail -1
}

# .NET Analysis
analyze_dotnet() {
    echo -e "\\${YELLOW}Analyzing .NET code...\\${NC}"
    local total_files=0
    local issues_found=0
    
    while IFS= read -r -d '' file; do
        ((total_files++))
        relative_file="\\${file#$SCRIPT_DIR/}"
        
${dotnetPatterns.map(pattern => `        # ${pattern.category}
        while IFS= read -r line_info; do
            line_num=$(echo "$line_info" | cut -d: -f1)
            code=$(echo "$line_info" | cut -d: -f2-)
            function=$(extract_function_name "$file" "$line_num")
            add_finding "$relative_file" "$function" "$line_num" "$code" "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
            ((issues_found++))
        done < <(grep -nE '${pattern.regex}' "$file" 2>/dev/null || true)`).join('\\n        \\n')}
        
        echo -ne "\\\\rScanned: $total_files files, Found: $issues_found issues"
    done < <(find . -type f -name "*.cs" ! -path "*/bin/*" ! -path "*/obj/*" -print0)
    
    echo ""
    echo -e "\\${GREEN}✓ .NET analysis complete\\${NC}"
}

# Java Analysis  
analyze_java() {
    echo -e "\\${YELLOW}Analyzing Java code...\\${NC}"
    local total_files=0
    local issues_found=0
    
    while IFS= read -r -d '' file; do
        ((total_files++))
        relative_file="\\${file#$SCRIPT_DIR/}"
        
${javaPatterns.map(pattern => `        # ${pattern.category}
        while IFS= read -r line_info; do
            line_num=$(echo "$line_info" | cut -d: -f1)
            code=$(echo "$line_info" | cut -d: -f2-)
            function=$(extract_function_name "$file" "$line_num")
            add_finding "$relative_file" "$function" "$line_num" "$code" "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
            ((issues_found++))
        done < <(grep -nE '${pattern.regex}' "$file" 2>/dev/null || true)`).join('\\n        \\n')}
        
        echo -ne "\\\\rScanned: $total_files files, Found: $issues_found issues"
    done < <(find . -type f -name "*.java" ! -path "*/target/*" ! -path "*/build/*" -print0)
    
    echo ""
    echo -e "\\${GREEN}✓ Java analysis complete\\${NC}"
}

# Check for jq
if ! command -v jq &> /dev/null; then
    echo -e "\\${YELLOW}⚠ Installing jq...\\${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get install -y jq || sudo yum install -y jq
    fi
fi

# Run analysis
if [ "$PROJECT_TYPE" = "dotnet" ]; then
    analyze_dotnet
elif [ "$PROJECT_TYPE" = "java" ]; then
    analyze_java
fi

# Create output
cat > "$OUTPUT_FILE" <<EOF
{
  "projectType": "$PROJECT_TYPE",
  "scanDate": "$(date -Iseconds)",
  "rootPath": "$SCRIPT_DIR", 
  "findings": $(cat "$TEMP_FINDINGS")
}
EOF

# Cleanup
rm -f "$TEMP_FINDINGS" "$TEMP_FINDINGS.tmp"

# Summary
TOTAL_ISSUES=$(jq '.findings | length' "$OUTPUT_FILE")
echo ""
echo -e "\\${BLUE}╔═══════════════════════════════════════════════╗\\${NC}"
echo -e "\\${BLUE}║           Analysis Complete!                  ║\\${NC}"
echo -e "\\${BLUE}╚═══════════════════════════════════════════════╝\\${NC}"
echo -e "\\${GREEN}✓ Output: $OUTPUT_FILE\\${NC}"
echo -e "\\${GREEN}✓ Issues found: $TOTAL_ISSUES\\${NC}"
echo ""
`;
  }

  generatePowerShellScript(rules) {
    const dotnetPatterns = rules.patterns.filter(p => p.language === 'dotnet');
    const javaPatterns = rules.patterns.filter(p => p.language === 'java');
    
    return `# Stateful Code Analyzer - Generated Script
# Auto-generated from rules on ${new Date().toISOString()}

param([string]$OutputPath = $null)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputFile = if ($OutputPath) { $OutputPath } else { Join-Path $ScriptDir "stateful-analysis.json" }
$TempFindings = Join-Path $ScriptDir ".findings_temp.json"

Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║   Stateful Code Analyzer v2.0                ║" -ForegroundColor Blue  
Write-Host "║   Generated with ${rules.patterns.length} rules                     ║" -ForegroundColor Blue
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# Detect project type
$ProjectType = "unknown"
if ((Test-Path "*.csproj") -or (Test-Path "*.sln") -or (Get-ChildItem -Recurse -Filter "*.csproj" -Depth 3)) {
    $ProjectType = "dotnet"
    Write-Host "✓ Detected .NET project" -ForegroundColor Green
} elseif ((Test-Path "pom.xml") -or (Test-Path "build.gradle")) {
    $ProjectType = "java" 
    Write-Host "✓ Detected Java project" -ForegroundColor Green
} else {
    Write-Host "✗ Could not detect project type" -ForegroundColor Red
    exit 1
}

# Initialize findings
@() | ConvertTo-Json | Out-File -FilePath $TempFindings -Encoding UTF8

# Add finding function
function Add-Finding {
    param([string]$File, [string]$Function, [int]$LineNum, [string]$Code, [string]$Category, [string]$Severity, [string]$Remediation)
    
    $finding = @{
        filename = $File
        function = $Function
        lineNum = $LineNum
        code = $Code
        category = $Category
        severity = $Severity
        remediation = $Remediation
    }
    
    $current = Get-Content $TempFindings | ConvertFrom-Json
    $current += $finding
    $current | ConvertTo-Json -Depth 10 | Out-File -FilePath $TempFindings -Encoding UTF8
}

# Get function name
function Get-FunctionName {
    param([string]$FilePath, [int]$LineNum)
    
    $start = [Math]::Max(1, $LineNum - 30)
    $lines = Get-Content $FilePath
    
    for ($i = $LineNum - 1; $i -ge $start - 1; $i--) {
        if ($lines[$i] -match '(public|private|protected|internal).*\\\\s+(\\\\w+)\\\\s*\\\\(') {
            return $matches[2]
        }
    }
    return "Unknown"
}

# .NET Analysis
function Analyze-DotNet {
    Write-Host "Analyzing .NET code..." -ForegroundColor Yellow
    $totalFiles = 0
    $issuesFound = 0
    
    $csFiles = Get-ChildItem -Recurse -Filter "*.cs" | Where-Object { $_.FullName -notmatch '\\\\\\\\(bin|obj|packages|\\\\\\\\.vs)\\\\\\\\' }
    
    foreach ($file in $csFiles) {
        $totalFiles++
        $relativeFile = $file.FullName.Replace("$ScriptDir\\\\", "")
        $content = Get-Content $file.FullName
        
${dotnetPatterns.map(pattern => `        # ${pattern.category}
        for ($i = 0; $i -lt $content.Length; $i++) {
            if ($content[$i] -match '${pattern.regex.replace(/\\\\/g, '\\\\\\\\')}') {
                $function = Get-FunctionName $file.FullName ($i + 1)
                Add-Finding $relativeFile $function ($i + 1) $content[$i].Trim() "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
                $issuesFound++
            }
        }`).join('\\n        \\n')}
        
        Write-Progress -Activity "Scanning .NET files" -Status "Scanned: $totalFiles files, Found: $issuesFound issues" -PercentComplete (($totalFiles / $csFiles.Count) * 100)
    }
    
    Write-Host ""
    Write-Host "✓ .NET analysis complete" -ForegroundColor Green
}

# Java Analysis
function Analyze-Java {
    Write-Host "Analyzing Java code..." -ForegroundColor Yellow
    $totalFiles = 0
    $issuesFound = 0
    
    $javaFiles = Get-ChildItem -Recurse -Filter "*.java" | Where-Object { $_.FullName -notmatch '\\\\\\\\(target|build|\\\\\\\\.idea)\\\\\\\\' }
    
    foreach ($file in $javaFiles) {
        $totalFiles++
        $relativeFile = $file.FullName.Replace("$ScriptDir\\\\", "")
        $content = Get-Content $file.FullName
        
${javaPatterns.map(pattern => `        # ${pattern.category}
        for ($i = 0; $i -lt $content.Length; $i++) {
            if ($content[$i] -match '${pattern.regex.replace(/\\\\/g, '\\\\\\\\')}') {
                $function = Get-FunctionName $file.FullName ($i + 1)
                Add-Finding $relativeFile $function ($i + 1) $content[$i].Trim() "${pattern.category}" "${pattern.severity}" "${pattern.remediation}"
                $issuesFound++
            }
        }`).join('\\n        \\n')}
        
        Write-Progress -Activity "Scanning Java files" -Status "Scanned: $totalFiles files, Found: $issuesFound issues" -PercentComplete (($totalFiles / $javaFiles.Count) * 100)
    }
    
    Write-Host ""
    Write-Host "✓ Java analysis complete" -ForegroundColor Green
}

# Run analysis
if ($ProjectType -eq "dotnet") {
    Analyze-DotNet
} elseif ($ProjectType -eq "java") {
    Analyze-Java
}

# Create output
$findings = Get-Content $TempFindings | ConvertFrom-Json
$analysis = @{
    projectType = $ProjectType
    scanDate = (Get-Date -Format o)
    rootPath = $ScriptDir
    findings = $findings
}

$analysis | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputFile -Encoding UTF8

# Cleanup
Remove-Item $TempFindings -ErrorAction SilentlyContinue

# Summary
$totalIssues = $findings.Count
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║           Analysis Complete!                  ║" -ForegroundColor Blue
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host "✓ Output: $OutputFile" -ForegroundColor Green
Write-Host "✓ Issues found: $totalIssues" -ForegroundColor Green
Write-Host ""
`;
  }
}

module.exports = { ScriptGenerator };