# Statelessor MCP Server - Implementation Guide

## Overview
This document outlines the complete implementation plan for wrapping the Statelessor API as an MCP (Model Context Protocol) server, enabling Amazon Q integration for stateful code analysis.

## Quick Start

Follow these steps to build the MCP server from scratch:

```bash
# 1. Create project
mkdir statelessor-mcp && cd statelessor-mcp
npm init -y

# 2. Install dependencies
npm install @modelcontextprotocol/sdk axios archiver form-data uuid
npm install --save-dev jest eslint

# 3. Create directory structure
mkdir -p tools utils config data tests/tools tests/utils

# 4. Follow Phase 1-6 below to create all files

# 5. Test the server
npm test

# 6. Run the server
node mcp-server.js
```

## Project Structure (Final)

```
statelessor-mcp/
├── package.json
├── mcp-server.js              # Main MCP server
├── jest.config.js             # Jest configuration
├── README.md                  # User documentation
├── Dockerfile                 # Docker configuration
├── docker-compose.yml         # Docker Compose
├── .env.example               # Environment template
├── .npmignore                 # npm ignore file
├── tools/
│   ├── analyze-git.js         # Git analysis tool
│   ├── analyze-local.js       # Local analysis tool
│   ├── generate-script.js     # Script generation tool
│   ├── get-findings.js        # Historical findings tool
│   └── explain-remediation.js # Remediation tool
├── utils/
│   ├── api-client.js          # Statelessor API client
│   ├── project-zipper.js      # ZIP utility
│   └── result-formatter.js    # Result formatter
├── config/
│   └── default.json           # Default configuration
├── data/
│   └── remediation-actions.json  # Remediation data
└── tests/
    ├── tools/
    │   └── analyze-git.test.js
    └── utils/
        └── project-zipper.test.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Amazon Q Developer                      │
│                    (User's IDE/CLI)                          │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Protocol (stdio/SSE)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Statelessor MCP Server                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MCP Tools Layer                                      │  │
│  │  - analyze_git_repository                             │  │
│  │  - analyze_local_project                              │  │
│  │  - generate_analysis_script                           │  │
│  │  - get_project_findings                               │  │
│  │  - explain_remediation                                │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Business Logic Layer                                 │  │
│  │  - Project zipping                                    │  │
│  │  - Result formatting                                  │  │
│  │  - Error handling                                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Statelessor REST API (Existing)                 │
│  - /analyze (POST)                                           │
│  - /api/script/bash (GET)                                    │
│  - /api/script/powershell (GET)                              │
│  - /findings/:projectName (GET)                              │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
statelessor-mcp/
├── package.json
├── mcp-server.js              # Main MCP server entry point
├── tools/
│   ├── analyze-git.js         # Git repository analysis tool
│   ├── analyze-local.js       # Local project analysis tool
│   ├── generate-script.js     # Script generation tool
│   ├── get-findings.js        # Historical findings tool
│   └── explain-remediation.js # Remediation explanation tool
├── utils/
│   ├── api-client.js          # Statelessor API HTTP client
│   ├── project-zipper.js      # ZIP project directories
│   └── result-formatter.js    # Format results for Amazon Q
├── config/
│   └── default.json           # Configuration (API URL, etc.)
└── README.md                  # MCP server documentation
```

## Implementation Phases

### Phase 1: MCP Server Foundation (Day 1-2)

**Step 1.1: Initialize Project**

```bash
# Create project directory
mkdir statelessor-mcp
cd statelessor-mcp

# Initialize npm project
npm init -y

# Install dependencies
npm install @modelcontextprotocol/sdk axios archiver form-data
npm install --save-dev jest eslint
```

**Step 1.2: Create package.json**

```json
{
  "name": "statelessor-mcp",
  "version": "1.0.0",
  "description": "MCP server for Statelessor API integration with Amazon Q",
  "main": "mcp-server.js",
  "bin": {
    "statelessor-mcp": "./mcp-server.js"
  },
  "scripts": {
    "start": "node mcp-server.js",
    "test": "jest",
    "lint": "eslint ."
  },
  "keywords": ["mcp", "statelessor", "amazon-q", "code-analysis"],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0",
    "archiver": "^6.0.0",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

**Step 1.3: Create config/default.json**

```json
{
  "api": {
    "baseUrl": "http://localhost:3001",
    "timeout": 300000
  },
  "server": {
    "name": "statelessor",
    "version": "1.0.0"
  },
  "limits": {
    "maxProjectSizeMB": 100
  }
}
```

**Step 1.4: Create mcp-server.js (Basic Structure)**

```javascript
#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const config = require('./config/default.json');

// Import tools
const analyzeGitTool = require('./tools/analyze-git');
const analyzeLocalTool = require('./tools/analyze-local');
const generateScriptTool = require('./tools/generate-script');
const getFindingsTool = require('./tools/get-findings');
const explainRemediationTool = require('./tools/explain-remediation');

class StatelessorMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          analyzeGitTool.definition,
          analyzeLocalTool.definition,
          generateScriptTool.definition,
          getFindingsTool.definition,
          explainRemediationTool.definition,
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'analyze_git_repository':
          return await analyzeGitTool.execute(args);
        case 'analyze_local_project':
          return await analyzeLocalTool.execute(args);
        case 'generate_analysis_script':
          return await generateScriptTool.execute(args);
        case 'get_project_findings':
          return await getFindingsTool.execute(args);
        case 'explain_remediation':
          return await explainRemediationTool.execute(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Statelessor MCP server running on stdio');
  }
}

// Start server
const server = new StatelessorMCPServer();
server.start().catch(console.error);
```

### Phase 2: API Client Layer (Day 2-3)

**Step 2.1: Create utils/api-client.js**

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/default.json');

class StatelessorAPIClient {
  constructor() {
    this.baseURL = process.env.STATELESSOR_API_URL || config.api.baseUrl;
    this.timeout = config.api.timeout;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Statelessor-MCP/1.0.0',
      },
    });
  }

  generateRequestId() {
    return uuidv4();
  }

  /**
   * Analyze a Git repository
   * @param {string} gitUrl - Git repository URL
   * @param {string} sshKeyId - Optional SSH key ID
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeGitRepository(gitUrl, sshKeyId = null) {
    const requestId = this.generateRequestId();
    
    try {
      const response = await this.client.post('/analyze', {
        type: 'git',
        gitUrl,
        sshKeyId,
      }, {
        headers: {
          'X-Request-ID': requestId,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'analyzeGitRepository');
    }
  }

  /**
   * Analyze a local project (ZIP file)
   * @param {string} zipFilePath - Path to ZIP file
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeLocalProject(zipFilePath) {
    const requestId = this.generateRequestId();
    
    try {
      const formData = new FormData();
      formData.append('type', 'zip');
      formData.append('file', fs.createReadStream(zipFilePath));

      const response = await this.client.post('/analyze', formData, {
        headers: {
          'X-Request-ID': requestId,
          ...formData.getHeaders(),
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'analyzeLocalProject');
    }
  }

  /**
   * Generate analysis script
   * @param {string} scriptType - 'bash' or 'powershell'
   * @returns {Promise<string>} Script content
   */
  async generateScript(scriptType) {
    const requestId = this.generateRequestId();
    
    try {
      const endpoint = scriptType === 'bash' ? '/api/script/bash' : '/api/script/powershell';
      const response = await this.client.get(endpoint, {
        headers: {
          'X-Request-ID': requestId,
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'generateScript');
    }
  }

  /**
   * Get project findings
   * @param {string} projectName - Project name
   * @returns {Promise<Object>} Historical findings
   */
  async getProjectFindings(projectName) {
    const requestId = this.generateRequestId();
    
    try {
      const response = await this.client.get(`/findings/${projectName}`, {
        headers: {
          'X-Request-ID': requestId,
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'getProjectFindings');
    }
  }

  /**
   * Generate SSH key pair
   * @returns {Promise<Object>} SSH key pair
   */
  async generateSSHKey() {
    const requestId = this.generateRequestId();
    
    try {
      const response = await this.client.post('/api/ssh/generate', {}, {
        headers: {
          'X-Request-ID': requestId,
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'generateSSHKey');
    }
  }

  handleError(error, operation) {
    if (error.response) {
      // Server responded with error
      return new Error(
        `${operation} failed: ${error.response.data.error || error.response.statusText}`
      );
    } else if (error.request) {
      // No response received
      return new Error(`${operation} failed: No response from server`);
    } else {
      // Request setup error
      return new Error(`${operation} failed: ${error.message}`);
    }
  }
}

module.exports = new StatelessorAPIClient();
```

**Step 2.2: Install uuid package**

```bash
npm install uuid
```

### Phase 3: Core MCP Tools (Day 3-5)

**Step 3.1: Create tools/analyze-git.js**

```javascript
const apiClient = require('../utils/api-client');
const resultFormatter = require('../utils/result-formatter');

module.exports = {
  definition: {
    name: 'analyze_git_repository',
    description: 'Analyze a Git repository for stateful code patterns in .NET or Java projects',
    inputSchema: {
      type: 'object',
      properties: {
        gitUrl: {
          type: 'string',
          description: 'Git repository URL (HTTPS or SSH)',
        },
        sshKeyId: {
          type: 'string',
          description: 'SSH key ID for private repositories (optional)',
        },
      },
      required: ['gitUrl'],
    },
  },

  async execute(args) {
    try {
      const { gitUrl, sshKeyId } = args;

      // Validate Git URL
      if (!gitUrl || (!gitUrl.startsWith('https://') && !gitUrl.startsWith('git@'))) {
        throw new Error('Invalid Git URL. Must start with https:// or git@');
      }

      // Call Statelessor API
      const result = await apiClient.analyzeGitRepository(gitUrl, sshKeyId);

      // Format result for Amazon Q
      return {
        content: [
          {
            type: 'text',
            text: resultFormatter.formatAnalysisResult(result),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing Git repository: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
```

**Step 3.2: Create tools/analyze-local.js**

