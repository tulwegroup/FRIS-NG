terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Random suffix for unique resource names
resource "random_pet" "suffix" {
  length    = 2
  separator = "-"
}

# VPC for the FRIS application
resource "aws_vpc" "fris_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "fris-vpc-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# Public subnets
resource "aws_subnet" "public_subnets" {
  count                   = 2
  vpc_id                  = aws_vpc.fris_vpc.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                      = "fris-public-subnet-${count.index}-${random_pet.suffix.id}"
    Environment                               = var.environment
    Project                                   = "FRIS"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                  = "1"
  }
}

# Private subnets
resource "aws_subnet" "private_subnets" {
  count             = 2
  vpc_id            = aws_vpc.fris_vpc.id
  cidr_block        = "10.0.${count.index + 2}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                                      = "fris-private-subnet-${count.index}-${random_pet.suffix.id}"
    Environment                               = var.environment
    Project                                   = "FRIS"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"         = "1"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "fris_igw" {
  vpc_id = aws_vpc.fris_vpc.id

  tags = {
    Name        = "fris-igw-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# Route table for public subnets
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.fris_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.fris_igw.id
  }

  tags = {
    Name        = "fris-public-rt-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# Route table associations for public subnets
resource "aws_route_table_association" "public_rta" {
  count          = 2
  subnet_id      = aws_subnet.public_subnets[count.index].id
  route_table_id = aws_route_table.public_rt.id
}

# EKS Cluster
resource "aws_eks_cluster" "fris_cluster" {
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster_role.arn
  version  = "1.28"

  vpc_config {
    subnet_ids = concat(aws_subnet.public_subnets[*].id, aws_subnet.private_subnets[*].id)
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
  ]

  tags = {
    Name        = "fris-eks-cluster-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# EKS Node Group
resource "aws_eks_node_group" "fris_nodes" {
  cluster_name    = aws_eks_cluster.fris_cluster.name
  node_group_name = "fris-node-group-${random_pet.suffix.id}"
  node_role_arn   = aws_iam_role.eks_node_role.arn
  subnet_ids      = aws_subnet.private_subnets[*].id

  scaling_config {
    desired_size = 2
    max_size     = 5
    min_size     = 1
  }

  instance_types = ["t3.medium"]

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
  ]

  tags = {
    Name        = "fris-node-group-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# IAM Role for EKS Cluster
resource "aws_iam_role" "eks_cluster_role" {
  name = "fris-eks-cluster-role-${random_pet.suffix.id}"

  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster_role.name
}

# IAM Role for EKS Nodes
resource "aws_iam_role" "eks_node_role" {
  name = "fris-eks-node-role-${random_pet.suffix.id}"

  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "ec2_container_registry_readonly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_role.name
}

# RDS PostgreSQL Database
resource "aws_db_subnet_group" "fris_db_subnet_group" {
  name       = "fris-db-subnet-group-${random_pet.suffix.id}"
  subnet_ids = aws_subnet.private_subnets[*].id

  tags = {
    Name        = "fris-db-subnet-group-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

resource "aws_security_group" "fris_db_sg" {
  name        = "fris-db-sg-${random_pet.suffix.id}"
  description = "Security group for FRIS RDS database"
  vpc_id      = aws_vpc.fris_vpc.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    security_groups = [aws_security_group.fris_app_sg.id]
  }

  tags = {
    Name        = "fris-db-sg-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

resource "aws_db_instance" "fris_database" {
  identifier             = "fris-db-${random_pet.suffix.id}"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class        = "db.t3.medium"
  allocated_storage     = 100
  storage_type          = "gp3"
  db_name               = "fris"
  username              = var.db_username
  password              = var.db_password
  db_subnet_group_name  = aws_db_subnet_group.fris_db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.fris_db_sg.id]
  skip_final_snapshot  = true

  tags = {
    Name        = "fris-database-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "fris_redis_subnet_group" {
  name        = "fris-redis-subnet-group-${random_pet.suffix.id}"
  subnet_ids  = aws_subnet.private_subnets[*].id

  tags = {
    Name        = "fris-redis-subnet-group-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

resource "aws_security_group" "fris_redis_sg" {
  name        = "fris-redis-sg-${random_pet.suffix.id}"
  description = "Security group for FRIS Redis"
  vpc_id      = aws_vpc.fris_vpc.id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    security_groups = [aws_security_group.fris_app_sg.id]
  }

  tags = {
    Name        = "fris-redis-sg-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

resource "aws_elasticache_cluster" "fris_redis" {
  cluster_id           = "fris-redis-${random_pet.suffix.id}"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t3.medium"
  port                 = 6379
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.fris_redis_subnet_group.name
  security_group_ids   = [aws_security_group.fris_redis_sg.id]
  num_cache_nodes     = 1

  tags = {
    Name        = "fris-redis-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# Security Group for FRIS Application
resource "aws_security_group" "fris_app_sg" {
  name        = "fris-app-sg-${random_pet.suffix.id}"
  description = "Security group for FRIS application"
  vpc_id      = aws_vpc.fris_vpc.id

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    security_groups = [aws_security_group.fris_lb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "fris-app-sg-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# Security Group for Load Balancer
resource "aws_security_group" "fris_lb_sg" {
  name        = "fris-lb-sg-${random_pet.suffix.id}"
  description = "Security group for FRIS load balancer"
  vpc_id      = aws_vpc.fris_vpc.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "fris-lb-sg-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

# Application Load Balancer
resource "aws_lb" "fris_lb" {
  name               = "fris-lb-${random_pet.suffix.id}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.fris_lb_sg.id]
  subnets            = aws_subnet.public_subnets[*].id

  tags = {
    Name        = "fris-lb-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

resource "aws_lb_target_group" "fris_tg" {
  name        = "fris-tg-${random_pet.suffix.id}"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.fris_vpc.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 3
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name        = "fris-tg-${random_pet.suffix.id}"
    Environment = var.environment
    Project     = "FRIS"
  }
}

resource "aws_lb_listener" "fris_http_listener" {
  load_balancer_arn = aws_lb.fris_lb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "FRIS Application - HTTP"
      status_code  = 200
    }
  }
}

# Outputs
output "eks_cluster_name" {
  value = aws_eks_cluster.fris_cluster.name
}

output "eks_cluster_endpoint" {
  value = aws_eks_cluster.fris_cluster.endpoint
}

output "database_endpoint" {
  value = aws_db_instance.fris_database.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.fris_redis.cache_nodes[0].address
}

output "load_balancer_dns" {
  value = aws_lb.fris_lb.dns_name
}