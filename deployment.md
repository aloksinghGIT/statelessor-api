# Stateful Code Analyzer - Complete Deployment Guide

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│   React SPA     │────────▶│   NodeJS API     │
│   (S3 Bucket)   │  HTTPS  │   (EC2/Lambda)   │
└─────────────────┘         └──────────────────┘
        │                            │
        │                            │
        ▼                            ▼
  ┌──────────┐              ┌─────────────────┐
  │  Local   │              │ Code Analyzers  │
  │  Script  │              │ (.NET/Java)     │
  └──────────┘              └─────────────────┘
```

---

## Part 1: React Frontend Deployment to S3

### Step 1: Build React App

```bash
cd stateful-analyzer-frontend
npm install
npm run build
```

### Step 2: Deploy to S3

```bash
# Create S3 bucket
aws s3 mb s3://stateful-analyzer-app

# Enable static website hosting
aws s3 website s3://stateful-analyzer-app \
  --index-document index.html \
  --error-document index.html

# Upload build files
aws s3 sync build/ s3://stateful-analyzer-app \
  --acl public-read

# Configure CORS (save as cors.json)
cat > cors.json << EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors \
  --bucket stateful-analyzer-app \
  --cors-configuration file://cors.json
```

### Step 3: CloudFront (Optional but Recommended)

```bash
# Create CloudFront distribution for HTTPS
aws cloudfront create-distribution \
  --origin-domain-name stateful-analyzer-app.s3.amazonaws.com \
  --default-root-object index.html
```

**Access URL**: `http://stateful-analyzer-app.s3-website-us-east-1.amazonaws.com`

---

## Part 2: NodeJS API Deployment

### Option A: Deploy to EC2

```bash
# SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Git
sudo yum install -y git

# Clone your API code
git clone https://github.com/your-repo/analyzer-api.git
cd analyzer-api

# Install dependencies
npm install

# Install PM2 for process management
sudo npm install -g pm2

# Create analyzers directory
mkdir -p analyzers

# Start the API
pm2 start server.js --name stateful-analyzer-api
pm2 save
pm2 startup

# Configure nginx as reverse proxy
sudo yum install -y nginx

cat > /etc/nginx/conf.d/analyzer-api.conf << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 100M;
    }
}
EOF

sudo systemctl start nginx
sudo systemctl enable nginx
```

### Option B: Deploy to AWS Lambda (Serverless)

```bash
# Install Serverless Framework
npm install -g serverless

# Create serverless.yml
cat > serverless.yml << EOF
service: stateful-analyzer-api

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  timeout: 300
  memorySize: 1024
  environment:
    NODE_ENV: production

functions:
  analyze:
    handler: lambda.handler
    events:
      - http:
          path: analyze
          method: post
          cors: true
  health:
    handler: lambda.health
    events:
      - http:
          path: health
          method: get
          cors: true

plugins:
  - serverless-offline
EOF

# Create Lambda handler (lambda.js)
cat > lambda.js << 'EOF'
const serverless = require('serverless-http');
const app = require('./server');

module.exports.handler = serverless(app);
module.exports.health = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'healthy', version: '1.0.0' })
  };
};
EOF

# Deploy
serverless deploy
```

### Option C: Deploy to Docker Container

```dockerfile
# Create Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p uploads temp

EXPOSE 3001

CMD ["node", "server.js"]
```

```bash
# Build and run
docker build -t stateful-analyzer-api .
docker run -p 3001:3001 -v /var/analyzer:/app/uploads stateful-analyzer-api

# Or deploy to AWS ECS/Fargate
```

---

## Part 3: Directory Structure

### Frontend (React)
```
stateful-analyzer-frontend/
├── public/
├── src/
│   ├── App.js              # Main React component (from artifact)
│   ├── index.js
│   ├── index.css
│   └── ...
├── package.json
└── README.md
```

### Backend (NodeJS API)
```
stateful-analyzer-api/
├── server.js               # Main API server
├── analyzers/
│   ├── dotnet-analyzer.js  # .NET code analyzer
│   └── java-analyzer.js    # Java code analyzer
├── uploads/                # Temporary upload directory
├── temp/                   # Temporary extraction directory
├── package.json
└── README.md
```

---

## Part 4: Environment Configuration

### Frontend `.env`
```bash
REACT_APP_API_URL=https://api.your-domain.com
REACT_APP_VERSION=1.0.0
```

### Backend `.env`
```bash
PORT=3001
NODE_ENV=production
MAX_FILE_SIZE=104857600
ALLOWED_ORIGINS=https://your-s3-bucket.s3.amazonaws.com
```

Update React App.js line:
```javascript
const [apiEndpoint] = useState(process.env.REACT_APP_API_URL || 'http://localhost:3001');
```

---

## Part 5: Local Development Setup

### Frontend
```bash
cd stateful-analyzer-frontend
npm install
npm start
# Runs on http://localhost:3000
```

### Backend
```bash
cd stateful-analyzer-api
npm install
npm run dev
# Runs on http://localhost:3001
```

---

## Part 6: Testing the Complete Flow

### 1. Test with Local Script
```bash
# Download analyze.sh from React app
chmod +x analyze.sh
./analyze.sh

# Upload generated stateful-analysis.json to React portal
```

### 2. Test with Git URL
```bash
# In React app, paste:
https://github.com/yourusername/sample-legacy-app.git

# Click "Run Analysis"
```

### 3. Test with Zip Upload
```bash
# Zip your project
zip -r myproject.zip . -x "*/node_modules/*" "*/bin/*" "*/obj/*"

# Upload in React app
```

---

## Part 7: Production Checklist

- [ ] Frontend deployed to S3 with CloudFront
- [ ] API deployed with HTTPS (SSL certificate)
- [ ] CORS configured properly
- [ ] File upload limits set (100MB)
- [ ] Rate limiting implemented
- [ ] Error logging configured (CloudWatch, Sentry)
- [ ] Health check endpoint working
- [ ] PM2/Auto-scaling configured
- [ ] Monitoring dashboards set up
- [ ] Backup strategy for analysis results

---

## Part 8: Security Considerations

### API Security
```javascript
// Add to server.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/analyze', limiter);
```

### S3 Bucket Policy (Restrict Public Access)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::stateful-analyzer-app/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": ["your-office-ip/32"]
        }
      }
    }
  ]
}
```

---

## Troubleshooting

### Frontend can't reach API
- Check CORS settings in API
- Verify API_URL in React .env
- Check browser console for errors

### File uploads failing
- Check multer limits in server.js
- Verify nginx/ALB body size limits
- Check disk space in upload directory

### Analysis not working
- Verify analyzers directory exists
- Check file permissions
- Review API logs for errors

---

## Cost Estimates (AWS)

- **S3 + CloudFront**: ~$5-20/month (depending on traffic)
- **EC2 t3.medium**: ~$30/month
- **Lambda**: Pay per use (~$0 for low usage)
- **Total**: $35-50/month for moderate usage

---

## Next Steps

1. Deploy frontend to S3
2. Deploy API to EC2/Lambda
3. Test end-to-end with sample project
4. Add authentication (Cognito/Auth0) if needed
5. Set up CI/CD pipeline (GitHub Actions)
6. Monitor and optimize