# Simplified Deployment - NLB Direct to EC2

## Architecture

```
API Gateway (Public)
    ↓ VPC Link
NLB (Internal) - Port 3001
    ↓ TCP
EC2 - Port 3001
```

**Benefits:**
- ✓ No ALB needed (saves $20-25/month)
- ✓ Simpler architecture
- ✓ One less hop (better latency)
- ✓ Secure (no 0.0.0.0/0 access)

## What You've Already Done

- ✓ EC2 instance running with API on port 3001
- ✓ Security group created for EC2

## Steps to Complete

### Step 1: Get VPC Information

```bash
# Get VPC ID
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" \
  --output text)

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
```

### Step 2: Update EC2 Security Group

```bash
# Allow traffic from VPC CIDR to EC2 on port 3001
aws ec2 authorize-security-group-ingress \
  --group-name statelessor-api-sg \
  --protocol tcp \
  --port 3001 \
  --cidr $VPC_CIDR
```

### Step 3: Create NLB Target Group

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

# Save the Target Group ARN
NLB_TG_ARN=$(aws elbv2 describe-target-groups \
  --names statelessor-nlb-tg \
  --query "TargetGroups[0].TargetGroupArn" \
  --output text)

echo "NLB Target Group ARN: $NLB_TG_ARN"
```

### Step 4: Register EC2 with Target Group

```bash
# Get EC2 instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=statelessor-api" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text)

# Register EC2 instance
aws elbv2 register-targets \
  --target-group-arn $NLB_TG_ARN \
  --targets Id=$INSTANCE_ID

# Verify registration
aws elbv2 describe-target-health \
  --target-group-arn $NLB_TG_ARN
```

### Step 5: Create Network Load Balancer

```bash
# Create internal NLB
aws elbv2 create-load-balancer \
  --name statelessor-nlb \
  --subnets $SUBNET_IDS \
  --scheme internal \
  --type network

# Save NLB details
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
```

### Step 6: Create NLB Listener

```bash
# Create TCP listener on port 3001
aws elbv2 create-listener \
  --load-balancer-arn $NLB_ARN \
  --protocol TCP \
  --port 3001 \
  --default-actions Type=forward,TargetGroupArn=$NLB_TG_ARN
```

### Step 7: Test NLB → EC2 Flow

```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>

# Test NLB endpoint
curl http://$NLB_DNS:3001/health
# Should return: {"status":"healthy","version":"1.0.0"}

# Check target health
aws elbv2 describe-target-health --target-group-arn $NLB_TG_ARN
# Should show "State": "healthy"
```

### Step 8: Create VPC Link in API Gateway

**Via AWS Console:**
1. Go to API Gateway Console
2. Click "VPC Links" in left sidebar
3. Click "Create"
4. Name: `statelessor-vpc-link`
5. Target NLB: Select `statelessor-nlb`
6. Click "Create"
7. Wait for status "Available" (5-10 minutes)
8. **Note the VPC Link ID**

### Step 9: Create API Gateway REST API

1. Go to AWS API Gateway Console
2. Click "Create API" → "REST API" → "Build"
3. API Name: `statelessor-api`
4. Endpoint Type: Regional
5. Click "Create API"

### Step 10: Create API Gateway Resources

Create these resources:
- `/health`
- `/api/script/bash`
- `/api/script/powershell`
- `/api/ssh/generate`
- `/analyze`
- `/findings/{projectName}`

### Step 11: Configure VPC Link Integration

For each endpoint, use:
- Integration type: **VPC Link**
- Use Proxy Integration: **Yes**
- VPC Link: Select `statelessor-vpc-link`
- Endpoint URL: `http://<NLB-DNS>:3001/<path>`

**Example for GET /health:**
1. Select `/health` resource
2. Click "Actions" → "Create Method" → "GET"
3. Integration type: VPC Link
4. Use Proxy Integration: Yes
5. VPC Link: statelessor-vpc-link
6. Endpoint URL: `http://<NLB-DNS>:3001/health`
7. Save

Repeat for all endpoints.

### Step 12: Deploy API Gateway

1. Click "Actions" → "Deploy API"
2. Stage name: `prod`
3. Deploy
4. Test the invoke URL

### Step 13: Configure Custom Domain

1. Go to API Gateway → Custom Domain Names
2. Click "Create"
3. Domain Name: `statelessor-api.port2aws.pro`
4. Certificate: Select your wildcard certificate `*.port2aws.pro`
5. Endpoint Type: Regional
6. Create

### Step 14: Add API Mapping

1. In Custom Domain, click "API Mappings"
2. Click "Configure API mappings"
3. API: `statelessor-api`
4. Stage: `prod`
5. Path: (empty)
6. Save

### Step 15: Update DNS

Add CNAME record in one.com:
```
Type: CNAME
Name: statelessor-api
Value: <API-GATEWAY-DOMAIN-NAME>
TTL: 3600
```

### Step 16: Test End-to-End

```bash
# Wait for DNS propagation (5-30 minutes)
curl https://statelessor-api.port2aws.pro/health
# Should return: {"status":"healthy","version":"1.0.0"}
```

## Final Architecture

```
User → API Gateway (statelessor-api.port2aws.pro)
         ↓ VPC Link
       NLB (internal, port 3001)
         ↓ TCP
       EC2 (port 3001)
```

## Security Summary

✓ No 0.0.0.0/0 access anywhere
✓ NLB is internal (not publicly accessible)
✓ EC2 only accepts traffic from VPC CIDR
✓ API Gateway is the only public entry point
✓ SSL/TLS termination at API Gateway

## Cost Savings

- ALB removed: **-$20-25/month**
- NLB cost: **~$16/month**
- **Net savings: ~$4-9/month**
- Plus simpler architecture!

## Troubleshooting

**If NLB health checks fail:**
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn $NLB_TG_ARN

# Check EC2 security group allows VPC CIDR
aws ec2 describe-security-groups --group-names statelessor-api-sg

# Test from EC2 directly
ssh -i your-key.pem ubuntu@<EC2-IP>
curl http://localhost:3001/health
```

**If API Gateway returns 504:**
- Verify VPC Link status is "Available"
- Check NLB DNS name is correct in API Gateway
- Verify NLB target is healthy
- Check EC2 security group allows VPC CIDR on port 3001

**If DNS doesn't resolve:**
- Wait for DNS propagation (up to 48 hours)
- Verify CNAME record is correct
- Use `dig statelessor-api.port2aws.pro` to check

---

**Next Steps:**
1. Complete Steps 1-16 above
2. Deploy React frontend to S3 + CloudFront
3. Test full application flow
4. Develop and publish MCP server
