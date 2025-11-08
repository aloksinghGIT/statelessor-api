# Statelessor API Documentation

## Base URL
```
http://localhost:3001
```

## Authentication
No authentication required for current version.

## Request ID Header (Required for Concurrency)
All requests should include a unique `X-Request-ID` header to ensure session isolation:

```javascript
const requestId = crypto.randomUUID();
fetch('/analyze', {
  method: 'POST',
  headers: {
    'X-Request-ID': requestId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({...})
});
```

**Why Required**: Prevents data collision when multiple users analyze projects with same names simultaneously.

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

**Public Repository (HTTPS or SSH URL)**
```json
{
  "type": "git",
  "gitUrl": "https://github.com/user/repo.git"
}
```
```json
{
  "type": "git",
  "gitUrl": "git@github.com:user/repo.git"
}
```

**Private Repository (SSH URL with Key)**
```json
{
  "type": "git",
  "gitUrl": "git@github.com:user/private-repo.git",
  "keyId": "uuid-from-ssh-generate-endpoint"
}
```

**Client Requirements:**
- **Public repos**: Can use HTTPS or SSH URLs without `keyId`
- **Private repos**: Must use SSH URLs with valid `keyId` from `/api/ssh/generate`
- **SSH URLs without keyId**: Backend attempts public access first, falls back to error if private
- **Invalid keyId**: Returns 400 error with code `SSH_KEY_REQUIRED`

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
  "sessionId": "uuid-v4-identifier",
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

#### 1. Analyze Public Git Repository
```javascript
const analyzePublicRepo = async (gitUrl) => {
  const requestId = crypto.randomUUID();
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    },
    body: JSON.stringify({
      type: 'git',
      gitUrl: gitUrl // HTTPS or SSH URL
    })
  });
  return await response.json();
};
```

#### 1b. Analyze Private Git Repository
```javascript
const analyzePrivateRepo = async (gitUrl, keyId) => {
  const requestId = crypto.randomUUID();
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    },
    body: JSON.stringify({
      type: 'git',
      gitUrl: gitUrl, // Must be SSH URL
      keyId: keyId    // From /api/ssh/generate
    })
  });
  return await response.json();
};
```

#### 1c. Complete Git Analysis Flow
```javascript
const analyzeGitRepo = async (gitUrl, isPrivate = false, keyId = null) => {
  const requestId = crypto.randomUUID();
  const payload = {
    type: 'git',
    gitUrl: gitUrl
  };
  
  // Add keyId for private repositories
  if (isPrivate && keyId) {
    payload.keyId = keyId;
  }
  
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    },
    body: JSON.stringify(payload)
  });
  
  const result = await response.json();
  
  // Handle SSH key requirement error
  if (result.code === 'SSH_KEY_REQUIRED') {
    throw new Error('Private repository requires SSH key generation');
  }
  
  return result;
};
```

#### 2. Upload ZIP File
```javascript
const analyzeZipFile = async (file) => {
  const requestId = crypto.randomUUID();
  const formData = new FormData();
  formData.append('zipFile', file);
  formData.append('type', 'zip');
  
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: {
      'X-Request-ID': requestId
    },
    body: formData
  });
  return await response.json();
};
```

#### 3. Upload Pre-analyzed JSON
```javascript
const uploadAnalysisJson = async (jsonData) => {
  const requestId = crypto.randomUUID();
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    },
    body: JSON.stringify({
      type: 'json',
      jsonData: JSON.stringify(jsonData)
    })
  });
  return await response.json();
};
```

#### 4. Generate SSH Key for Private Repos
```javascript
const generateSSHKey = async () => {
  const requestId = crypto.randomUUID();
  const response = await fetch('/api/ssh/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    },
    body: JSON.stringify({})
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Display publicKey to user for adding to Git repository
    console.log('Add this public key to your Git repository:');
    console.log(result.publicKey);
    
    // Store keyId for later use in /analyze
    return result.keyId;
  }
  
  throw new Error(result.error);
};
```

#### 5. Download Analysis Script
```javascript
const downloadScript = async (scriptType) => {
  const requestId = crypto.randomUUID();
  const response = await fetch(`/api/script/${scriptType}`, {
    headers: {
      'X-Request-ID': requestId
    }
  });
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

### Common Error Codes:
- `SSH_KEY_REQUIRED`: Private repository needs SSH key (use `/api/ssh/generate`)
- `MISSING_REQUEST_ID`: X-Request-ID header is required
- `SCRIPT_GENERATION_FAILED`: Script template processing failed
- `KEY_GENERATION_FAILED`: SSH key pair generation failed

### Git Repository Error Scenarios:
1. **SSH URL without keyId on private repo**: Returns `SSH_KEY_REQUIRED`
2. **Invalid or expired keyId**: Returns `SSH_KEY_REQUIRED`
3. **Network/Git errors**: Returns 500 with git error message
4. **Unsupported project type**: Returns 400 with project type error

Always check response structure and handle both success and error cases in your frontend code.