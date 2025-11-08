# Statelessor MCP Server - Implementation Guide

## Overview
This document outlines the complete implementation plan for wrapping the Statelessor API as an MCP (Model Context Protocol) server, enabling Amazon Q integration for stateful code analysis.

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

**Deliverables:**
- [ ] Initialize new Node.js project `statelessor-mcp`
- [ ] Install MCP SDK: `@modelcontextprotocol/sdk`
- [ ] Create basic MCP server with stdio transport
- [ ] Implement health check and server info
- [ ] Test connection with Amazon Q

**Files to Create:**
- `package.json`
- `mcp-server.js`
- `config/default.json`

### Phase 2: API Client Layer (Day 2-3)

**Deliverables:**
- [ ] Create HTTP client for Statelessor API
- [ ] Implement request/response handling
- [ ] Add error handling and retries
- [ ] Add request ID generation
- [ ] Test all API endpoints

**Files to Create:**
- `utils/api-client.js`

### Phase 3: Core MCP Tools (Day 3-5)

**Tool 1: analyze_git_repository**
- Input: Git URL (HTTPS/SSH)
- Output: Analysis results with findings, complexity, actions
- Implementation: Call `/analyze` with type=git

**Tool 2: analyze_local_project**
- Input: Local project path
- Output: Analysis results
- Implementation: ZIP project → Call `/analyze` with type=zip

**Tool 3: generate_analysis_script**
- Input: Script type (bash/powershell)
- Output: Script content
- Implementation: Call `/api/script/bash` or `/api/script/powershell`

**Tool 4: get_project_findings**
- Input: Project name
- Output: Historical findings
- Implementation: Call `/findings/:projectName`

**Tool 5: explain_remediation**
- Input: Pattern category
- Output: Detailed remediation guidance
- Implementation: Load from remediation-actions.json

**Files to Create:**
- `tools/analyze-git.js`
- `tools/analyze-local.js`
- `tools/generate-script.js`
- `tools/get-findings.js`
- `tools/explain-remediation.js`

### Phase 4: Utility Functions (Day 5-6)

**Deliverables:**
- [ ] Project zipper utility
- [ ] Result formatter for Amazon Q
- [ ] Error message formatter
- [ ] Logging utility

**Files to Create:**
- `utils/project-zipper.js`
- `utils/result-formatter.js`

### Phase 5: Testing & Documentation (Day 6-7)

**Deliverables:**
- [ ] Unit tests for each tool
- [ ] Integration tests with Statelessor API
- [ ] End-to-end tests with Amazon Q
- [ ] User documentation
- [ ] Configuration guide

**Files to Create:**
- `tests/tools/*.test.js`
- `README.md`
- `CONFIGURATION.md`

### Phase 6: Deployment (Day 7-8)

**Deliverables:**
- [ ] Docker containerization
- [ ] Deployment scripts
- [ ] Environment configuration
- [ ] Monitoring setup

**Files to Create:**
- `Dockerfile`
- `docker-compose.yml`
- `.env.example`

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
