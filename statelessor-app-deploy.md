# Statelessor Application Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Machine                               │
│  ┌──────────────┐         ┌─────────────────────┐                  │
│  │  Amazon Q    │ stdio   │  MCP Server         │                  │
│  │  (IDE)       │←───────→│  (npm package)      │                  │
│  └──────────────┘         └──────────┬──────────┘                  │
│                                       │ HTTPS                        │
│  ┌──────────────┐                    │                              │
│  │  Web Browser │────────────────────┘                              │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          port2aws.pro                                │
│                         (one.com DNS)                                │
└────────────────┬────────────────────────────┬────────────────────────┘
                 │                            │
                 ▼                            ▼
┌────────────────────────────┐  ┌────────────────────────────────────┐
│  www.port2aws.pro          │  │  statelessor-api.port2aws.pro      │
│  /statelessor              │  │                                    │
└────────────┬───────────────┘  └────────────┬───────────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────────┐  ┌────────────────────────────────────┐
│  CloudFront Distribution   │  │  API Gateway (Regional)            │
│  - SSL Certificate         │  │  - REST API                        │
│  - Origin: S3 Bucket       │  │  - Custom Domain                   │
│  - Path: /statelessor/*    │  │  - SSL Certificate                 │
└────────────┬───────────────┘  └────────────┬───────────────────────┘
             │                                │ VPC Link
             ▼                                ▼
┌────────────────────────────┐  ┌────────────────────────────────────┐
│  S3 Bucket                 │  │  Network Load Balancer (Internal)  │
│  - React App (Static)      │  │  - TCP Port 3001                   │
│  - Public Read Access      │  │  - Health Check: HTTP /health      │
└────────────────────────────┘  └────────────┬───────────────────────┘
                                              │ TCP 3001
                                              ▼
                                ┌────────────────────────────────────┐
                                │  EC2 Instance (t3.medium)          │
                                │  - Node.js API (Port 3001)         │
                                │  - PM2 Process Manager             │
                                │  - Security Group: VPC CIDR only   │
                                └────────────────────────────────────┘
```

## Domain Configuration

### Primary Domain: port2aws.pro
- **Registrar**: one.com
- **DNS Management**: AWS Route 53 (recommended) or one.com

### Subdomains:
1. **www.port2aws.pro/statelessor** → React Frontend (CloudFront)
2. **statelessor-api.port2aws.pro** → REST API (API Gateway → ALB → EC2)

## Prerequisites

### AWS Account Setup
- [ ] AWS Account with appropriate permissions
- [ ] AWS CLI installed and configured
- [ ] Access to create: EC2, ALB, API Gateway, S3, CloudFront, Route 53, ACM

### Domain Setup
- [ ] Access to one.com DNS management
- [ ] Ability to create DNS records

### Development Tools
- [ ] Node.js 18+ installed
- [ ] Git installed
- [ ] SSH key pair for EC2 access

## Phase 1: SSL Certificates (AWS Certificate Manager)

### Step 1.1: Request Certificate for Frontend

```bash
# Request certificate in us-east-1 (required for CloudFront)
aws acm request-certificate \
  --domain-name "www.port2aws.pro" \
  --validation-method DNS \
  --region us-east-1
```

**Note the Certificate ARN** - you'll need it for CloudFront

### Step 1.2: Request Certificate for API

```bash
# Request certificate in your region (e.g., us-east-1)
aws acm request-certificate \
  --domain-name "statelessor-api.port2aws.pro" \
  --validation-method DNS \
  --region us-east-1
```

**Note the Certificate ARN** - you'll need it for API Gateway

### Step 1.3: Validate Certificates

1. Go to AWS ACM Console
2. For each certificate, click "Create records in Route 53" (if using Route 53)
3. OR copy CNAME records and add to one.com DNS
4. Wait for validation (5-30 minutes)

**DNS Records to add in one.com:**
```
Type: CNAME
Name: _xxxxx.www.port2aws.pro
Value: _xxxxx.acm-validations.aws.
TTL: 300

Type: CNAME
Name: _xxxxx.statelessor-api.port2aws.pro
Value: _xxxxx.acm-validations.aws.
TTL: 300
```

## Phase 2: Backend API Deployment

### Step 2.1: Launch EC2 Instance

```bash
# Create security group for EC2
aws ec2 create-security-group \
  --group-name statelessor-api-sg \
  --description "Security group for Statelessor API"

# Allow SSH from your IP
aws ec2 authorize-security-group-ingress \
  --group-name statelessor-api-sg \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32

# Allow port 3001 from ALB only (will add after ALB creation)
```

**Launch EC2 Instance:**
- AMI: Amazon Linux 2023 or Ubuntu 22.04
- Instance Type: t3.medium
- Storage: 20GB gp3
- Security Group: statelessor-api-sg
- Key Pair: Create or use existing

### Step 2.2: Configure EC2 Instance

SSH into EC2:
```bash
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

Install Node.js and dependencies:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

### Step 2.3: Deploy Application Code

```bash
# Clone repository
cd /home/ubuntu
git clone https://github.com/aloksinghGIT/statelessor-api.git
cd statelessor-api

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
PORT=3001
NODE_ENV=production
EOF

# Start with PM2
pm2 start server.js --name statelessor-api
pm2 save
pm2 startup
```

### Step 2.4: Configure PM2 Startup

```bash
# Generate startup script
pm2 startup systemd

# Copy and run the command it outputs
# Example: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Save PM2 process list
pm2 save
```

### Step 2.5: Test API Locally

```bash
curl http://localhost:3001/health
# Should return: {"status":"healthy","version":"1.0.0"}
```

## Phase 3: Network Load Balancer Setup (Direct to EC2)

### Step 3.1: Get VPC Information

```bash
# Get VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Get VPC CIDR
VPC_CIDR=$(aws ec2 describe-vpcs \
  --vpc-ids $VPC_ID \
  --query "Vpcs[0].CidrBlock" \
  --output text)

# Get subnet IDs (need at least 2 in different AZs)
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0:2].SubnetId" \
  --output text)

echo "VPC_ID: $VPC_ID"
echo "VPC_CIDR: $VPC_CIDR"
echo "SUBNET_IDS: $SUBNET_IDS"

#VPC_ID: vpc-0f0c8c1dc609a6427
#VPC_CIDR: 172.31.0.0/16
#SUBNET_IDS="subnet-08cdce0ba12547f6e subnet-04b140133fff56d82"
```

### Step 3.2: Update EC2 Security Group for NLB

```bash
# Allow traffic from VPC CIDR to EC2 on port 3001
# NLB doesn't have security groups, so we allow from entire VPC
aws ec2 authorize-security-group-ingress \
  --group-name statelessor-api-sg \
  --protocol tcp \
  --port 3001 \
  --cidr $VPC_CIDR
```

### Step 3.3: Create NLB Target Group

```bash
# Create target group for NLB pointing directly to EC2
aws elbv2 create-target-group \
  --name statelessor-nlb-tg \
  --protocol TCP \
  --port 3001 \
  --vpc-id $VPC_ID \
  --target-type instance \
  --health-check-protocol HTTP \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3

# Note the Target Group ARN
#arn:aws:elasticloadbalancing:ap-south-1:805275918021:targetgroup/statelessor-nlb-tg/58c76b3018e7dadc
```

### Step 3.4: Register EC2 Instance with NLB Target Group

```bash
# Get EC2 instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=statelessor-api" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text)

# INSTANCE_ID: i-0a78876775620b4ba

# Register EC2 instance with NLB target group
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:ap-south-1:805275918021:targetgroup/statelessor-nlb-tg/58c76b3018e7dadc \
  --targets Id=$INSTANCE_ID

# Verify registration
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:ap-south-1:805275918021:targetgroup/statelessor-nlb-tg/58c76b3018e7dadc
```

### Step 3.5: Create Network Load Balancer

```bash
# Create internal NLB (for VPC Link)
aws elbv2 create-load-balancer \
  --name statelessor-nlb \
  --subnets $SUBNET_IDS \
  --scheme internal \
  --type network

# Note the NLB ARN and DNS Name
NLB_ARN=$(aws elbv2 describe-load-balancers \
  --names statelessor-nlb \
  --query "LoadBalancers[0].LoadBalancerArn" \
  --output text)

NLB_DNS=$(aws elbv2 describe-load-balancers \
  --names statelessor-nlb \
  --query "LoadBalancers[0].DNSName" \
  --output text)

echo "NLB ARN: $NLB_ARN"
echo "NLB DNS: $NLB_DNS"
#"LoadBalancerArn": "arn:aws:elasticloadbalancing:ap-south-1:805275918021:loadbalancer/net/statelessor-nlb/92caedf7aaedf27f",
#"DNSName": "statelessor-nlb-92caedf7aaedf27f.elb.ap-south-1.amazonaws.com"
```

### Step 3.6: Create NLB Listener

```bash
# Create TCP listener on port 3001
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:ap-south-1:805275918021:loadbalancer/net/statelessor-nlb/92caedf7aaedf27f \
  --protocol TCP \
  --port 3001 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:ap-south-1:805275918021:targetgroup/statelessor-nlb-tg/58c76b3018e7dadc
```

### Step 3.7: Test NLB → EC2 Flow

```bash
# Test from within VPC (from EC2 instance)
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>

# Test NLB endpoint
curl http://statelessor-nlb-92caedf7aaedf27f.elb.ap-south-1.amazonaws.com:3001/health
# Should return: {"status":"healthy","version":"1.0.0"}

# Check target health
aws elbv2 describe-target-health \
  --target-group-arn <NLB-TARGET-GROUP-ARN>
# Should show "State": "healthy"
```

## Phase 4: API Gateway Setup with VPC Link

### Step 4.1: Create VPC Link (HTTP API)

**Via AWS Console:**
1. Go to API Gateway Console
2. Click "VPC Links" in left menu
3. Click "Create"
4. **Choose VPC Link version**: Select **"VPC link for HTTP APIs"** (not REST APIs)
5. Name: `statelessor-vpc-link`
6. VPC: Select `vpc-0f0c8c1dc609a6427` (same as NLB)
7. Subnets: Select both:
   - `subnet-08cdce0ba12547f6e`
   - `subnet-04b140133fff56d82`
8. Security groups: Select `statelessor-api-sg`
9. Click "Create"
10. Wait for status to become "Available" (5-10 minutes)
11. **Note the VPC Link ID** (e.g., `vlnk-xxxxx`)

```
# VPC Link ID - statelessor-vpc-link (xr6vtv)
```
**Why these settings?**
- HTTP API VPC Link connects at VPC level (not directly to NLB)
- Security group allows traffic from VPC CIDR to EC2 on port 3001
- VPC Link will route through NLB to reach EC2

### Step 4.2: Create HTTP API

**Why HTTP API?**
- 70% cheaper than REST API ($1.00 vs $3.50 per million requests)
- Simpler setup with automatic proxy integration
- Built-in CORS support
- Supports VPC Link for private integrations

**Via AWS Console:**
1. Go to AWS API Gateway Console
2. Click "Create API" → **"HTTP API"** → "Build"
3. Add integration:
   - Click "Add integration"
   - Integration type: **"Private resource (VPC Link)"**
   - VPC Link: Select `statelessor-vpc-link` (the one you just created)
   - URL endpoint: `http://statelessor-nlb-92caedf7aaedf27f.elb.ap-south-1.amazonaws.com:3001`
   - Method: **ANY**
   - Resource path: **`/{proxy+}`** (forwards all routes to backend)
4. Click "Next"
5. API name: `statelessor-api`
6. Click "Next" (Routes are auto-configured)
7. Stage name: `$default` (auto-deployment enabled)
8. Click "Next" → "Create"
9. **Note the Invoke URL**: `https://ciksr94xuf.execute-api.ap-south-1.amazonaws.com`

**How it works:**
- API Gateway → VPC Link → NLB (internal) → EC2 (port 3001)
- All routes (`/{proxy+}`) are forwarded to your Express backend
- Express handles routing internally

**That's it!** HTTP API automatically forwards ALL routes to your backend. No need to create individual resources/methods.

### Step 4.3: Test API Gateway → NLB → EC2 Flow

```bash
# Test from your local machine
curl https://ciksr94xuf.execute-api.ap-south-1.amazonaws.com/health
# Should return: {"status":"healthy","version":"1.0.0"}

# Test other endpoints
curl https://ciksr94xuf.execute-api.ap-south-1.amazonaws.com/api/script/bash
curl -X POST https://ciksr94xuf.execute-api.ap-south-1.amazonaws.com/api/ssh/generate
```

### Step 4.4: Configure Custom Domain

1. Go to API Gateway → Custom Domain Names
2. Click "Create"
3. Domain Name: `statelessor-api.port2aws.pro`
4. Certificate: Select ACM certificate created earlier
5. Endpoint Type: Regional
6. Click "Create"

### Step 4.5: Add API Mapping

1. In Custom Domain, click "API Mappings"
2. Click "Configure API mappings"
3. API: `statelessor-api`
4. Stage: `$default`
5. Path: (empty)
6. Save

### Step 4.6: Update DNS (Route 53 or one.com)

**Get API Gateway domain name:**
- In Custom Domain settings, copy the "API Gateway domain name"
- Format: `d-ojd6clz3l5.execute-api.ap-south-1.amazonaws.com`

**Add DNS Record:**
```
Type: CNAME
Name: statelessor-api.port2aws.pro
Value: d-ojd6clz3l5.execute-api.ap-south-1.amazonaws.com
TTL: 300
```

### Step 4.7: Test Custom Domain

```bash
# Wait 5-10 minutes for DNS propagation, then test
curl https://statelessor-api.port2aws.pro/health
# Should return: {"status":"healthy","version":"1.0.0"}
```

## Phase 5: Frontend Deployment

### Step 5.1: Create S3 Bucket (Private)

```bash
# Create bucket (keep it private - CloudFront will access it)
aws s3 mb s3://statelessor-frontend-bucket

# DO NOT enable static website hosting
# DO NOT make bucket public
# CloudFront will access via OAC (Origin Access Control)
```

### Step 5.2: Build and Upload React App

```bash
# On your local machine, in React project directory
npm run build

# Upload to S3
aws s3 sync build/ s3://statelessor-frontend-bucket/statelessor/ \
  --delete \
  --cache-control "max-age=31536000,public"

# Upload index.html without cache
aws s3 cp build/index.html s3://statelessor-frontend-bucket/statelessor/index.html \
  --cache-control "max-age=0,no-cache,no-store,must-revalidate"
```

### Step 5.3: Create CloudFront Distribution with OAC

**Via AWS Console:**
1. Go to **CloudFront Console**
2. Click **"Create Distribution"**
3. **Origin settings:**
   - Origin domain: Select `statelessor-frontend-bucket.s3.ap-south-1.amazonaws.com`
   - Origin path: `/statelessor`
   - Name: `S3-statelessor-frontend`
   - Origin access: **"Origin access control settings (recommended)"**
   - Click **"Create new OAC"**:
     - Name: `statelessor-oac`
     - Signing behavior: **"Sign requests (recommended)"**
     - Click **"Create"**
4. **Default cache behavior:**
   - Viewer protocol policy: **"Redirect HTTP to HTTPS"**
   - Allowed HTTP methods: **"GET, HEAD, OPTIONS"**
   - Cache policy: **"CachingOptimized"**
5. **Settings:**
   - Alternate domain names (CNAMEs): `www.port2aws.pro`
   - Custom SSL certificate: Select your `*.port2aws.pro` certificate (us-east-1)
   - Default root object: `index.html`
6. Click **"Create distribution"**
7. **IMPORTANT**: Copy the S3 bucket policy shown in the banner and apply it:

```bash
# CloudFront will show a policy like this - copy and save it
cat > cloudfront-bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::statelessor-frontend-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::805275918021:distribution/YOUR-DISTRIBUTION-ID"
        }
      }
    }
  ]
}
EOF

# Apply the policy
aws s3api put-bucket-policy \
  --bucket statelessor-frontend-bucket \
  --policy file://cloudfront-bucket-policy.json
```

8. **Create Custom Error Response:**
   - Go to "Error pages" tab
   - Click "Create custom error response"
   - HTTP error code: **403**
   - Response page path: `/index.html`
   - HTTP response code: **200**
   - Click "Create"

9. Wait for distribution to deploy (15-20 minutes)

### Step 5.4: Note CloudFront Domain

Copy the CloudFront distribution domain name from the console (format: `d3afqm2m8b02zo.cloudfront.net`)

### Step 5.5: Test CloudFront Distribution

```bash
# Test CloudFront URL directly
curl -I d3afqm2m8b02zo.cloudfront.net/index.html
# Should return 200 OK
```

## Phase 6: DNS Configuration

### Option A: Using AWS Route 53 (Recommended)

#### Step 6.1: Create Hosted Zone

```bash
aws route53 create-hosted-zone \
  --name port2aws.pro \
  --caller-reference $(date +%s)
```

#### Step 6.2: Update Nameservers at one.com

1. Log in to one.com
2. Go to DNS settings for port2aws.pro
3. Update nameservers to Route 53 nameservers (from hosted zone)

#### Step 6.3: Create DNS Records

```bash
# Get hosted zone ID
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name port2aws.pro \
  --query "HostedZones[0].Id" \
  --output text)

# Create A record for www.port2aws.pro → CloudFront
cat > www-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "www.port2aws.pro",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "<CLOUDFRONT-DOMAIN>",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://www-record.json

# Create A record for statelessor-api.port2aws.pro → API Gateway
cat > api-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "statelessor-api.port2aws.pro",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "<API-GATEWAY-HOSTED-ZONE-ID>",
        "DNSName": "<API-GATEWAY-DOMAIN>",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://api-record.json
```

### Option B: Using one.com DNS

Add these records in one.com DNS management:

```
Type: CNAME
Name: www
Value: <CLOUDFRONT-DOMAIN>
TTL: 3600

Type: CNAME
Name: statelessor-api
Value: <API-GATEWAY-DOMAIN>
TTL: 3600
```

## Phase 7: Testing

### Step 7.1: Test Frontend

```bash
# Wait for DNS propagation (5-30 minutes)
curl -I https://www.port2aws.pro/statelessor/

# Should return 200 OK
```

Open in browser: `https://www.port2aws.pro/statelessor/`

### Step 7.2: Test API

```bash
# Test health endpoint
curl https://statelessor-api.port2aws.pro/health

# Should return: {"status":"healthy","version":"1.0.0"}

# Test script generation
curl -H "X-Request-ID: test-123" \
  https://statelessor-api.port2aws.pro/api/script/bash \
  -o analyze.sh

# Verify script downloaded
ls -lh analyze.sh
```

### Step 7.3: Test Full Workflow

1. Open frontend: `https://statelessor.port2aws.pro/`
2. Upload a ZIP file
3. Verify analysis completes
4. Check results display correctly

## Phase 8: Monitoring and Maintenance

### Step 8.1: CloudWatch Alarms

```bash
# Create alarm for API health check failures
aws cloudwatch put-metric-alarm \
  --alarm-name statelessor-api-unhealthy \
  --alarm-description "Alert when API health check fails" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold
```

### Step 8.2: Enable CloudWatch Logs

On EC2:
```bash
# Install CloudWatch agent
sudo yum install -y amazon-cloudwatch-agent

# Configure PM2 to log to file
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Step 8.3: Backup Strategy

```bash
# Create AMI of EC2 instance weekly
aws ec2 create-image \
  --instance-id <INSTANCE-ID> \
  --name "statelessor-api-backup-$(date +%Y%m%d)" \
  --description "Weekly backup of Statelessor API"
```

## Phase 9: MCP Server Configuration

### Step 9.1: Update MCP Documentation

Users should configure MCP with production API URL:

```json
{
  "mcpServers": {
    "statelessor": {
      "command": "npx",
      "args": ["statelessor-mcp"],
      "env": {
        "STATELESSOR_API_URL": "https://statelessor-api.port2aws.pro"
      }
    }
  }
}
```

### Step 9.2: Publish MCP Package

```bash
# In statelessor-mcp directory
npm publish --access public
```

## Deployment Checklist

### Pre-Deployment
- [ ] AWS account configured
- [ ] Domain registered (port2aws.pro)
- [ ] SSL certificates requested and validated
- [ ] Code tested locally

### Backend Deployment
- [ ] EC2 instance launched and configured
- [ ] Application deployed with PM2
- [ ] ALB created and configured
- [ ] Target group healthy
- [ ] API Gateway configured
- [ ] Custom domain mapped

### Frontend Deployment
- [ ] S3 bucket created
- [ ] React app built and uploaded
- [ ] CloudFront distribution created
- [ ] Custom domain configured

### DNS Configuration
- [ ] DNS records created
- [ ] SSL certificates validated
- [ ] DNS propagation complete

### Testing
- [ ] Frontend accessible via https://www.port2aws.pro/statelessor/
- [ ] API accessible via https://statelessor-api.port2aws.pro
- [ ] Health check passing
- [ ] Full workflow tested

### Post-Deployment
- [ ] Monitoring configured
- [ ] Alarms set up
- [ ] Backup strategy implemented
- [ ] Documentation updated

## Troubleshooting

### Issue: 502 Bad Gateway from API Gateway

**Solution:**
- Check ALB target health
- Verify EC2 security group allows traffic from ALB
- Check PM2 process status: `pm2 status`
- Check application logs: `pm2 logs statelessor-api`

### Issue: CloudFront returns 403

**Solution:**
- Verify S3 bucket policy allows public read
- Check CloudFront origin path is `/statelessor`
- Verify index.html exists in S3

### Issue: DNS not resolving

**Solution:**
- Wait for DNS propagation (up to 48 hours)
- Verify DNS records are correct
- Use `dig` or `nslookup` to check DNS resolution

### Issue: SSL Certificate errors

**Solution:**
- Verify certificate is validated in ACM
- Check certificate covers the correct domain
- Ensure CloudFront/API Gateway using correct certificate

## Cost Estimation

### Monthly Costs (Approximate)

- **EC2 t3.medium**: $30-40/month
- **ALB**: $20-25/month
- **API Gateway**: $3.50 per million requests + $0.09/GB data transfer
- **S3**: $0.023/GB storage + $0.09/GB data transfer
- **CloudFront**: $0.085/GB data transfer (first 10TB)
- **Route 53**: $0.50/hosted zone + $0.40/million queries

**Estimated Total**: $60-100/month (low traffic)

## Security Best Practices

1. **Enable AWS WAF** on CloudFront and API Gateway (Phase 2)
2. **Implement rate limiting** in API Gateway
3. **Enable CloudTrail** for audit logging
4. **Use AWS Secrets Manager** for sensitive configuration
5. **Regular security updates** on EC2 instance
6. **Enable S3 bucket versioning** for frontend
7. **Implement API authentication** (Phase 2)

## Next Steps

1. Deploy backend API (Phase 2-4)
2. Deploy frontend (Phase 5)
3. Configure DNS (Phase 6)
4. Test thoroughly (Phase 7)
5. Set up monitoring (Phase 8)
6. Develop and publish MCP server
7. Gather user feedback
8. Implement API authentication (Phase 2)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-08  
**Deployment Status**: Ready for Implementation
