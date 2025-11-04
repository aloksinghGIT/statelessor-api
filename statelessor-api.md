# Statelessor API Documentation

## Base URL
```
http://localhost:3001
```

## Authentication
No authentication required for current version.

---

## API Endpoints

### 1. Health Check
**GET** `/health`

**Purpose**: Check API health status

**Request**: No parameters required

**Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

---

### 2. Generate SSH Key
**POST** `/api/ssh/generate`

**Purpose**: Generate SSH key pair for Git repository access

**Request Body**:
```json
{
  "sessionId": "optional-session-identifier"
}
```

**Success Response**:
```json
{
  "success": true,
  "keyId": "uuid-v4-identifier",
  "publicKey": "ssh-ed25519 AAAAC3... statelessor@app",
  "expiresAt": "2024-01-01T12:00:00Z"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Failed to generate SSH key",
  "code": "KEY_GENERATION_FAILED"
}
```

---

### 3. Download Analysis Scripts
**GET** `/api/script/bash`
**GET** `/api/script/powershell`

**Purpose**: Download platform-specific analysis scripts with embedded rules

**Request**: No parameters required

**Response**: File download with appropriate headers
- Bash: `analyze.sh`
- PowerShell: `analyze.ps1`

**Error Response**:
```json
{
  "success": false,
  "error": "Failed to generate script",
  "code": "SCRIPT_GENERATION_FAILED"
}
```

---

### 4. Analyze Code (Main Endpoint)
**POST** `/analyze`

**Purpose**: Analyze source code for stateful patterns

#### Input Types:

##### A. Git Repository Analysis
```json
{
  "type": "git",
  "gitUrl": "https://github.com/user/repo.git"
}
```

##### B. ZIP File Upload
```
Content-Type: multipart/form-data
```
```json
{
  "type": "zip"
}
```
+ File upload field: `zipFile`

##### C. Pre-analyzed JSON Upload
```json
{
  "type": "json",
  "jsonData": "{\"projectName\":\"my-project\",\"findings\":[...]}"
}
```

#### Success Response Structure:
```json
{
  "projectName": "my-project",
  "projectType": "dotnet|java",
  "scanDate": "2024-01-01T12:00:00Z",
  "complexityFactor": 1.3,
  "stats": {
    "totalFiles": 45,
    "totalIssues": 23,
    "highSeverity": 8,
    "mediumSeverity": 12,
    "lowSeverity": 3,
    "totalEffortScore": 156.5
  },
  "summary": [
    {
      "id": 1,
      "category": "Session State",
      "severity": "high",
      "remediation": "Use IDistributedCache with Redis backend...",
      "occurrences": 5,
      "baseEffort": 25,
      "effortScore": 32.5,
      "detailIds": [1, 3, 7, 12, 15]
    }
  ],
  "detailed": [
    {
      "id": 1,
      "filename": "Controllers/UserController.cs",
      "function": "Login",
      "lineNum": 45,
      "code": "Session[\"userId\"] = user.Id;",
      "category": "Session State",
      "severity": "high",
      "remediation": "Use IDistributedCache with Redis backend..."
    }
  ],
  "actions": [
    {
      "id": "INFRA_REDIS",
      "description": "Provision and configure a distributed cache cluster (e.g., Redis)",
      "category": "Infrastructure",
      "impactType": "One-time",
      "impactSeverity": "C",
      "baseWeight": 8,
      "adjustedWeight": 10.4,
      "finalEffort": 10.4,
      "totalOccurrences": 1,
      "subActions": [
        "Setup Redis cluster or managed service",
        "Configure network security and access controls",
        "Setup monitoring and alerting"
      ],
      "affectedFindings": [
        {
          "filename": "Controllers/UserController.cs",
          "function": "Login",
          "lineNum": 45
        }
      ]
    }
  ]
}
```

#### Error Response:
```json
{
  "error": "Analysis failed",
  "message": "Detailed error message"
}
```

---

### 5. Get Historical Findings
**GET** `/findings/:projectName`

