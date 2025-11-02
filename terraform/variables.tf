variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "fris-cluster"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "fris_user"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

data "aws_availability_zones" "available" {
  state = "available"
}