```javascript
const apiClient = require('../utils/api-client');
const projectZipper = require('../utils/project-zipper');
const resultFormatter = require('../utils/result-formatter');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
  definition: {
    name: 'analyze_local_project',
    description: 'Analyze a local project directory for stateful code patterns',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to project directory',
        },
      },
      required: ['projectPath'],
    },
  },

  async execute(args) {
    let zipFilePath = null;

    try {
      const { projectPath } = args;

      // Validate project path
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error('Project path must be a directory');
      }

      // ZIP the project
      zipFilePath = await projectZipper.zipProject(projectPath);

      // Call Statelessor API
      const result = await apiClient.analyzeLocalProject(zipFilePath);

      // Format result for Amazon Q
      return {
        content: [
          {
            type: 'text',
            text: resultFormatter.formatAnalysisResult(result),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing local project: ${error.message}`,
          },
        ],
        isError: true,
      };
    } finally {
      // Cleanup ZIP file
      if (zipFilePath) {
        try {
          await fs.unlink(zipFilePath);
        } catch (err) {
          console.error('Failed to cleanup ZIP file:', err);
        }
      }
    }
  },
};
```

**Step 3.3: Create tools/generate-script.js**

```javascript
const apiClient = require('../utils/api-client');

module.exports = {
  definition: {
    name: 'generate_analysis_script',
    description: 'Generate a bash or PowerShell script for offline analysis',
    inputSchema: {
      type: 'object',
      properties: {
        scriptType: {
          type: 'string',
          enum: ['bash', 'powershell'],
          description: 'Type of script to generate',
        },
      },
      required: ['scriptType'],
    },
  },

  async execute(args) {
    try {
      const { scriptType } = args;

      // Call Statelessor API
      const scriptContent = await apiClient.generateScript(scriptType);

      // Format instructions
      const instructions = scriptType === 'bash'
        ? `To use this script:
1. Save as analyze.sh
2. Make executable: chmod +x analyze.sh
3. Run: ./analyze.sh /path/to/project
4. Results will be saved as findings.json`
        : `To use this script:
1. Save as analyze.ps1
2. Run: .\\analyze.ps1 -ProjectPath "C:\\path\\to\\project"
3. Results will be saved as findings.json`;

      return {
        content: [
          {
            type: 'text',
            text: `# ${scriptType.toUpperCase()} Analysis Script\n\n${instructions}\n\n\`\`\`${scriptType}\n${scriptContent}\n\`\`\``,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error generating script: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
```

**Step 3.4: Create tools/get-findings.js**

```javascript
const apiClient = require('../utils/api-client');
const resultFormatter = require('../utils/result-formatter');

module.exports = {
  definition: {
    name: 'get_project_findings',
    description: 'Retrieve historical analysis findings for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: {
          type: 'string',
          description: 'Name of the project',
        },
      },
      required: ['projectName'],
    },
  },

  async execute(args) {
    try {
      const { projectName } = args;

      // Call Statelessor API
      const findings = await apiClient.getProjectFindings(projectName);

      if (!findings || findings.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No historical findings found for project: ${projectName}`,
            },
          ],
        };
      }

      // Format findings
      return {
        content: [
          {
            type: 'text',
            text: resultFormatter.formatHistoricalFindings(findings, projectName),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving findings: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
```

**Step 3.5: Create tools/explain-remediation.js**

```javascript
const path = require('path');
const fs = require('fs').promises;

module.exports = {
  definition: {
    name: 'explain_remediation',
    description: 'Get detailed remediation guidance for a specific stateful pattern',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Pattern category (e.g., "Session State", "Static Mutable Field")',
        },
      },
      required: ['category'],
    },
  },

  async execute(args) {
    try {
      const { category } = args;

      // Load remediation actions from JSON file
      const remediationPath = path.join(__dirname, '../data/remediation-actions.json');
      const remediationData = JSON.parse(await fs.readFile(remediationPath, 'utf-8'));

      // Find matching category
      const remediation = remediationData.actions.find(
        (action) => action.category.toLowerCase() === category.toLowerCase()
      );

      if (!remediation) {
        return {
          content: [
            {
              type: 'text',
              text: `No remediation guidance found for category: ${category}\n\nAvailable categories:\n${remediationData.actions.map(a => `- ${a.category}`).join('\n')}`,
            },
          ],
        };
      }

      // Format remediation guidance
      const guidance = `# Remediation: ${remediation.category}\n\n` +
        `**Effort**: ${remediation.effortWeight} points\n\n` +
        `## Actions Required:\n\n` +
        remediation.subActions.map((action, idx) => 
          `${idx + 1}. **${action.action}** (${action.effort} points)\n   ${action.description || ''}`
        ).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: guidance,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error explaining remediation: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
```

**Step 3.6: Copy remediation data**

```bash
# Create data directory
mkdir -p data

# Copy remediation actions from main API
cp ../statelessor-api/rules/remediation-actions.json data/
```

### Phase 4: Utility Functions (Day 5-6)

**Step 4.1: Create utils/project-zipper.js**

```javascript
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ProjectZipper {
  /**
   * ZIP a project directory
   * @param {string} projectPath - Path to project directory
   * @returns {Promise<string>} Path to created ZIP file
   */
  async zipProject(projectPath) {
    return new Promise((resolve, reject) => {
      // Create temp ZIP file
      const projectName = path.basename(projectPath);
      const zipFileName = `${projectName}-${Date.now()}.zip`;
      const zipFilePath = path.join(os.tmpdir(), zipFileName);

      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      output.on('close', () => {
        console.log(`ZIP created: ${archive.pointer()} bytes`);
        resolve(zipFilePath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add project directory to ZIP
      archive.directory(projectPath, false);

      // Finalize the archive
      archive.finalize();
    });
  }

  /**
   * Get project size in MB
   * @param {string} projectPath - Path to project directory
   * @returns {Promise<number>} Size in MB
   */
  async getProjectSize(projectPath) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(`du -sm "${projectPath}"`);
      const sizeMB = parseInt(stdout.split('\t')[0]);
      return sizeMB;
    } catch (error) {
      // Fallback: estimate size
      return 0;
    }
  }
}

module.exports = new ProjectZipper();
```

**Step 4.2: Create utils/result-formatter.js**

```javascript
class ResultFormatter {
  /**
   * Format analysis result for Amazon Q
   * @param {Object} result - Analysis result from API
   * @returns {string} Formatted text
   */
  formatAnalysisResult(result) {
    const { projectName, projectType, scanDate, complexityFactor, stats, summary, detailed, actions } = result;

    let output = `# Analysis Results: ${projectName}\n\n`;
    output += `**Project Type**: ${projectType}\n`;
    output += `**Scan Date**: ${new Date(scanDate).toLocaleString()}\n`;
    output += `**Complexity Factor**: ${complexityFactor}\n\n`;

    // Stats
    output += `## Statistics\n\n`;
    output += `- **Total Issues**: ${stats.totalIssues}\n`;
    output += `- **High Severity**: ${stats.highSeverity}\n`;
    output += `- **Medium Severity**: ${stats.mediumSeverity}\n`;
    output += `- **Low Severity**: ${stats.lowSeverity}\n\n`;

    // Summary findings
    if (summary && summary.length > 0) {
      output += `## Summary Findings\n\n`;
      summary.forEach((finding, idx) => {
        output += `### ${idx + 1}. ${finding.category}\n`;
        output += `- **Pattern**: ${finding.pattern}\n`;
        output += `- **Count**: ${finding.count}\n`;
        output += `- **Severity**: ${finding.severity}\n`;
        output += `- **Effort**: ${finding.effort} points\n\n`;
      });
    }

    // Recommended actions
    if (actions && actions.length > 0) {
      output += `## Recommended Actions\n\n`;
      actions.forEach((action, idx) => {
        output += `${idx + 1}. **${action.category}** (${action.effortWeight} points)\n`;
        if (action.subActions && action.subActions.length > 0) {
          action.subActions.forEach((sub) => {
            output += `   - ${sub.action} (${sub.effort} points)\n`;
          });
        }
        output += `\n`;
      });
    }

    return output;
  }

  /**
   * Format historical findings
   * @param {Array} findings - Array of historical findings
   * @param {string} projectName - Project name
   * @returns {string} Formatted text
   */
  formatHistoricalFindings(findings, projectName) {
    let output = `# Historical Findings: ${projectName}\n\n`;
    output += `**Total Scans**: ${findings.length}\n\n`;

    findings.forEach((finding, idx) => {
      output += `## Scan ${idx + 1}: ${new Date(finding.scanDate).toLocaleDateString()}\n`;
      output += `- **Total Issues**: ${finding.totalIssues}\n`;
      output += `- **Complexity**: ${finding.complexityFactor}\n`;
      output += `- **Effort Required**: ${finding.totalEffort} points\n\n`;
    });

    // Trend analysis
    if (findings.length > 1) {
      const first = findings[0];
      const last = findings[findings.length - 1];
      const change = last.totalIssues - first.totalIssues;
      const trend = change > 0 ? '📈 Increasing' : change < 0 ? '📉 Decreasing' : '➡️ Stable';

      output += `## Trend Analysis\n\n`;
      output += `${trend}: ${Math.abs(change)} issues ${change > 0 ? 'added' : 'resolved'}\n`;
    }

    return output;
  }

  /**
   * Format error message
   * @param {Error} error - Error object
   * @returns {string} Formatted error message
   */
  formatError(error) {
    return `❌ **Error**: ${error.message}\n\nPlease check your input and try again.`;
  }
}

module.exports = new ResultFormatter();
```

### Phase 5: Testing & Documentation (Day 6-7)

**Step 5.1: Create tests/tools/analyze-git.test.js**

```javascript
const analyzeGitTool = require('../../tools/analyze-git');
const apiClient = require('../../utils/api-client');

jest.mock('../../utils/api-client');

describe('analyze_git_repository tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should analyze public Git repository', async () => {
    const mockResult = {
      projectName: 'test-project',
      projectType: 'dotnet',
      stats: { totalIssues: 10 },
    };

    apiClient.analyzeGitRepository.mockResolvedValue(mockResult);

    const result = await analyzeGitTool.execute({
      gitUrl: 'https://github.com/test/repo',
    });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('test-project');
    expect(apiClient.analyzeGitRepository).toHaveBeenCalledWith(
      'https://github.com/test/repo',
      undefined
    );
  });

  test('should handle invalid Git URL', async () => {
    const result = await analyzeGitTool.execute({
      gitUrl: 'invalid-url',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid Git URL');
  });

  test('should handle API errors', async () => {
    apiClient.analyzeGitRepository.mockRejectedValue(
      new Error('API connection failed')
    );

    const result = await analyzeGitTool.execute({
      gitUrl: 'https://github.com/test/repo',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error analyzing');
  });
});
```

**Step 5.2: Create tests/utils/project-zipper.test.js**

```javascript
const projectZipper = require('../../utils/project-zipper');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('ProjectZipper', () => {
  test('should create ZIP file from directory', async () => {
    // Create temp test directory
    const testDir = path.join(os.tmpdir(), 'test-project');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'test.txt'), 'test content');

    const zipPath = await projectZipper.zipProject(testDir);

    // Verify ZIP file exists
    const stats = await fs.stat(zipPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);

    // Cleanup
    await fs.unlink(zipPath);
    await fs.rm(testDir, { recursive: true });
  });
});
```

**Step 5.3: Create README.md**

```markdown
# Statelessor MCP Server

MCP (Model Context Protocol) server for integrating Statelessor API with Amazon Q Developer.

## Features

- 🔍 Analyze Git repositories for stateful code patterns
- 📁 Analyze local project directories
- 📜 Generate offline analysis scripts (Bash/PowerShell)
- 📊 Retrieve historical findings
- 💡 Get detailed remediation guidance

## Installation

### Prerequisites

- Node.js 18+ 
- Access to Statelessor API

### Install from npm

```bash
npm install -g statelessor-mcp
```

### Install from source

```bash
git clone https://github.com/yourorg/statelessor-mcp.git
cd statelessor-mcp
npm install
npm link
```

## Configuration

### Amazon Q Configuration

Add to your Amazon Q settings file (`~/.aws/amazonq/mcp-config.json`):

```json
{
  "mcpServers": {
    "statelessor": {
      "command": "statelessor-mcp",
      "env": {
        "STATELESSOR_API_URL": "https://statelessor-api.port2aws.pro"
      }
    }
  }
}
```

### Environment Variables

- `STATELESSOR_API_URL`: Statelessor API base URL (default: http://localhost:3001)
- `STATELESSOR_API_TIMEOUT`: Request timeout in ms (default: 300000)

## Usage

### Analyze Git Repository

```
Amazon Q: Analyze https://github.com/myorg/myapp for stateful patterns
```

### Analyze Local Project

```
Amazon Q: Check my project at /Users/dev/myproject for stateful code
```

### Generate Analysis Script

```
Amazon Q: Generate a bash script to analyze my project offline
```

### View Historical Findings

```
Amazon Q: Show me previous analysis for my-project
```

### Get Remediation Help

```
Amazon Q: How do I fix Session State issues?
```

## Development

### Run Tests

```bash
npm test
```

### Run Linter

```bash
npm run lint
```

### Debug Mode

```bash
DEBUG=statelessor:* node mcp-server.js
```

## Troubleshooting

### Connection Issues

1. Verify Statelessor API is running
2. Check `STATELESSOR_API_URL` environment variable
3. Test API directly: `curl $STATELESSOR_API_URL/health`

### Permission Issues

- Ensure MCP server has read access to project directories
- Check file permissions on ZIP files

## License

MIT
```

**Step 5.4: Create jest.config.js**

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'tools/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
  ],
  testMatch: ['**/tests/**/*.test.js'],
};
```

**Step 5.5: Run tests**

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test
npm test -- tests/tools/analyze-git.test.js
```

**Step 5.6: Manual Testing (Before Deployment)**

### Option 1: Test with MCP Inspector (Recommended)

The MCP Inspector is a visual tool for testing MCP servers:

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Start your Statelessor API (in another terminal)
cd ../statelessor-api
node server.js

# Run MCP Inspector with your server
cd statelessor-mcp
mcp-inspector node mcp-server.js
```

This opens a web UI where you can:
- See all available tools
- Test each tool with custom inputs
- View request/response in real-time
- Debug errors visually

### Option 2: Test with Direct Node.js Script

Create `test-manual.js` for quick manual testing:

```javascript
#!/usr/bin/env node

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

async function testMCPServer() {
  console.log('Starting MCP server test...\n');

  // Start MCP server as child process
  const serverProcess = spawn('node', ['mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // Create client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-server.js'],
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // Test 1: List available tools
    console.log('Test 1: Listing available tools...');
    const toolsList = await client.request(
      { method: 'tools/list' },
      { timeout: 5000 }
    );
    console.log(`✅ Found ${toolsList.tools.length} tools:`);
    toolsList.tools.forEach((tool) => {
      console.log(`   - ${tool.name}`);
    });
    console.log();

    // Test 2: Generate bash script
    console.log('Test 2: Generating bash script...');
    const scriptResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'generate_analysis_script',
          arguments: { scriptType: 'bash' },
        },
      },
      { timeout: 10000 }
    );
    console.log('✅ Script generated successfully');
    console.log(`   Length: ${scriptResult.content[0].text.length} characters\n`);

    // Test 3: Explain remediation
    console.log('Test 3: Explaining Session State remediation...');
    const remediationResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'explain_remediation',
          arguments: { category: 'Session State' },
        },
      },
      { timeout: 10000 }
    );
    console.log('✅ Remediation guidance retrieved');
    console.log(`   ${remediationResult.content[0].text.substring(0, 100)}...\n`);

    // Test 4: Analyze Git repository (if API is running)
    console.log('Test 4: Testing Git analysis (requires API)...');
    try {
      const gitResult = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'analyze_git_repository',
            arguments: {
              gitUrl: 'https://github.com/test/sample-repo',
            },
          },
        },
        { timeout: 60000 }
      );
      console.log('✅ Git analysis completed');
    } catch (error) {
      console.log('⚠️  Git analysis failed (API may not be running)');
      console.log(`   Error: ${error.message}\n`);
    }

    console.log('\n✅ All manual tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    serverProcess.kill();
  }
}

testMCPServer().catch(console.error);
```

**Run manual test:**

```bash
# Make executable
chmod +x test-manual.js

# Run test
node test-manual.js
```

### Option 3: Test Individual Tools Directly

Create `test-tool.js` to test tools in isolation:

```javascript
#!/usr/bin/env node

const analyzeGitTool = require('./tools/analyze-git');
const generateScriptTool = require('./tools/generate-script');
const explainRemediationTool = require('./tools/explain-remediation');

async function testTools() {
  console.log('Testing MCP Tools Directly\n');

  // Test 1: Generate Script
  console.log('1. Testing generate_analysis_script...');
  try {
    const result = await generateScriptTool.execute({ scriptType: 'bash' });
    console.log('✅ Success');
    console.log(`   Script length: ${result.content[0].text.length}\n`);
  } catch (error) {
    console.log('❌ Failed:', error.message, '\n');
  }

  // Test 2: Explain Remediation
  console.log('2. Testing explain_remediation...');
  try {
    const result = await explainRemediationTool.execute({
      category: 'Session State',
    });
    console.log('✅ Success');
    console.log(`   Output preview: ${result.content[0].text.substring(0, 80)}...\n`);
  } catch (error) {
    console.log('❌ Failed:', error.message, '\n');
  }

  // Test 3: Analyze Git (requires API)
  console.log('3. Testing analyze_git_repository (requires API)...');
  try {
    const result = await analyzeGitTool.execute({
      gitUrl: 'https://github.com/test/sample',
    });
    console.log('✅ Success');
    console.log(`   Result: ${result.content[0].text.substring(0, 80)}...\n`);
  } catch (error) {
    console.log('⚠️  Expected if API not running:', error.message, '\n');
  }

  console.log('✅ Tool testing complete!');
}

testTools().catch(console.error);
```

**Run tool test:**

```bash
node test-tool.js
```

### Option 4: Test with curl (API Client Only)

Test the API client directly:

```javascript
// test-api-client.js
const apiClient = require('./utils/api-client');

async function testAPIClient() {
  console.log('Testing Statelessor API Client\n');

  // Test 1: Generate Script
  console.log('1. Testing generateScript...');
  try {
    const script = await apiClient.generateScript('bash');
    console.log('✅ Success - Script length:', script.length, '\n');
  } catch (error) {
    console.log('❌ Failed:', error.message, '\n');
  }

  // Test 2: Analyze Git
  console.log('2. Testing analyzeGitRepository...');
  try {
    const result = await apiClient.analyzeGitRepository(
      'https://github.com/test/sample'
    );
    console.log('✅ Success - Project:', result.projectName, '\n');
  } catch (error) {
    console.log('❌ Failed:', error.message, '\n');
  }

  console.log('✅ API client testing complete!');
}

testAPIClient().catch(console.error);
```

**Run API client test:**

```bash
# Start Statelessor API first
cd ../statelessor-api && node server.js &

# Test API client
cd statelessor-mcp
node test-api-client.js
```

### Option 5: Test with Amazon Q Locally

Configure Amazon Q to use your local MCP server:

**1. Create MCP config file:**

```bash
mkdir -p ~/.aws/amazonq
cat > ~/.aws/amazonq/mcp-config.json << EOF
{
  "mcpServers": {
    "statelessor-local": {
      "command": "node",
      "args": ["/absolute/path/to/statelessor-mcp/mcp-server.js"],
      "env": {
        "STATELESSOR_API_URL": "http://localhost:3001"
      }
    }
  }
}
EOF
```

**2. Start Statelessor API:**

```bash
cd ../statelessor-api
node server.js
```

**3. Restart Amazon Q in your IDE**

**4. Test in Amazon Q chat:**

```
You: Generate a bash script for analyzing .NET projects

You: Explain how to fix Session State issues

You: Analyze https://github.com/yourorg/test-repo
```

### Recommended Testing Workflow

```bash
# 1. Test API client first
node test-api-client.js

# 2. Test individual tools
node test-tool.js

# 3. Test full MCP server
node test-manual.js

# 4. Test with MCP Inspector (visual)
mcp-inspector node mcp-server.js

# 5. Test with Amazon Q (real usage)
# Configure and restart Amazon Q

# 6. Run automated tests
npm test
```

### Troubleshooting Manual Tests

**If tests fail:**

1. **Check API is running:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Check environment variables:**
   ```bash
   echo $STATELESSOR_API_URL
   ```

3. **Enable debug logging:**
   ```bash
   DEBUG=* node test-manual.js
   ```

4. **Check file permissions:**
   ```bash
   ls -la tools/ utils/
   ```

5. **Verify dependencies:**
   ```bash
   npm list
   ```e
npm test -- --coverage

# Run specific test
npm test -- tests/tools/analyze-git.test.js
```

### Phase 6: Deployment (Day 7-8)

**Step 6.1: Create Dockerfile**

```dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose stdio for MCP
CMD ["node", "mcp-server.js"]
```

**Step 6.2: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  statelessor-mcp:
    build: .
    image: statelessor-mcp:latest
    environment:
      - STATELESSOR_API_URL=${STATELESSOR_API_URL:-http://localhost:3001}
      - STATELESSOR_API_TIMEOUT=${STATELESSOR_API_TIMEOUT:-300000}
    volumes:
      - ./data:/app/data:ro
    restart: unless-stopped
```

**Step 6.3: Create .env.example**

```bash
# Statelessor API Configuration
STATELESSOR_API_URL=https://statelessor-api.port2aws.pro
STATELESSOR_API_TIMEOUT=300000

# MCP Server Configuration
MCP_SERVER_NAME=statelessor
MCP_SERVER_VERSION=1.0.0
MCP_LOG_LEVEL=info

# File Upload Limits
MAX_PROJECT_SIZE_MB=100
```

**Step 6.4: Create deployment script (deploy.sh)**

```bash
#!/bin/bash

set -e

echo "Building Statelessor MCP Server..."

# Build Docker image
docker build -t statelessor-mcp:latest .

# Tag for registry
docker tag statelessor-mcp:latest your-registry/statelessor-mcp:latest

# Push to registry
echo "Pushing to registry..."
docker push your-registry/statelessor-mcp:latest

echo "Deployment complete!"
```

**Step 6.5: Create npm publish script**

```bash
# Update version
npm version patch

# Build (if needed)
npm run build

# Publish to npm
npm publish --access public

echo "Published to npm!"
```

**Step 6.6: Create .npmignore**

```
tests/
coverage/
.env
.env.*
*.log
node_modules/
.DS_Store
.vscode/
.idea/
```

**Step 6.7: Update package.json for publishing**

```json
{
  "name": "statelessor-mcp",
  "version": "1.0.0",
  "description": "MCP server for Statelessor API integration with Amazon Q",
  "main": "mcp-server.js",
  "bin": {
    "statelessor-mcp": "./mcp-server.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourorg/statelessor-mcp.git"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "statelessor",
    "amazon-q",
    "code-analysis",
    "stateful-patterns"
  ],
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/yourorg/statelessor-mcp/issues"
  },
  "homepage": "https://github.com/yourorg/statelessor-mcp#readme"
}
```

## MCP Tools Specification

### Tool 1: analyze_git_repository

```json
{
  "name": "analyze_git_repository",
  "description": "Analyze a Git repository for stateful code patterns in .NET or Java projects",
  "inputSchema": {
    "type": "object",
    "properties": {
      "gitUrl": {
        "type": "string",
        "description": "Git repository URL (HTTPS or SSH)"
      },
      "sshKeyId": {
        "type": "string",
        "description": "SSH key ID for private repositories (optional)"
      }
    },
    "required": ["gitUrl"]
  }
}
```

**Response Format:**
```json
{
  "projectName": "my-project",
  "projectType": "dotnet",
  "scanDate": "2025-01-08T10:00:00Z",
  "complexityFactor": 1.3,
  "stats": {
    "totalIssues": 15,
    "highSeverity": 8,
    "mediumSeverity": 5,
    "lowSeverity": 2
  },
  "summary": [...],
  "detailed": [...],
  "actions": [...]
}
```

### Tool 2: analyze_local_project

```json
{
  "name": "analyze_local_project",
  "description": "Analyze a local project directory for stateful code patterns",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectPath": {
        "type": "string",
        "description": "Absolute path to project directory"
      }
    },
    "required": ["projectPath"]
  }
}
```

### Tool 3: generate_analysis_script

```json
{
  "name": "generate_analysis_script",
  "description": "Generate a bash or PowerShell script for offline analysis",
  "inputSchema": {
    "type": "object",
    "properties": {
      "scriptType": {
        "type": "string",
        "enum": ["bash", "powershell"],
        "description": "Type of script to generate"
      }
    },
    "required": ["scriptType"]
  }
}
```

**Response Format:**
```json
{
  "scriptType": "bash",
  "scriptContent": "#!/bin/bash\n...",
  "instructions": "1. Save as analyze.sh\n2. chmod +x analyze.sh\n3. ./analyze.sh /path/to/project"
}
```

### Tool 4: get_project_findings

```json
{
  "name": "get_project_findings",
  "description": "Retrieve historical analysis findings for a project",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectName": {
        "type": "string",
        "description": "Name of the project"
      }
    },
    "required": ["projectName"]
  }
}
```

### Tool 5: explain_remediation

```json
{
  "name": "explain_remediation",
  "description": "Get detailed remediation guidance for a specific stateful pattern",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Pattern category (e.g., 'Session State', 'Static Mutable Field')"
      }
    },
    "required": ["category"]
  }
}
```

## Configuration

### Environment Variables

```bash
# Statelessor API Configuration
STATELESSOR_API_URL=http://localhost:3001
STATELESSOR_API_TIMEOUT=300000

# MCP Server Configuration
MCP_SERVER_NAME=statelessor
MCP_SERVER_VERSION=1.0.0
MCP_LOG_LEVEL=info

# File Upload Limits
MAX_PROJECT_SIZE_MB=100
```

### Amazon Q Configuration

Users configure the MCP server in their Amazon Q settings:

**For Local Development:**
```json
{
  "mcpServers": {
    "statelessor": {
      "command": "node",
      "args": ["/path/to/statelessor-mcp/mcp-server.js"],
      "env": {
        "STATELESSOR_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

**For Production:**
```json
{
  "mcpServers": {
    "statelessor": {
      "command": "node",
      "args": ["/usr/local/bin/statelessor-mcp"],
      "env": {
        "STATELESSOR_API_URL": "https://statelessor-api.company.com"
      }
    }
  }
}
```

## User Workflows

### Workflow 1: Analyze Git Repository

**User:** "Analyze the stateful patterns in https://github.com/myorg/myapp"

**Amazon Q Flow:**
1. Calls `analyze_git_repository` tool with gitUrl
2. MCP server calls Statelessor API `/analyze`
3. Returns formatted results to Amazon Q
4. Amazon Q presents findings and suggests next steps

### Workflow 2: Analyze Local Project

**User:** "Check my project at /Users/dev/myproject for stateful code"

**Amazon Q Flow:**
1. Calls `analyze_local_project` tool with projectPath
2. MCP server zips the project
3. Calls Statelessor API `/analyze` with ZIP
4. Returns analysis results
5. Amazon Q explains findings and remediation

### Workflow 3: Generate Analysis Script

**User:** "Generate a bash script to analyze my project offline"

**Amazon Q Flow:**
1. Calls `generate_analysis_script` tool with scriptType=bash
2. MCP server calls `/api/script/bash`
3. Returns script content and instructions
4. Amazon Q provides script and usage guide

### Workflow 4: Review Historical Findings

**User:** "Show me the previous analysis for my-project"

**Amazon Q Flow:**
1. Calls `get_project_findings` tool with projectName
2. MCP server calls `/findings/my-project`
3. Returns historical data
4. Amazon Q summarizes trends and changes

### Workflow 5: Understand Remediation

**User:** "How do I fix Session State issues?"

**Amazon Q Flow:**
1. Calls `explain_remediation` tool with category="Session State"
2. MCP server loads remediation guidance
3. Returns detailed steps and code examples
4. Amazon Q provides contextual explanation

## Dependencies

### MCP Server Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0",
    "archiver": "^6.0.0",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

## Security Considerations

1. **File System Access**: MCP server needs read access to user's project directories
2. **API Authentication**: Consider adding API key authentication between MCP and Statelessor API
3. **Data Privacy**: Ensure project code is not logged or persisted unnecessarily
4. **SSH Keys**: Handle private repository SSH keys securely
5. **Rate Limiting**: Implement rate limiting to prevent abuse

## Success Metrics

- [ ] MCP server successfully connects to Amazon Q
- [ ] All 5 tools function correctly
- [ ] Analysis results match direct API calls
- [ ] Response time < 30 seconds for typical projects
- [ ] Error handling covers all edge cases
- [ ] Documentation is clear and complete
- [ ] Users can configure and use without support

## Timeline

- **Week 1**: Phases 1-3 (Foundation + Core Tools)
- **Week 2**: Phases 4-6 (Utilities + Testing + Deployment)
- **Total**: 2 weeks for complete implementation

## Next Steps

1. Review and approve this implementation plan
2. Set up new `statelessor-mcp` repository
3. Begin Phase 1 implementation
4. Schedule daily check-ins for progress review
5. Plan user acceptance testing with Amazon Q

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-08  
**Owner**: Development Team