**Purpose**: Retrieve previously analyzed results

**Parameters**:
- `projectName`: URL parameter (string)

**Response**: Same structure as `/analyze` endpoint but from stored data

**Error Response**:
```json
{
  "error": "Failed to retrieve findings",
  "message": "Detailed error message"
}
```

---

## Response Field Definitions

### Stats Object
- `totalFiles`: Number of source files analyzed
- `totalIssues`: Total stateful patterns found
- `highSeverity`: Count of high-severity issues
- `mediumSeverity`: Count of medium-severity issues  
- `lowSeverity`: Count of low-severity issues
- `totalEffortScore`: Sum of all effort scores (complexity-adjusted)

### Summary Array (Expandable Tree Parent Rows)
- `id`: Unique identifier for UI expansion
- `category`: Type of stateful pattern
- `severity`: Issue severity (high/medium/low)
- `remediation`: Recommended solution approach
- `occurrences`: Number of instances found
- `baseEffort`: Base effort score before complexity adjustment
- `effortScore`: Final effort score (baseEffort × complexityFactor)
- `detailIds`: Array of detail IDs for expansion

### Detailed Array (Expandable Tree Child Rows)
- `id`: Unique identifier matching summary.detailIds
- `filename`: Relative path to source file
- `function`: Method/function name containing the issue
- `lineNum`: Line number of the problematic code
- `code`: Actual code snippet found
- `category`: Type of stateful pattern
- `severity`: Issue severity
- `remediation`: Recommended solution

### Actions Array (3rd Report - Implementation Roadmap)
- `id`: Action identifier
- `description`: What needs to be done
- `category`: Action type (Infrastructure/Code Refactoring/Configuration/Testing)
- `impactType`: One-time or Recurring
- `impactSeverity`: S/M/C (Small/Medium/Complex)
- `baseWeight`: Original effort weight (1-10 scale)
- `adjustedWeight`: Complexity-adjusted weight
- `finalEffort`: Total effort (adjustedWeight × occurrences for recurring)
- `totalOccurrences`: Number of times this action is needed
- `subActions`: Detailed implementation steps
- `affectedFindings`: List of findings requiring this action

---

## Frontend Integration Examples

### React Fetch Examples

#### 1. Analyze Git Repository
```javascript
const analyzeGitRepo = async (gitUrl) => {
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'git',
      gitUrl: gitUrl
    })
  });
  return await response.json();
};
```

#### 2. Upload ZIP File
```javascript
const analyzeZipFile = async (file) => {
  const formData = new FormData();
  formData.append('zipFile', file);
  formData.append('type', 'zip');
  
  const response = await fetch('/analyze', {
    method: 'POST',
    body: formData
  });
  return await response.json();
};
```

#### 3. Upload Pre-analyzed JSON
```javascript
const uploadAnalysisJson = async (jsonData) => {
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'json',
      jsonData: JSON.stringify(jsonData)
    })
  });
  return await response.json();
};
```

#### 4. Download Analysis Script
```javascript
const downloadScript = async (scriptType) => {
  const response = await fetch(`/api/script/${scriptType}`);
  const blob = await response.blob();
  
  // Create download link
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analyze.${scriptType === 'bash' ? 'sh' : 'ps1'}`;
  a.click();
};
```

---

## UI Display Recommendations

### 1. Expandable Tree Structure
- Use `summary` array for parent rows showing category + occurrences
- Use `detailed` array for child rows when expanded
- Link via `summary.detailIds` → `detailed.id`

### 2. Action Implementation View
- Display `actions` array as implementation roadmap
- Group by `category` (Infrastructure → Configuration → Code → Testing)
- Show `finalEffort` for project estimation
- Use `subActions` for detailed implementation steps

### 3. Progress Indicators
- Total effort: `stats.totalEffortScore`
- Complexity indicator: `complexityFactor`
- Priority matrix: `severity` × `occurrences`

---

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid parameters)
- `500`: Server error

Always check response structure and handle both success and error cases in your frontend code.