# Migration to Secure Architecture (VPC Link)

## Current State (What You've Completed)
- ✓ EC2 instance running with API on port 3001
- ✓ Target Group created: `statelessor-api-tg`
- ✓ EC2 registered with Target Group
- ✓ ALB Security Group created: `sg-0cfc768879f2b5190`
- ✗ **ALB created as internet-facing** (needs to be recreated)

## Required Changes

### Step 1: Delete Existing Internet-Facing ALB

```bash
# Get existing ALB ARN
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names statelessor-alb \
  --query "LoadBalancers[0].LoadBalancerArn" \
  --output text)

# Delete the internet-facing ALB
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN

# Wait 2-3 minutes for deletion to complete
```

### Step 2: Clean Up ALB Security Group Rules

```bash
# Remove the 0.0.0.0/0 rules you added
aws ec2 revoke-security-group-ingress \
  --group-id sg-0cfc768879f2b5190 \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 revoke-security-group-ingress \
  --group-id sg-0cfc768879f2b5190 \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

### Step 3: Get Required Variables

```bash
# Get VPC ID
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" \
  --output text)

# Get Subnet IDs
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0:2].SubnetId" \
  --output text)

# Get VPC CIDR
VPC_CIDR=$(aws ec2 describe-vpcs \
  --vpc-ids $VPC_ID \
  --query "Vpcs[0].CidrBlock" \
  --output text)

echo "VPC_ID: $VPC_ID"
echo "SUBNET_IDS: $SUBNET_IDS"
echo "VPC_CIDR: $VPC_CIDR"
```

### Step 4: Create Internal ALB

```bash
# Create INTERNAL ALB
aws elbv2 create-load-balancer \
  --name statelessor-alb \
  --subnets $SUBNET_IDS \
  --security-groups sg-0cfc768879f2b5190 \
  --scheme internal \
  --type application

# Note the new ALB ARN
```

### Step 5: Create ALB Listener

```bash
# Get new ALB ARN
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names statelessor-alb \
  --query "LoadBalancers[0].LoadBalancerArn" \
  --output text)

# Create HTTP listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:ap-south-1:805275918021:targetgroup/statelessor-api-tg/b656c543573dce73
```

### Step 6: Create Network Load Balancer (NLB)

```bash
# Create internal NLB
aws elbv2 create-load-balancer \
  --name statelessor-nlb \
  --subnets $SUBNET_IDS \
  --scheme internal \
  --type network

# Note the NLB ARN
NLB_ARN=$(aws elbv2 describe-load-balancers \
  --names statelessor-nlb \
  --query "LoadBalancers[0].LoadBalancerArn" \
  --output text)

echo "NLB ARN: $NLB_ARN"
```

### Step 7: Create NLB Target Group

```bash
# Create target group for NLB pointing to ALB
aws elbv2 create-target-group \
  --name statelessor-nlb-tg \
  --protocol TCP \
  --port 80 \
  --vpc-id $VPC_ID \
  --target-type alb

# Note the NLB Target Group ARN
NLB_TG_ARN=$(aws elbv2 describe-target-groups \
  --names statelessor-nlb-tg \
  --query "TargetGroups[0].TargetGroupArn" \
  --output text)

echo "NLB Target Group ARN: $NLB_TG_ARN"
```

### Step 8: Register ALB with NLB

```bash
# Register ALB as target for NLB
aws elbv2 register-targets \
  --target-group-arn $NLB_TG_ARN \
  --targets Id=$ALB_ARN
```

### Step 9: Create NLB Listener

```bash
# Create listener for NLB
aws elbv2 create-listener \
  --load-balancer-arn $NLB_ARN \
  --protocol TCP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$NLB_TG_ARN
```

### Step 10: Update ALB Security Group

```bash
# Allow traffic from VPC CIDR to ALB
aws ec2 authorize-security-group-ingress \
  --group-id sg-0cfc768879f2b5190 \
  --protocol tcp \
  --port 80 \
  --cidr $VPC_CIDR
```

### Step 11: Test the Flow

```bash
# Get NLB DNS name
NLB_DNS=$(aws elbv2 describe-load-balancers \
  --names statelessor-nlb \
  --query "LoadBalancers[0].DNSName" \
  --output text)

echo "NLB DNS: $NLB_DNS"

# Test from EC2 instance (NLB is internal)
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
curl http://$NLB_DNS/health
# Should return: {"status":"healthy","version":"1.0.0"}
```

### Step 12: Create VPC Link in API Gateway

**Via AWS Console:**
1. Go to API Gateway Console
2. Click "VPC Links" in left sidebar
3. Click "Create"
4. Name: `statelessor-vpc-link`
5. Target NLB: Select `statelessor-nlb`
6. Click "Create"
7. Wait for status "Available" (5-10 minutes)
8. **Note the VPC Link ID**

### Step 13: Continue with API Gateway Setup

Follow the updated deployment guide from **Phase 4: Step 4.2** onwards.

## Architecture Verification

Your final architecture should be:

```
API Gateway (Public)
    ↓ (VPC Link)
NLB (Internal)
    ↓ (TCP 80)
ALB (Internal) - Security Group allows VPC CIDR only
    ↓ (HTTP 3001)
EC2 (Private) - Security Group allows ALB only
```

## Security Improvements

✓ No 0.0.0.0/0 access anywhere
✓ ALB is internal (not publicly accessible)
✓ NLB is internal (not publicly accessible)
✓ Only API Gateway can reach the backend
✓ EC2 only accepts traffic from ALB
✓ ALB only accepts traffic from VPC (NLB)

## Troubleshooting

**If NLB health checks fail:**
```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn $NLB_TG_ARN

# Check ALB is registered
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:ap-south-1:805275918021:targetgroup/statelessor-api-tg/b656c543573dce73
```

**If API Gateway returns 504:**
- Verify VPC Link status is "Available"
- Check NLB DNS name is correct in API Gateway integration
- Verify ALB security group allows traffic from VPC CIDR

**If you can't test NLB from outside:**
- This is expected! NLB is internal
- Test from EC2 instance or use Systems Manager Session Manager

---

**Next Steps:**
1. Execute Steps 1-11 above
2. Create VPC Link (Step 12)
3. Continue with API Gateway setup from deployment guide
4. Test end-to-end flow
