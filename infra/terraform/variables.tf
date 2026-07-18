variable "aws_region" {
  description = "AWS region. SRS §12 recommends an India region (ap-south-1) for DPDP data-residency."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name (staging/production)."
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs to spread subnets across."
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_name" {
  description = "Default database name."
  type        = string
  default     = "society_platform"
}

variable "db_username" {
  description = "Master username for RDS. Password is never a variable here — see secrets.tf."
  type        = string
  default     = "nestora_app"
}

variable "documents_bucket_name" {
  description = "S3 bucket name for Module 21 documents (must be globally unique)."
  type        = string
  default     = "nestora-documents-placeholder"
}
