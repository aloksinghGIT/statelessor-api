// server.js - NodeJS API for Stateful Code Analysis
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const unzipper = require('unzipper');
const crypto = require('crypto');
const { generateKeyPair } = require('crypto');
const { analyzeDotNetCode } = require('./analyzers/dotnet-analyzer');
const { analyzeJavaCode } = require('./analyzers/java-analyzer');
const { CSVTracker } = require('./utils/csv-tracker');
const { ScriptGenerator } = require('./utils/script-generator');
const { logger } = require('./utils/logger');
const { AnalysisEngine } = require('./utils/analysis-engine');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

// In-memory SSH key storage
const sshKeys = new Map();

// Cleanup expired SSH keys every hour
setInterval(() => {
  const now = new Date();
  for (const [keyId, keyData] of sshKeys.entries()) {
    if (keyData.expiresAt < now) {
      sshKeys.delete(keyId);
    }
  }
}, 60 * 60 * 1000);

// Configure multer for file uploads with session isolation
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const uploadDir = path.join(__dirname, 'uploads', `${Date.now()}-${requestId}`);
    await fsPromises.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request ID middleware for session isolation
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  logger.log(`Processing request with ID: ${requestId}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', version: '1.0.0' });
});

// Script Generation APIs
app.get('/api/script/bash', async (req, res) => {
  try {
    if (!req.requestId) {
      return res.status(400).json({
        success: false,
        error: 'X-Request-ID header is required',
        code: 'MISSING_REQUEST_ID'
      });
    }
    
    const generator = new ScriptGenerator();
    const rules = await generator.loadRules();
    const script = await generator.generateBashScript(rules, req.requestId);
    
    await logger.logScriptDownload('bash', req.get('User-Agent'), req.ip);
    
    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', 'attachment; filename="analyze.sh"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(script);
    
  } catch (error) {
    logger.error('Bash script generation failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate script',
      code: 'SCRIPT_GENERATION_FAILED'
    });
  }
});

app.get('/api/script/powershell', async (req, res) => {
  try {
    if (!req.requestId) {
      return res.status(400).json({
        success: false,
        error: 'X-Request-ID header is required',
        code: 'MISSING_REQUEST_ID'
      });
    }
    
    const generator = new ScriptGenerator();
    const rules = await generator.loadRules();
    const script = await generator.generatePowerShellScript(rules, req.requestId);
    
    await logger.logScriptDownload('powershell', req.get('User-Agent'), req.ip);
    
    res.setHeader('Content-Type', 'application/x-powershell');
    res.setHeader('Content-Disposition', 'attachment; filename="analyze.ps1"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(script);
    
  } catch (error) {
    logger.error('PowerShell script generation failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate script',
      code: 'SCRIPT_GENERATION_FAILED'
    });
  }
});

// SSH Key Generation API
app.post('/api/ssh/generate', async (req, res) => {
  try {
    // Generate ED25519 key pair
    const { publicKey, privateKey } = await new Promise((resolve, reject) => {
      generateKeyPair('ed25519', {
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) reject(err);
        else resolve({ publicKey, privateKey });
      });
    });

    // Convert to SSH format
    const sshPublicKey = convertToSSHFormat(publicKey);
    
    // Generate unique key ID
    const keyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Store key pair
    sshKeys.set(keyId, {
      publicKey: sshPublicKey,
      privateKey: privateKey,
      createdAt: new Date(),
      expiresAt: expiresAt
    });

    res.json({
      success: true,
      keyId: keyId,
      publicKey: sshPublicKey,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    logger.error('SSH key generation failed', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate SSH key',
      code: 'KEY_GENERATION_FAILED'
    });
  }
});

// Get historical findings for a project
app.get('/findings/:projectName', async (req, res) => {
  try {
    const { projectName } = req.params;
    const tracker = new CSVTracker(projectName);
    const findings = await tracker.getFindings();
    
    const engine = new AnalysisEngine();
    const complexityFactor = engine.calculateComplexityFactor(findings, 'unknown');
    const result = engine.generateSummaryAndDetails(findings, complexityFactor);
    
    res.json({
      projectName,
      scanDate: new Date().toISOString(),
      complexityFactor,
      stats: result.stats,
      summary: result.summary,
      detailed: result.detailed
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve findings', message: error.message });
  }
});

// Main analysis endpoint
app.post('/analyze', upload.single('zipFile'), async (req, res) => {
  let workingDir = null;
  let projectName = 'unknown';
  
  try {
    const { type, gitUrl, jsonData, keyId } = req.body;
    
    if (type === 'json') {
      // Process pre-analyzed JSON from local script
      const data = JSON.parse(jsonData);
      projectName = data.projectName || 'uploaded-json';
      const sessionProjectName = `${projectName}-${req.requestId.substring(0, 8)}`;
      
      await logger.logSourceUpload(sessionProjectName, 'json', 'success', `JSON upload with ${data.findings?.length || 0} findings`);
      
      const tracker = new CSVTracker(sessionProjectName);
      await tracker.addFindings(data.findings);
      
      const engine = new AnalysisEngine();
      const complexityFactor = engine.calculateComplexityFactor(data.findings, data.projectType || 'unknown');
      const actionReport = await engine.generateActionReport(data.findings, sessionProjectName, complexityFactor);
      const enrichedResults = await engine.enrichFindings(data, complexityFactor);
      
      return res.json({
        ...enrichedResults,
        sessionId: req.requestId,
        actions: actionReport
      });
    }
    
    if (type === 'git') {
      // Clone git repository with session isolation
      workingDir = path.join(__dirname, 'temp', `${Date.now()}-${req.requestId}`);
      await fsPromises.mkdir(workingDir, { recursive: true });
      
      projectName = gitUrl.split('/').pop().replace('.git', '');
      logger.log(`Cloning repository: ${gitUrl}`);
      
      // Handle SSH vs HTTPS URLs
      if (gitUrl.startsWith('git@')) {
        // Try public access first, then fall back to SSH key if needed
        try {
          await execAsync(`git clone --depth 1 ${gitUrl} ${workingDir}`);
        } catch (publicError) {
          // Public access failed, try with SSH key
          if (!keyId || !sshKeys.has(keyId)) {
            return res.status(400).json({ 
              error: 'Private repository requires SSH key. Generate a key first using /api/ssh/generate',
              code: 'SSH_KEY_REQUIRED'
            });
          }
          
          const keyData = sshKeys.get(keyId);
          const keyPath = path.join(workingDir, 'ssh_key');
          await fsPromises.writeFile(keyPath, keyData.privateKey, { mode: 0o600 });
          
          await execAsync(`GIT_SSH_COMMAND="ssh -i ${keyPath} -o StrictHostKeyChecking=no" git clone --depth 1 ${gitUrl} ${workingDir}/repo`);
          workingDir = path.join(workingDir, 'repo');
        }
      } else {
        await execAsync(`git clone --depth 1 ${gitUrl} ${workingDir}`);
      }
      
      await logger.logSourceUpload(projectName, 'git', 'success', `Cloned from ${gitUrl}`);
      
    } else if (type === 'zip' && req.file) {
      // Extract uploaded zip with session isolation
      workingDir = path.join(__dirname, 'temp', `${Date.now()}-${req.requestId}`);
      await fsPromises.mkdir(workingDir, { recursive: true });
      
      projectName = path.basename(req.file.originalname, '.zip');
      logger.log(`Extracting zip: ${req.file.path}`);
      await fs.createReadStream(req.file.path)
        .pipe(unzipper.Extract({ path: workingDir }))
        .promise();
      
      await logger.logSourceUpload(projectName, 'zip', 'success', `Uploaded file: ${req.file.originalname}`);
    } else {
      return res.status(400).json({ error: 'Invalid request type or missing file' });
    }
    
    // Detect project type
    const engine = new AnalysisEngine();
    const projectType = await engine.detectProjectType(workingDir);
    logger.log(`Detected project type: ${projectType}`);
    
    // Run appropriate analyzer
    let findings = [];
    if (projectType === 'dotnet') {
      findings = await analyzeDotNetCode(workingDir);
    } else if (projectType === 'java') {
      findings = await analyzeJavaCode(workingDir);
    } else {
      return res.status(400).json({ error: 'Unsupported project type' });
    }
    
    // Track findings in CSV with session isolation
    const sessionProjectName = `${projectName}-${req.requestId.substring(0, 8)}`;
    const tracker = new CSVTracker(sessionProjectName);
    await tracker.addFindings(findings);
    
    // Calculate complexity and generate reports
    const complexityFactor = engine.calculateComplexityFactor(findings, projectType);
    const actionReport = await engine.generateActionReport(findings, sessionProjectName, complexityFactor);
    const result = engine.generateSummaryAndDetails(findings, complexityFactor);
    
    // Clean up
    await cleanup(workingDir);
    if (req.file) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      await fsPromises.rmdir(path.dirname(req.file.path)).catch(() => {});
    }
    
    res.json({
      projectName,
      sessionId: req.requestId,
      projectType,
      scanDate: new Date().toISOString(),
      complexityFactor,
      stats: result.stats,
      summary: result.summary,
      detailed: result.detailed,
      actions: actionReport
    });
    
  } catch (error) {
    logger.error('Analysis error', error, { projectName, type: req.body.type });
    
    if (projectName !== 'unknown') {
      await logger.logSourceUpload(projectName, req.body.type || 'unknown', 'failed', error.message);
    }
    
    // Clean up on error
    if (workingDir) {
      await cleanup(workingDir);
    }
    if (req.file) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      await fsPromises.rmdir(path.dirname(req.file.path)).catch(() => {});
    }
    
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

// Helper function to convert PEM to SSH format
function convertToSSHFormat(pemPublicKey) {
  const keyData = pemPublicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');
  
  return `ssh-ed25519 ${keyData} statelessor@app`;
}

// Clean up temporary directories
async function cleanup(dir) {
  try {
    await fsPromises.rm(dir, { recursive: true, force: true });
  } catch (error) {
    logger.error('Cleanup error', error, { dir });
  }
}

app.listen(PORT, () => {
  logger.log(`Stateful Code Analyzer API running on port ${PORT}`);
});